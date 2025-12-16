/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclOtaUpdateService, OtaUpdateError } from "#dcl/DclOtaUpdateService.js";
import {
    Crypto,
    DataWriter,
    Endian,
    Environment,
    HashFipsAlgorithmId,
    MockFetch,
    StorageBackendMemory,
    StorageService,
    StreamingStandardCrypto,
} from "#general";
import { OtaImageWriter } from "#ota/OtaImageWriter.js";
import { VendorId } from "#types";
import { createOtaImage, createVersionMetadata, mockVersionsList } from "./dcl-ota-test-helpers.js";

describe("DclOtaUpdateService", () => {
    let fetchMock: MockFetch;
    let environment: Environment;
    let storage: StorageBackendMemory;
    const crypto = new StreamingStandardCrypto();

    beforeEach(async () => {
        fetchMock = new MockFetch();
        environment = new Environment("test");

        // Set up storage - just create the backend, StorageService will manage initialization
        storage = new StorageBackendMemory();

        // Add services to environment
        new StorageService(environment, (_namespace: string) => storage);
        environment.set(Crypto, crypto);
    });

    afterEach(async () => {
        fetchMock.uninstall();
    });

    describe("checkForUpdate", () => {
        it("finds available update when newer version exists", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", createVersionMetadata(3));
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 2,
                isProduction: true,
            });

            expect(update).to.not.be.undefined;
            expect(update?.softwareVersion).to.equal(3);
            expect(update?.softwareVersionString).to.equal("v3.0.0");
            expect(update?.otaUrl).to.equal("https://example.com/ota-v3.bin");
            expect(update?.otaFileSize).to.equal(1024);
        });

        it("returns undefined when no newer versions available", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 3,
                isProduction: true,
            });

            expect(update).to.be.undefined;
        });

        it("skips invalid versions and finds next valid one", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", createVersionMetadata(3, false)); // Invalid
            fetchMock.addResponse("/dcl/model/versions/65521/32768/2", createVersionMetadata(2, true)); // Valid
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
            });

            expect(update).to.not.be.undefined;
            expect(update?.softwareVersion).to.equal(2);
        });

        it("skips versions without OTA URL", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", createVersionMetadata(3, true, false)); // No OTA
            fetchMock.addResponse("/dcl/model/versions/65521/32768/2", createVersionMetadata(2, true, true)); // Has OTA
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
            });

            expect(update).to.not.be.undefined;
            expect(update?.softwareVersion).to.equal(2);
        });

        it("returns undefined when all newer versions are invalid", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", createVersionMetadata(3, false));
            fetchMock.addResponse("/dcl/model/versions/65521/32768/2", createVersionMetadata(2, false));
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
            });

            expect(update).to.be.undefined;
        });

        it("checks version applicability range", async () => {
            const metadata3 = createVersionMetadata(3, true, true, {
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
            });

            const metadata2 = createVersionMetadata(2, true, true, {
                minApplicableSoftwareVersion: 0,
                maxApplicableSoftwareVersion: 0,
            });

            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", metadata3);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/2", metadata2);
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            // Current version 2 is within range [2, 2]
            const update1 = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 2,
                isProduction: true,
            });
            expect(update1).to.not.be.undefined;
            expect(update1?.softwareVersion).to.equal(3);

            // Current version 1 is below range [2, 2] for v3, but version 2 is also not applicable (range [0, 0])
            fetchMock.clearCallLog();
            const update2 = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
            });
            expect(update2).to.be.undefined;
        });

        it("returns no update on DCL fetch failure", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768", { error: "Not found" }, { status: 404 });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            expect(
                await service.checkForUpdate({
                    vendorId: 0xfff1,
                    productId: 0x8000,
                    currentSoftwareVersion: 1,
                    isProduction: true,
                }),
            ).to.be.undefined;
        });

        it("uses test DCL when production is false", async () => {
            // Add less specific mock first, more specific last (they're checked in reverse order)
            fetchMock.addResponse("test-net.dcl.csa-iot.org/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse(
                "test-net.dcl.csa-iot.org/dcl/model/versions/65521/32768/3",
                createVersionMetadata(3),
            );
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 2,
                isProduction: false,
            });

            expect(update).to.not.be.undefined;
            const callLog = fetchMock.getCallLog();
            expect(callLog.some(call => call.url.includes("test-net"))).to.be.true;
        });

        it("checks for a specific target version when provided", async () => {
            // Only need to mock the specific version, not the versions list
            fetchMock.addResponse("/dcl/model/versions/65521/32768/2", createVersionMetadata(2));
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
                targetSoftwareVersion: 2,
            }); // Current: 1, Target: 2

            expect(update).to.not.be.undefined;
            expect(update?.softwareVersion).to.equal(2);

            // Verify that the versions list endpoint was NOT called
            const callLog = fetchMock.getCallLog();
            expect(callLog.length).to.equal(1);
            expect(callLog[0].url).to.include("/dcl/model/versions/65521/32768/2");
        });

        it("returns undefined when target version is not applicable", async () => {
            const metadata = createVersionMetadata(3, true, true, {
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
            });

            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", metadata);
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            // Current version 1 is outside the applicable range [2, 2]
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
                targetSoftwareVersion: 3,
            });

            expect(update).to.be.undefined;
        });

        it("rejects DCL versions with non-HTTPS OTA URLs", async () => {
            // DCL should never provide non-HTTPS URLs, but we should handle it gracefully
            const metadata = createVersionMetadata(3, true, true, {
                otaUrl: "http://insecure.example.com/ota-v3.bin", // Invalid: not HTTPS
            });

            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", metadata);
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 2,
                isProduction: true,
            });

            // Should return undefined because the URL is not HTTPS
            expect(update).to.be.undefined;
        });

        it("rejects DCL versions with file:// protocol URLs", async () => {
            const metadata = createVersionMetadata(2, true, true, {
                otaUrl: "file:///tmp/ota-v2.bin", // Invalid: DCL shouldn't provide file:// URLs
            });

            // Create a custom versions list with only version 2 to avoid querying unmocked version 3
            const customVersionsList = {
                modelVersions: {
                    vid: VendorId(0xfff1),
                    pid: 0x8000,
                    softwareVersions: [2], // Only version 2
                    schemaVersion: 0,
                },
            };

            fetchMock.addResponse("/dcl/model/versions/65521/32768", customVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/2", metadata);
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 1,
                isProduction: true,
            });

            // Should return undefined because DCL URLs must be HTTPS
            expect(update).to.be.undefined;
        });
    });

    describe("downloadUpdate", () => {
        it("downloads and validates OTA image successfully", async () => {
            // Create a valid OTA image
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8000, 3);

            // Mock update info - using DeviceSoftwareVersionModelDclSchema structure
            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            // Mock OTA file download
            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            const fileDesignator = await service.downloadUpdate(updateInfo, true);

            // Verify file was created
            expect(fileDesignator.exists()).to.be.true;
            expect(fileDesignator.blobName).to.equal("fff1-8000-prod");
            expect(fileDesignator.text).to.equal("ota/fff1-8000-prod");

            // Verify stored in storage with correct filename
            const stored = await fileDesignator.openBlob();
            expect(stored).to.not.be.null;
        });

        it("throws error on download failure", async () => {
            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", { error: "Not found" }, { status: 404 });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(
                OtaUpdateError,
                /Failed to download OTA image/,
            );
        });

        it("throws error on vendor ID mismatch", async () => {
            // Create OTA image with wrong vendor ID
            const otaImage = await createOtaImage(crypto, 0xfff2, 0x8000, 3); // Wrong VID

            const updateInfo = {
                vid: VendorId(0xfff1), // Expected VID
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(
                OtaUpdateError,
                /vendor ID mismatch/,
            );
        });

        it("throws error on product ID mismatch", async () => {
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8001, 3); // Wrong PID

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000, // Expected PID
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(
                OtaUpdateError,
                /product ID mismatch/,
            );
        });

        it("throws error on software version mismatch", async () => {
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8000, 4); // Wrong version

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3, // Expected version
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(
                OtaUpdateError,
                /software version mismatch/,
            );
        });

        it("validates OTA image digest", async () => {
            // Create OTA image with wrong payload to cause digest mismatch
            const writer = new DataWriter(Endian.Little);
            writer.writeUInt32(0x1beef11e);
            writer.writeUInt64(100n); // Wrong size
            writer.writeUInt32(10);
            writer.writeByteArray(new Uint8Array(90)); // Garbage data
            const badOtaImage = writer.toByteArray();

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: badOtaImage.length,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", badOtaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejected;
        });

        it("errors when trying to download file:// protocol for local files", async () => {
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8000, 3);

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "file:///tmp/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            // Mock file:// URL
            fetchMock.addResponse("file:///tmp/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(/Unsupported protocol "file:"/);
        });

        it("reuses existing valid OTA file instead of re-downloading", async () => {
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8000, 3);

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            // First download
            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            const fileDesignator1 = await service.downloadUpdate(updateInfo, true);
            expect(fileDesignator1.exists()).to.be.true;

            // Clear fetch mock to ensure no new download
            fetchMock.clearResponses();

            // Second call should reuse existing file without downloading
            const fileDesignator2 = await service.downloadUpdate(updateInfo, true);
            expect(fileDesignator2.exists()).to.be.true;
            expect(fileDesignator2.text).to.equal(fileDesignator1.text);

            // Verify no additional fetch was made
            const callLog = fetchMock.getCallLog();
            expect(callLog.length).to.equal(1); // Only the first download
        });

        it("throws error for unsupported protocols", async () => {
            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "ftp://example.com/ota-v3.bin", // Unsupported protocol
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(
                OtaUpdateError,
                /Unsupported protocol "ftp:" in OTA URL/,
            );
        });

        it("throws error for invalid URLs", async () => {
            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "not-a-valid-url", // Invalid URL
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            const service = new DclOtaUpdateService(environment);

            await expect(service.downloadUpdate(updateInfo, true)).to.be.rejectedWith(
                OtaUpdateError,
                /Invalid OTA URL/,
            );
        });
    });

    describe("integration", () => {
        it("checks for update and downloads it", async () => {
            // Create OTA image first to get correct size and checksum
            const otaResult = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                payload: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
            });
            const otaImage = otaResult.image;

            // Create metadata with correct OTA file size and checksum
            const metadata = createVersionMetadata(3, true, true, {
                otaFileSize: otaImage.byteLength,
                otaChecksum: otaResult.fullFileChecksum,
                otaChecksumType: HashFipsAlgorithmId[otaResult.fullFileChecksumType],
            });

            // Mock version check
            fetchMock.addResponse("/dcl/model/versions/65521/32768", mockVersionsList);
            fetchMock.addResponse("/dcl/model/versions/65521/32768/3", metadata);
            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            // Check for update
            const update = await service.checkForUpdate({
                vendorId: 0xfff1,
                productId: 0x8000,
                currentSoftwareVersion: 2,
                isProduction: true,
            });
            expect(update).to.not.be.undefined;
            expect(update?.otaFileSize).to.equal(otaImage.byteLength);

            // Download and validate
            const fileDesignator = await service.downloadUpdate(update!, true);

            expect(fileDesignator.exists()).to.be.true;
            expect(fileDesignator.blobName).to.equal("fff1-8000-prod");
            expect(fileDesignator.text).to.equal("ota/fff1-8000-prod");
        });
    });

    describe("find", () => {
        it("lists all stored OTA images", async () => {
            const otaImage1 = await createOtaImage(crypto, 0xfff1, 0x8000, 3);
            const otaImage2 = await createOtaImage(crypto, 0xfff1, 0x8001, 2);
            const otaImage3 = await createOtaImage(crypto, 0xfff2, 0x8000, 1);

            // Download multiple images
            const updateInfo1 = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota1.bin",
                otaFileSize: otaImage1.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            const updateInfo2 = {
                vid: VendorId(0xfff1),
                pid: 0x8001,
                softwareVersion: 2,
                softwareVersionString: "v2.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota2.bin",
                otaFileSize: otaImage2.byteLength,
                minApplicableSoftwareVersion: 1,
                maxApplicableSoftwareVersion: 1,
                schemaVersion: 0,
            };

            const updateInfo3 = {
                vid: VendorId(0xfff2),
                pid: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota3.bin",
                otaFileSize: otaImage3.byteLength,
                minApplicableSoftwareVersion: 0,
                maxApplicableSoftwareVersion: 0,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota1.bin", otaImage1, { binary: true });
            fetchMock.addResponse("https://example.com/ota2.bin", otaImage2, { binary: true });
            fetchMock.addResponse("https://example.com/ota3.bin", otaImage3, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            await service.downloadUpdate(updateInfo1, true);
            await service.downloadUpdate(updateInfo2, true);
            await service.downloadUpdate(updateInfo3, false); // Test mode

            // List all
            const allUpdates = await service.find({});
            expect(allUpdates.length).to.equal(3);

            // Filter by vendor
            const vendor1Updates = await service.find({ vendorId: 0xfff1 });
            expect(vendor1Updates.length).to.equal(2);

            // Filter by vendor and product
            const specificProduct = await service.find({ vendorId: 0xfff1, productId: 0x8000 });
            expect(specificProduct.length).to.equal(1);
            expect(specificProduct[0].vendorId).to.equal(0xfff1);
            expect(specificProduct[0].productId).to.equal(0x8000);

            // Filter by mode
            const testModeUpdates = await service.find({ isProduction: false });
            expect(testModeUpdates.length).to.equal(1);
            expect(testModeUpdates[0].vendorId).to.equal(0xfff2);
        });

        it("returns empty array when no updates are stored", async () => {
            const service = new DclOtaUpdateService(environment);
            const updates = await service.find({});
            expect(updates).to.be.an("array");
            expect(updates.length).to.equal(0);
        });
    });

    describe("delete", () => {
        beforeEach(async () => {
            // Store some test images
            const otaImage1 = await createOtaImage(crypto, 0xfff1, 0x8000, 3);
            const otaImage2 = await createOtaImage(crypto, 0xfff1, 0x8001, 2);

            const updateInfo1 = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota1.bin",
                otaFileSize: otaImage1.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            const updateInfo2 = {
                vid: VendorId(0xfff1),
                pid: 0x8001,
                softwareVersion: 2,
                softwareVersionString: "v2.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota2.bin",
                otaFileSize: otaImage2.byteLength,
                minApplicableSoftwareVersion: 1,
                maxApplicableSoftwareVersion: 1,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota1.bin", otaImage1, { binary: true });
            fetchMock.addResponse("https://example.com/ota2.bin", otaImage2, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            await service.downloadUpdate(updateInfo1, true);
            await service.downloadUpdate(updateInfo2, true);
        });

        it("deletes specific OTA file by filename", async () => {
            const service = new DclOtaUpdateService(environment);

            const countBefore = (await service.find({})).length;
            expect(countBefore).to.equal(2);

            expect(await service.delete({ filename: "fff1-8000-prod" })).to.equal(1);

            const countAfter = (await service.find({})).length;
            expect(countAfter).to.equal(1);

            const remaining = await service.find({});
            expect(remaining[0].productId).to.equal(0x8001);
        });

        it("deletes specific product file", async () => {
            const service = new DclOtaUpdateService(environment);

            await service.delete({ vendorId: 0xfff1, productId: 0x8000, isProduction: true });

            const remaining = await service.find({});
            expect(remaining.length).to.equal(1);
            expect(remaining[0].productId).to.equal(0x8001);
        });

        it("deletes all files for a vendor", async () => {
            const service = new DclOtaUpdateService(environment);

            const deleted = await service.delete({ vendorId: 0xfff1, isProduction: true });
            expect(deleted).to.equal(2);

            const remaining = await service.find({});
            expect(remaining.length).to.equal(0);
        });

        it("does not throw error when file not found with correct pattern", async () => {
            const service = new DclOtaUpdateService(environment);

            expect(await service.delete({ filename: "0-0-test" })).equal(0);
        });

        it("throws error when file not found with invalid pattern", async () => {
            const service = new DclOtaUpdateService(environment);

            await expect(service.delete({ filename: "nonexistent" })).to.be.rejectedWith(/Invalid OTA filename format/);
        });

        it("throws no error when specific product not found", async () => {
            const service = new DclOtaUpdateService(environment);

            expect(await service.delete({ vendorId: 0xfff1, productId: 0x9999, isProduction: true })).equal(0);
        });
    });

    describe("force download", () => {
        it("re-downloads file when force is true", async () => {
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8000, 3);

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);

            // First download
            const fileDesignator1 = await service.downloadUpdate(updateInfo, true, false);
            expect(fileDesignator1.exists()).to.be.true;

            const callCountAfterFirst = fetchMock.getCallLog().length;

            // Second download without force - should reuse
            await service.downloadUpdate(updateInfo, true, false);
            expect(fetchMock.getCallLog().length).to.equal(callCountAfterFirst); // No new download

            // Third download with force - should re-download
            await service.downloadUpdate(updateInfo, true, true);
            expect(fetchMock.getCallLog().length).to.be.greaterThan(callCountAfterFirst); // New download occurred
        });
    });

    describe("fileDesignatorForUpdate", () => {
        it("returns file designator for existing file", async () => {
            const otaImage = await createOtaImage(crypto, 0xfff1, 0x8000, 3);

            const updateInfo = {
                vid: VendorId(0xfff1),
                pid: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                cdVersionNumber: 1,
                softwareVersionValid: true,
                otaUrl: "https://example.com/ota-v3.bin",
                otaFileSize: otaImage.byteLength,
                minApplicableSoftwareVersion: 2,
                maxApplicableSoftwareVersion: 2,
                schemaVersion: 0,
            };

            fetchMock.addResponse("https://example.com/ota-v3.bin", otaImage, { binary: true });
            fetchMock.install();

            const service = new DclOtaUpdateService(environment);
            await service.downloadUpdate(updateInfo, true);

            const fileDesignator = await service.fileDesignatorForUpdate("fff1-8000-prod");
            expect(fileDesignator).to.not.be.undefined;
            expect(fileDesignator.blobName).to.equal("fff1-8000-prod");
            expect(fileDesignator.text).to.equal("ota/fff1-8000-prod");
            expect(await fileDesignator.exists()).to.be.true;
        });

        it("throws error for non-existent file with invalid pattern", async () => {
            const service = new DclOtaUpdateService(environment);

            await expect(service.fileDesignatorForUpdate("nonexistent")).to.be.rejectedWith(
                /Invalid OTA filename format/,
            );
        });

        it("throws error for non-existent file with valid pattern", async () => {
            const service = new DclOtaUpdateService(environment);

            await expect(service.fileDesignatorForUpdate("0-0-test")).to.be.rejectedWith(/OTA file not found/);
        });
    });
});
