/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, HASH_ALGORITHM_OUTPUT_LENGTHS, HashFipsAlgorithmId, StandardCrypto } from "#general";
import { OtaImageReader } from "#ota/OtaImageReader.js";
import { OtaImageWriter } from "#ota/OtaImageWriter.js";

describe("OtaImageWriter", () => {
    const crypto = new StandardCrypto();

    describe("create", () => {
        it("creates a valid OTA image with all required fields", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 5,
                softwareVersionString: "v5.0.0",
                minApplicableSoftwareVersion: 4,
                maxApplicableSoftwareVersion: 4,
                payload,
            });

            expect(Bytes.isBytes(result.image)).equals(true);
            expect(result.image.byteLength).to.be.greaterThan(payload.byteLength);
            expect(result.fullFileChecksum).to.be.a("string");
            expect(result.fullFileChecksumType).to.equal("SHA-256");

            // Verify file starts with correct identifier
            const view = new DataView(Bytes.of(result.image).buffer);
            expect(view.getUint32(0, true)).to.equal(0x1beef11e);
        });

        it("creates OTA image without optional min/max versions", async () => {
            const payload = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 10,
                softwareVersionString: "v10.0.0",
                payload,
            });

            expect(Bytes.isBytes(result.image)).equals(true);

            // Verify it's a valid OTA file
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.minApplicableSoftwareVersion).to.be.undefined;
            expect(header.maxApplicableSoftwareVersion).to.be.undefined;
        });

        it("creates OTA image with optional releaseNotesUrl", async () => {
            const payload = new Uint8Array([0x11, 0x22, 0x33]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 3,
                softwareVersionString: "v3.0.0",
                releaseNotesUrl: "https://example.com/release-notes",
                payload,
            });

            // Verify release notes URL is included
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.releaseNotesUrl).to.equal("https://example.com/release-notes");
        });

        it("computes correct SHA-256 digest of payload", async () => {
            const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
            const expectedDigest = Bytes.toHex(await crypto.computeHash(payload));

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            // Read header and verify digest
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(Bytes.toHex(header.imageDigest)).to.equal(expectedDigest);
            expect(header.imageDigestType).to.equal(1); // SHA-256
        });

        it("sets correct total size in OTA file", async () => {
            const payload = new Uint8Array(100); // 100 bytes

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 2,
                softwareVersionString: "v2.0.0",
                payload,
            });

            // Read total size from file header (offset 4, 8 bytes)
            const view = new DataView(Bytes.of(result.image).buffer);
            const totalSize = view.getBigUint64(4, true);

            expect(totalSize).to.equal(BigInt(result.image.byteLength));
        });
    });

    describe("round-trip with OtaImageReader", () => {
        it("writes and reads OTA image with all fields", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 7,
                softwareVersionString: "v7.0.0-beta",
                minApplicableSoftwareVersion: 5,
                maxApplicableSoftwareVersion: 6,
                releaseNotesUrl: "https://example.com/v7-notes",
                payload,
            });

            // Read back with OtaImageReader (header only)
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.vendorId).to.equal(0xfff1);
            expect(header.productId).to.equal(0x8000);
            expect(header.softwareVersion).to.equal(7);
            expect(header.softwareVersionString).to.equal("v7.0.0-beta");
            expect(Number(header.payloadSize)).to.equal(payload.length);
            expect(header.minApplicableSoftwareVersion).to.equal(5);
            expect(header.maxApplicableSoftwareVersion).to.equal(6);
            expect(header.releaseNotesUrl).to.equal("https://example.com/v7-notes");
            expect(header.imageDigestType).to.equal(1);
        });

        it("writes and fully validates OTA image with OtaImageReader.file", async () => {
            const payload = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff2,
                productId: 0x9000,
                softwareVersion: 12,
                softwareVersionString: "v12.1.0",
                minApplicableSoftwareVersion: 10,
                maxApplicableSoftwareVersion: 11,
                payload,
            });

            // Fully validate with OtaImageReader.file (validates digest)
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.file(reader, crypto, result.image.byteLength);

            expect(header.vendorId).to.equal(0xfff2);
            expect(header.productId).to.equal(0x9000);
            expect(header.softwareVersion).to.equal(12);
            expect(header.softwareVersionString).to.equal("v12.1.0");
            expect(header.minApplicableSoftwareVersion).to.equal(10);
            expect(header.maxApplicableSoftwareVersion).to.equal(11);
        });

        it("writes and validates OTA image without optional fields", async () => {
            const payload = new Uint8Array([0xff, 0xee, 0xdd]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff3,
                productId: 0x7000,
                softwareVersion: 20,
                softwareVersionString: "v20.0.0",
                payload,
            });

            // Validate with full digest check
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.file(reader, crypto, result.image.byteLength);

            expect(header.vendorId).to.equal(0xfff3);
            expect(header.productId).to.equal(0x7000);
            expect(header.softwareVersion).to.equal(20);
            expect(header.minApplicableSoftwareVersion).to.be.undefined;
            expect(header.maxApplicableSoftwareVersion).to.be.undefined;
            expect(header.releaseNotesUrl).to.be.undefined;
        });

        it("creates OTA image that validates with correct expected size", async () => {
            const payload = new Uint8Array(256); // Larger payload
            payload.fill(0xab);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 15,
                softwareVersionString: "v15.0.0",
                minApplicableSoftwareVersion: 14,
                maxApplicableSoftwareVersion: 14,
                payload,
            });

            // Validate with expected size parameter
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();

            // Should not throw with correct size
            const header = await OtaImageReader.file(reader, crypto, result.image.byteLength);
            expect(Number(header.payloadSize)).to.equal(payload.length);
        });

        it("creates different digests for different payloads", async () => {
            const payload1 = new Uint8Array([0x01, 0x02, 0x03]);
            const payload2 = new Uint8Array([0x04, 0x05, 0x06]);

            const result1 = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload: payload1,
            });

            const result2 = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload: payload2,
            });

            // Read headers
            const stream1 = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result1.image);
                    controller.close();
                },
            });
            const reader1 = stream1.getReader();
            const header1 = await OtaImageReader.header(reader1);

            const stream2 = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result2.image);
                    controller.close();
                },
            });
            const reader2 = stream2.getReader();
            const header2 = await OtaImageReader.header(reader2);

            // Digests should be different
            expect(header1.imageDigest).to.not.equal(header2.imageDigest);
        });

        it("computes full file checksum (base64 encoded)", async () => {
            const payload = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 10,
                softwareVersionString: "v10.0.0",
                payload,
            });

            // Should have checksum fields
            expect(result.fullFileChecksum).to.be.a("string");
            expect(result.fullFileChecksum.length).to.be.greaterThan(0);
            expect(result.fullFileChecksumType).to.equal("SHA-256");

            // Checksum should be base64 encoded (contains only valid base64 characters)
            expect(result.fullFileChecksum).to.match(/^[A-Z0-9+/]+=*$/i);

            // Verify checksum by reading with OtaImageReader
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            await OtaImageReader.file(reader, crypto, result.image.byteLength, {
                calculateFullChecksum: true,
                checksumType: "SHA-256",
                expectedChecksum: result.fullFileChecksum,
            });

            // Should not throw - checksum validation passed
        });

        it("different images have different full file checksums", async () => {
            const payload1 = new Uint8Array([0x01, 0x02]);
            const payload2 = new Uint8Array([0x03, 0x04]);

            const result1 = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload: payload1,
            });

            const result2 = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload: payload2,
            });

            // Full file checksums should be different
            expect(result1.fullFileChecksum).to.not.equal(result2.fullFileChecksum);
        });
    });

    describe("configurable hash algorithms", () => {
        it("defaults to SHA-256 for both digests when not specified", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            expect(result.fullFileChecksumType).to.equal("SHA-256");

            // Verify image digest type in header
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.imageDigestType).to.equal(HashFipsAlgorithmId["SHA-256"]);
        });

        it("uses custom imageDigestType when specified", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-512",
            });

            // Verify image digest type in header
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.imageDigestType).to.equal(HashFipsAlgorithmId["SHA-512"]);

            // Verify the digest is actually SHA-512 (64 bytes = 128 hex chars)
            expect(header.imageDigest.byteLength).to.equal(HASH_ALGORITHM_OUTPUT_LENGTHS["SHA-512"]);
        });

        it("uses custom fullFileChecksumType when specified", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                fullFileChecksumType: "SHA-384",
            });

            expect(result.fullFileChecksumType).to.equal("SHA-384");

            // Verify the checksum is actually SHA-384 (48 bytes base64 encoded)
            const decodedChecksum = Bytes.fromBase64(result.fullFileChecksum);
            expect(decodedChecksum.byteLength).to.equal(48); // SHA-384 produces 48 bytes
        });

        it("can use different hash algorithms for image digest and full file checksum", async () => {
            const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-256",
                fullFileChecksumType: "SHA-512",
            });

            // Verify full file checksum type
            expect(result.fullFileChecksumType).to.equal("SHA-512");

            // Verify image digest type
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.imageDigestType).to.equal(HashFipsAlgorithmId["SHA-256"]);
            expect(header.imageDigest.byteLength).to.equal(HASH_ALGORITHM_OUTPUT_LENGTHS["SHA-256"]); // SHA-256 = 32 bytes = 64 hex chars

            // Verify full file checksum
            const decodedChecksum = Bytes.fromBase64(result.fullFileChecksum);
            expect(decodedChecksum.byteLength).to.equal(64); // SHA-512 = 64 bytes
        });

        it("computes correct digest for different hash algorithms", async () => {
            const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

            // Create with SHA-256
            const result256 = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-256",
            });

            // Create with SHA-512
            const result512 = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-512",
            });

            // Manually compute expected digests
            const expectedDigest256 = Bytes.toHex(await crypto.computeHash(payload));
            const expectedDigest512 = Bytes.toHex(await crypto.computeHash(payload, "SHA-512"));

            // Read headers and verify digests
            const stream256 = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result256.image);
                    controller.close();
                },
            });
            const reader256 = stream256.getReader();
            const header256 = await OtaImageReader.header(reader256);

            const stream512 = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result512.image);
                    controller.close();
                },
            });
            const reader512 = stream512.getReader();
            const header512 = await OtaImageReader.header(reader512);

            expect(Bytes.toHex(header256.imageDigest)).to.equal(expectedDigest256);
            expect(Bytes.toHex(header512.imageDigest)).to.equal(expectedDigest512);

            // Digests should be different
            expect(Bytes.toHex(header256.imageDigest)).to.not.equal(Bytes.toHex(header512.imageDigest));
        });
    });
});
