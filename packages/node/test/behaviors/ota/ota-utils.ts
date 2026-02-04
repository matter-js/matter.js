/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OtaUpdateAvailableDetails, SoftwareUpdateManager } from "#behavior/system/software-update/index.js";
import { OtaSoftwareUpdateProviderServer } from "#behaviors/ota-software-update-provider";
import { OtaSoftwareUpdateRequestorServer } from "#behaviors/ota-software-update-requestor";
import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";
import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { OtaProviderEndpoint } from "#endpoints/ota-provider";
import { OtaRequestorEndpoint } from "#endpoints/ota-requestor";
import { Bytes, createPromise, Crypto, MaybePromise, StandardCrypto } from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { DclOtaUpdateService, OtaImageWriter, OtaUpdateSource, PeerAddress, PersistedFileDesignator } from "#protocol";
import { VendorId } from "#types";
import { MockSite } from "../../node/mock-site.js";

/**
 * Generate random test payload data of specified size.
 *
 * @param size - Size of payload in bytes
 * @param seed - Optional seed for reproducible random data (defaults to 0x42)
 * @returns Uint8Array filled with pseudo-random data
 */
export function generateTestPayload(size: number, seed = 0x42): Uint8Array {
    const payload = new Uint8Array(size);
    // Simple deterministic fill - XOR index with seed for variation
    for (let i = 0; i < size; i++) {
        payload[i] = (i ^ seed) & 0xff;
    }
    return payload;
}

/**
 * Options for creating a test OTA image.
 */
export interface TestOtaImageOptions {
    /** Vendor ID (defaults to 0xFFF1 - Matter test vendor) */
    vendorId?: number;
    /** Product ID (defaults to 0x8000 - Matter test product) */
    productId?: number;
    /** Software version number */
    softwareVersion: number;
    /** Software version string (defaults to "v{softwareVersion}.0.0") */
    softwareVersionString?: string;
    /** Minimum applicable software version (defaults to 0) */
    minApplicableSoftwareVersion?: number;
    /** Maximum applicable software version (defaults to softwareVersion - 1) */
    maxApplicableSoftwareVersion?: number;
    /** The payload data (binary firmware image) */
    payload: Uint8Array;
}

/**
 * Result of creating a test OTA image.
 */
export interface TestOtaImageResult {
    /** The complete OTA image as bytes */
    image: Bytes;
    /** SHA-256 checksum of the full file (base64 encoded) */
    fullFileChecksum: string;
    /** Type of checksum used */
    fullFileChecksumType: string;
    /** Update info structure for storage */
    updateInfo: DclOtaUpdateService.OtaUpdateListEntry & {
        vid: VendorId;
        pid: number;
        otaUrl: string;
        cdVersionNumber: number;
        softwareVersionValid: boolean;
        schemaVersion: number;
        minApplicableSoftwareVersion: number;
        maxApplicableSoftwareVersion: number;
        source: OtaUpdateSource;
    };
}

/**
 * Create a test OTA image using OtaImageWriter.
 *
 * This creates a valid Matter OTA image file that can be stored and used
 * for testing OTA update flows.
 *
 * @param crypto - Crypto instance for hashing
 * @param options - OTA image options
 * @returns The created OTA image and metadata
 */
export async function createTestOtaImage(crypto: Crypto, options: TestOtaImageOptions): Promise<TestOtaImageResult> {
    const {
        vendorId = 0xfff1, // Matter test vendor ID
        productId = 0x8000, // Matter test product ID
        softwareVersion,
        softwareVersionString = `v${softwareVersion}.0.0`,
        minApplicableSoftwareVersion = 0,
        maxApplicableSoftwareVersion = softwareVersion - 1,
        payload,
    } = options;

    const result = await OtaImageWriter.create(crypto, {
        vendorId,
        productId,
        softwareVersion,
        softwareVersionString,
        minApplicableSoftwareVersion,
        maxApplicableSoftwareVersion,
        payload,
    });

    // Build update info structure compatible with DclOtaUpdateService.store()
    const updateInfo = {
        vid: VendorId(vendorId),
        pid: productId,
        vendorId,
        productId,
        softwareVersion,
        softwareVersionString,
        minApplicableSoftwareVersion,
        maxApplicableSoftwareVersion,
        otaUrl: `file://test-ota-${vendorId.toString(16)}-${productId.toString(16)}-v${softwareVersion}.ota`,
        cdVersionNumber: 1,
        softwareVersionValid: true,
        schemaVersion: 0,
        filename: `${vendorId.toString(16)}-${productId.toString(16)}-test`,
        mode: "test" as const,
        source: "dcl-test" as OtaUpdateSource,
        size: result.image.byteLength,
    };

    return {
        image: result.image,
        fullFileChecksum: result.fullFileChecksum,
        fullFileChecksumType: result.fullFileChecksumType,
        updateInfo,
    };
}

/**
 * Create a ReadableStream from a Uint8Array.
 *
 * @param bytes - The bytes to stream
 * @returns A ReadableStream that yields the bytes
 */
export function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

/**
 * Store an OTA image to the DclOtaUpdateService storage.
 *
 * @param node - The ServerNode containing the DclOtaUpdateService
 * @param otaImage - The OTA image result from createTestOtaImage
 * @param isProduction - Whether this is a production image (defaults to false for test)
 * @returns The file designator for the stored image
 */
export async function storeOtaImage(node: ServerNode, otaImage: TestOtaImageResult, isProduction = false) {
    const otaService = node.env.get(DclOtaUpdateService);
    await otaService.construction;

    const stream = streamFromBytes(Bytes.of(otaImage.image));
    return await otaService.store(stream, otaImage.updateInfo, isProduction);
}

export async function addTestOtaImage(device: ServerNode, controller: ServerNode) {
    // Get device info from basicInformation
    const { vendorId, productId, softwareVersion } = device.state.basicInformation;
    const targetSoftwareVersion = softwareVersion + 1;

    // Generate 50KB of test payload data
    const payload = generateTestPayload(50 * 1024);

    // Create OTA image for next version, applicable to the current version range
    const otaImage = await createTestOtaImage(new StandardCrypto(), {
        vendorId,
        productId,
        softwareVersion: targetSoftwareVersion,
        softwareVersionString: `v${targetSoftwareVersion}.0.0`,
        minApplicableSoftwareVersion: 0,
        maxApplicableSoftwareVersion: softwareVersion,
        payload,
    });

    // Store OTA image to the controller's OTA service (test mode)
    await storeOtaImage(controller, otaImage, false /* isProduction = false for test */);

    return { otaImage, vendorId, productId, softwareVersion, targetSoftwareVersion };
}

export async function initOtaSite(
    TestOtaProviderServer: typeof OtaSoftwareUpdateProviderServer,
    TestOtaRequestorServer: typeof OtaSoftwareUpdateRequestorServer,
) {
    const site = new MockSite();
    // Device is automatically configured with vendorId 0xfff1 and productId 0x8000
    const { controller, device } = await site.addCommissionedPair({
        device: {
            type: ServerNode.RootEndpoint,
            parts: [{ id: "ota-requestor", type: OtaRequestorEndpoint.with(TestOtaRequestorServer) }],
        },
        controller: {
            type: ServerNode.RootEndpoint,
            parts: [{ id: "ota-provider", type: OtaProviderEndpoint.with(TestOtaProviderServer) }],
        },
    });

    const otaProvider = controller.parts.get("ota-provider")!;
    expect(otaProvider).not.undefined;
    const otaRequestor = device.parts.get("ota-requestor")!;
    expect(otaRequestor).not.undefined;

    // Enable test OTA images in the SoftwareUpdateManager via act()
    await otaProvider.act(agent => {
        const su = agent.get(SoftwareUpdateManager);
        su.state.allowTestOtaImages = true;
        su.state.announceAsDefaultProvider = true;
    });

    return { site, device, controller, otaProvider, otaRequestor };
}

export function InstrumentedOtaRequestorServer(
    expectedCalls: { applyUpdate?: boolean; announceOtaProvider?: boolean; requestUserConsent?: boolean },
    data?: { expectedOtaImage: Bytes },
): {
    applyUpdatePromise: Promise<void>;
    announceOtaProviderPromise: Promise<void>;
    requestUserConsentPromise: Promise<void>;
    TestOtaRequestorServer: typeof OtaSoftwareUpdateRequestorServer;
} {
    const {
        resolver: applyUpdateResolver,
        rejecter: applyUpdateRejecter,
        promise: applyUpdatePromise,
    } = createPromise<void>();
    const {
        resolver: requestUserConsentResolver,
        rejecter: requestUserConsentRejecter,
        promise: requestUserConsentPromise,
    } = createPromise<void>();
    const {
        resolver: announceOtaProviderResolver,
        rejecter: announceOtaProviderRejecter,
        promise: announceOtaProviderPromise,
    } = createPromise<void>();
    class TestOtaRequestorServer extends OtaSoftwareUpdateRequestorServer {
        override async announceOtaProvider(request: OtaSoftwareUpdateRequestor.AnnounceOtaProviderRequest) {
            try {
                if (expectedCalls.announceOtaProvider === false) {
                    announceOtaProviderRejecter(new Error("Unexpected call to announceOtaProvider"));
                }
                announceOtaProviderResolver();
                return super.announceOtaProvider(request);
            } catch (error) {
                announceOtaProviderRejecter(error);
                throw error;
            }
        }

        override async requestUserConsent(newSoftwareVersion: number, newSoftwareVersionString: string) {
            try {
                if (expectedCalls.requestUserConsent === false) {
                    requestUserConsentRejecter(new Error("Unexpected call to requestUserConsent"));
                }
                requestUserConsentResolver();
                return super.requestUserConsent(newSoftwareVersion, newSoftwareVersionString);
            } catch (error) {
                requestUserConsentRejecter(error);
                throw error;
            }
        }

        override async applyUpdate(newSoftwareVersion: number, fileDesignator: PersistedFileDesignator) {
            try {
                if (expectedCalls.applyUpdate === false) {
                    applyUpdateRejecter(new Error("Unexpected call to applyUpdate"));
                }

                expect(newSoftwareVersion).equals(1);
                // Read the received OTA image from the file designator
                const blob = await fileDesignator.openBlob();
                const receivedData = Bytes.of(await blob.arrayBuffer());

                // Compare with expected data
                expect(receivedData.byteLength).equals(data!.expectedOtaImage.byteLength);
                expect(Bytes.areEqual(receivedData, data!.expectedOtaImage)).equals(true);

                applyUpdateResolver();
            } catch (error) {
                applyUpdateRejecter(error);
            }
        }
    }

    return { applyUpdatePromise, announceOtaProviderPromise, requestUserConsentPromise, TestOtaRequestorServer };
}

/**
 * Creates an instrumented OTA Provider Server for testing that tracks method calls.
 * The returned promises resolve when the corresponding methods are called.
 *
 * @param expectedCalls - Configuration for which methods are expected to be called
 * @returns Promises for each method and the instrumented server class
 */
export function InstrumentedOtaProviderServer(expectedCalls: {
    queryImage?: boolean;
    applyUpdateRequest?: boolean;
    notifyUpdateApplied?: boolean;
    requestUserConsentForUpdate?: boolean;
    checkUpdateAvailable?: boolean;
}): {
    queryImagePromise: Promise<void>;
    applyUpdateRequestPromise: Promise<void>;
    notifyUpdateAppliedPromise: Promise<void>;
    requestUserConsentForUpdatePromise: Promise<void>;
    checkUpdateAvailablePromise: Promise<void>;
    TestOtaProviderServer: typeof OtaSoftwareUpdateProviderServer;
} {
    const {
        resolver: queryImageResolver,
        rejecter: queryImageRejecter,
        promise: queryImagePromise,
    } = createPromise<void>();
    const {
        resolver: applyUpdateRequestResolver,
        rejecter: applyUpdateRequestRejecter,
        promise: applyUpdateRequestPromise,
    } = createPromise<void>();
    const {
        resolver: notifyUpdateAppliedResolver,
        rejecter: notifyUpdateAppliedRejecter,
        promise: notifyUpdateAppliedPromise,
    } = createPromise<void>();
    const {
        resolver: requestUserConsentForUpdateResolver,
        rejecter: requestUserConsentForUpdateRejecter,
        promise: requestUserConsentForUpdatePromise,
    } = createPromise<void>();
    const {
        resolver: checkUpdateAvailableResolver,
        rejecter: checkUpdateAvailableRejecter,
        promise: checkUpdateAvailablePromise,
    } = createPromise<void>();

    class TestOtaProviderServer extends OtaSoftwareUpdateProviderServer {
        override async queryImage(
            request: OtaSoftwareUpdateProvider.QueryImageRequest,
        ): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
            try {
                if (expectedCalls.queryImage === false) {
                    queryImageRejecter(new Error("Unexpected call to queryImage"));
                }
                queryImageResolver();
                return super.queryImage(request);
            } catch (error) {
                queryImageRejecter(error);
                throw error;
            }
        }

        override async applyUpdateRequest(
            request: OtaSoftwareUpdateProvider.ApplyUpdateRequest,
        ): Promise<OtaSoftwareUpdateProvider.ApplyUpdateResponse> {
            try {
                if (expectedCalls.applyUpdateRequest === false) {
                    applyUpdateRequestRejecter(new Error("Unexpected call to applyUpdateRequest"));
                }
                applyUpdateRequestResolver();
                return super.applyUpdateRequest(request);
            } catch (error) {
                applyUpdateRequestRejecter(error);
                throw error;
            }
        }

        override notifyUpdateApplied(request: OtaSoftwareUpdateProvider.NotifyUpdateAppliedRequest): void {
            try {
                if (expectedCalls.notifyUpdateApplied === false) {
                    notifyUpdateAppliedRejecter(new Error("Unexpected call to notifyUpdateApplied"));
                }
                notifyUpdateAppliedResolver();
                return super.notifyUpdateApplied(request);
            } catch (error) {
                notifyUpdateAppliedRejecter(error);
                throw error;
            }
        }

        protected override requestUserConsentForUpdate(
            request: OtaSoftwareUpdateProvider.QueryImageRequest,
            updateDetails: OtaUpdateAvailableDetails,
            peerAddress: PeerAddress,
        ) {
            try {
                if (expectedCalls.requestUserConsentForUpdate === false) {
                    requestUserConsentForUpdateRejecter(new Error("Unexpected call to requestUserConsentForUpdate"));
                }
                requestUserConsentForUpdateResolver();
                return super.requestUserConsentForUpdate(request, updateDetails, peerAddress);
            } catch (error) {
                requestUserConsentForUpdateRejecter(error);
                throw error;
            }
        }

        protected override checkUpdateAvailable(
            request: OtaSoftwareUpdateProvider.QueryImageRequest,
            peerAddress: PeerAddress,
        ): MaybePromise<OtaUpdateAvailableDetails | undefined> {
            try {
                if (expectedCalls.checkUpdateAvailable === false) {
                    checkUpdateAvailableRejecter(new Error("Unexpected call to checkUpdateAvailable"));
                }
                checkUpdateAvailableResolver();
                return super.checkUpdateAvailable(request, peerAddress);
            } catch (error) {
                checkUpdateAvailableRejecter(error);
                throw error;
            }
        }
    }

    return {
        queryImagePromise,
        applyUpdateRequestPromise,
        notifyUpdateAppliedPromise,
        requestUserConsentForUpdatePromise,
        checkUpdateAvailablePromise,
        TestOtaProviderServer,
    };
}
