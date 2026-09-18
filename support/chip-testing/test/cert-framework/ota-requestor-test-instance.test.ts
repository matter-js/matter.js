/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StandardCrypto } from "@matter/general";
import { OtaSoftwareUpdateRequestorServer } from "@matter/main/behaviors/ota-software-update-requestor";
import { OtaImageWriter } from "@matter/main/protocol";
import { NodeId, VendorId } from "@matter/main/types";
import type { CertNodeRef } from "@matter/testing";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters/ota-software-update-requestor";
import { expect } from "chai";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";
import { OtaRequestorTestInstance, verifyOtaTestTransfer } from "../../src/OtaRequestorTestInstance.js";
import {
    OTA_TEST_PAYLOAD_SIZE,
    OTA_TEST_PRODUCT_ID,
    OTA_TEST_SOFTWARE_VERSION,
    OTA_TEST_VENDOR_ID,
    otaTestPayload,
    otaTestSoftwareVersionString,
} from "../../src/OtaTestIdentity.js";
import { runCleanups } from "../cert/tc-support.js";

/** The endpoint {@link OtaRequestorTestInstance} assigns its OTA Requestor device type. */
const OTA_REQUESTOR_ENDPOINT = 1;

/** Kept clear of the 5540 every other subject defaults to, so a start here cannot lose a port race. */
const REQUESTOR_PORT = 5560;
const REQUESTOR_DISCRIMINATOR = 3860;
const REQUESTOR_PASSCODE = 20202021;

const crypto = new StandardCrypto();

/** An OTA file as {@link OtaProviderTestInstance} stages it, unless an option overrides part of it. */
async function testOtaImage(
    options: { softwareVersionString?: string; payload?: Uint8Array; softwareVersion?: number } = {},
) {
    const {
        softwareVersion = OTA_TEST_SOFTWARE_VERSION,
        softwareVersionString = otaTestSoftwareVersionString("spec"),
        payload = otaTestPayload(),
    } = options;

    const { image } = await OtaImageWriter.create(crypto, {
        vendorId: OTA_TEST_VENDOR_ID,
        productId: OTA_TEST_PRODUCT_ID,
        softwareVersion,
        softwareVersionString,
        minApplicableSoftwareVersion: 0,
        maxApplicableSoftwareVersion: softwareVersion - 1,
        payload,
    });

    return Bytes.of(image);
}

/** The copy re-types the view onto a plain `ArrayBuffer`, which `BlobPart` requires. */
function blobOf(bytes: Uint8Array) {
    return new Blob([new Uint8Array(bytes)]);
}

describe("verifyOtaTestTransfer", () => {
    it("accepts the image OtaProviderTestInstance stages", async () => {
        const header = await verifyOtaTestTransfer(crypto, blobOf(await testOtaImage()), OTA_TEST_SOFTWARE_VERSION);

        expect(header.softwareVersion).equal(OTA_TEST_SOFTWARE_VERSION);
        expect(Number(header.payloadSize)).equal(OTA_TEST_PAYLOAD_SIZE);
    });

    it("rejects a payload with a single byte altered", async () => {
        const image = await testOtaImage();

        // Past the header, so the digest the header carries no longer describes the payload
        image[image.byteLength - 1] ^= 0xff;

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /digest mismatch/,
        );
    });

    it("rejects a truncated transfer", async () => {
        const image = await testOtaImage();

        await expect(
            verifyOtaTestTransfer(
                crypto,
                blobOf(image.subarray(0, image.byteLength - 1024)),
                OTA_TEST_SOFTWARE_VERSION,
            ),
        ).to.be.rejectedWith(/size mismatch/);
    });

    it("rejects an all-zero payload of the right length", async () => {
        const image = await testOtaImage({ payload: new Uint8Array(OTA_TEST_PAYLOAD_SIZE) });

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /does not carry the staged payload/,
        );
    });

    it("rejects a payload of the wrong length", async () => {
        const image = await testOtaImage({ payload: otaTestPayload(1024) });

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /carries 1024 payload bytes, expected/,
        );
    });

    it("rejects an image that is not the version the provider announced", async () => {
        const image = await testOtaImage();

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION + 1)).to.be.rejectedWith(
            /but the provider announced/,
        );
    });

    it("accepts a foreign provider's image, whose payload this process cannot predict", async () => {
        const payload = new Uint8Array(2048);
        payload.fill(0xa5);
        const image = await testOtaImage({ softwareVersionString: "chip-ota-test-image", payload });

        const header = await verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION);

        expect(header.softwareVersionString).equal("chip-ota-test-image");
    });

    it("rejects a foreign provider's image with no payload", async () => {
        const image = await testOtaImage({ softwareVersionString: "chip-ota-test-image", payload: new Uint8Array(0) });

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /carries no payload/,
        );
    });
});

describe("OtaRequestorTestInstance", () => {
    it("exposes OtaSoftwareUpdateRequestorServer on its own endpoint, below the root", async () => {
        const instance = new OtaRequestorTestInstance({ commandPipeFactory: async () => {} });
        await instance.initialize();
        try {
            const endpoint = instance.node.parts.get("ota-requestor");
            expect(endpoint, "the subject adds an ota-requestor part").not.undefined;
            expect(endpoint!.number).equal(OTA_REQUESTOR_ENDPOINT);
            expect(endpoint!.behaviors.has(OtaSoftwareUpdateRequestorServer)).equal(true);
        } finally {
            await instance.close();
        }
    });

    it("reports an identity that tells it apart from another subject on the same fabric", async () => {
        const one = new OtaRequestorTestInstance({ domain: "identity-one", commandPipeFactory: async () => {} });
        const two = new OtaRequestorTestInstance({ domain: "identity-two", commandPipeFactory: async () => {} });
        await one.initialize();
        try {
            await two.initialize();
            try {
                const first = one.node.state.basicInformation;
                const second = two.node.state.basicInformation;

                expect(first.uniqueId).not.equal(second.uniqueId);
                expect(first.serialNumber).not.equal(second.serialNumber);

                // The Basic Information cluster requires the two to differ
                expect(first.uniqueId).not.equal(first.serialNumber);
            } finally {
                await two.close();
            }
        } finally {
            await one.close();
        }
    });

    it("commissions, comes online, and accepts an OTA provider announcement", async function () {
        this.timeout(30_000);

        const device = new OtaRequestorTestInstance({
            domain: `ota-requestor-test-${Math.random().toString(36).slice(2)}`,
            commandPipeFactory: async () => {},
            discriminator: REQUESTOR_DISCRIMINATOR,
            passcode: REQUESTOR_PASSCODE,
            port: REQUESTOR_PORT,
        });
        await device.initialize();
        await device.start();

        // NodeTestInstance.start() logs a start failure and returns normally, so without this a port
        // already in use would surface a minute later as a commissioning timeout blaming mDNS.
        expect(device.node.lifecycle.isOnline, "the subject is listening after start()").equal(true);

        const adapter = new InProcessControllerAdapter("ota-requestor-dut");
        await adapter.start();

        // Cleanup runs regardless of what happens in the body: `ref` may never get set because
        // commissioning itself failed.
        let ref: CertNodeRef | undefined;
        let bodyFailure: unknown;
        try {
            ref = await adapter.commission({ passcode: REQUESTOR_PASSCODE, discriminator: REQUESTOR_DISCRIMINATOR });
            const node = adapter.node(ref);

            const endpoints = await node.clientEndpoints();
            const requestorEndpoint = endpoints.find(entry => entry.endpoint === OTA_REQUESTOR_ENDPOINT);
            expect(requestorEndpoint, "the peer reports its OTA requestor endpoint").not.undefined;

            // The command is Administer-scoped, so the commissioner (which already holds Administer on the
            // fabric it just created) can invoke it directly without any additional access grant — unlike
            // OtaProviderTestInstance's QueryImage, which a non-admin peer must also be able to reach.
            await node.invoke(
                "OtaSoftwareUpdateRequestor",
                "announceOtaProvider",
                {
                    providerNodeId: NodeId(1),
                    vendorId: VendorId(0xfff1),
                    announcementReason: OtaSoftwareUpdateRequestor.AnnouncementReason.SimpleAnnouncement,
                    endpoint: 1,
                },
                OTA_REQUESTOR_ENDPOINT,
            );
        } catch (error) {
            bodyFailure = error;
        }

        // Every cleanup runs, in teardown order, even if an earlier one throws. A cleanup failure
        // replaces a passing body's result, but never a failing one — the body's own error is the
        // actual defect under test, and a cleanup failure on top of it is logged instead of thrown.
        try {
            await runCleanups(
                () => (ref === undefined ? Promise.resolve() : adapter.node(ref).decommission()),
                () => adapter.close(),
                () => device.close(),
            );
        } catch (cleanupFailure) {
            if (bodyFailure === undefined) {
                throw cleanupFailure;
            }
            console.warn("OtaRequestorTestInstance cleanup failed after the test body already failed:", cleanupFailure);
        }

        if (bodyFailure !== undefined) {
            throw bodyFailure;
        }
    });
});
