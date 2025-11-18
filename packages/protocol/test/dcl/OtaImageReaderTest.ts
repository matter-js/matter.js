/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OtaImageReader } from "#dcl/OtaImageReader.js";
import { OtaImageWriter } from "#dcl/OtaImageWriter.js";
import { Bytes, HASH_ALGORITHM_OUTPUT_LENGTHS, HashFipsAlgorithmId } from "#general";
import { StreamingCrypto } from "./dcl-ota-test-helpers.js";

describe("OtaImageReader", () => {
    const crypto = new StreamingCrypto();

    describe("header", () => {
        it("reads OTA image header correctly", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 5,
                softwareVersionString: "v5.0.0",
                minApplicableSoftwareVersion: 4,
                maxApplicableSoftwareVersion: 4,
                payload,
            });

            // Read header
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
            expect(header.softwareVersion).to.equal(5);
            expect(header.softwareVersionString).to.equal("v5.0.0");
            expect(Number(header.payloadSize)).to.equal(payload.length);
            expect(header.minApplicableSoftwareVersion).to.equal(4);
            expect(header.maxApplicableSoftwareVersion).to.equal(4);
            expect(header.imageDigestType).to.equal(1);
        });

        it("reads OTA image header without optional fields", async () => {
            const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff2,
                productId: 0x9000,
                softwareVersion: 10,
                softwareVersionString: "v10.0.0",
                payload,
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.vendorId).to.equal(0xfff2);
            expect(header.minApplicableSoftwareVersion).to.be.undefined;
            expect(header.maxApplicableSoftwareVersion).to.be.undefined;
            expect(header.releaseNotesUrl).to.be.undefined;
        });

        it("reads header with custom hash algorithm", async () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-512",
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.header(reader);

            expect(header.imageDigestType).to.equal(HashFipsAlgorithmId["SHA-512"]);
            expect(header.imageDigest.byteLength).to.equal(HASH_ALGORITHM_OUTPUT_LENGTHS["SHA-512"]);
        });
    });

    describe("file", () => {
        it("validates OTA image with digest check", async () => {
            const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.file(reader, crypto, result.image.byteLength);

            expect(header.vendorId).to.equal(0xfff1);
            expect(header.softwareVersion).to.equal(1);
        });

        it("validates OTA image with custom hash algorithm", async () => {
            const payload = new Uint8Array([0x11, 0x22, 0x33]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-384",
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            const reader = stream.getReader();
            const header = await OtaImageReader.file(reader, crypto, result.image.byteLength);

            expect(header.imageDigestType).to.equal(HashFipsAlgorithmId["SHA-384"]);
        });

        it("computes full file checksum when enabled", async () => {
            const payload = new Uint8Array([0xca, 0xfe]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            await OtaImageReader.file(stream.getReader(), crypto, result.image.byteLength, {
                calculateFullChecksum: true,
            });

            // Verify checksum was written by OtaImageWriter
            expect(result.fullFileChecksum).to.be.a("string");
            expect(result.fullFileChecksum.length).to.be.greaterThan(0);
        });

        it("validates full file checksum when expectedChecksum provided", async () => {
            const payload = new Uint8Array([0xaa, 0xbb]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            // Should not throw with correct checksum
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });
            await OtaImageReader.file(stream.getReader(), crypto, result.image.byteLength, {
                calculateFullChecksum: true,
                checksumType: "SHA-256",
                expectedChecksum: result.fullFileChecksum,
            });
        });

        it("throws error when full file checksum doesn't match", async () => {
            const payload = new Uint8Array([0xaa, 0xbb]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });

            await expect(
                OtaImageReader.file(stream.getReader(), crypto, result.image.byteLength, {
                    calculateFullChecksum: true,
                    checksumType: "SHA-256",
                    expectedChecksum: "invalid-checksum",
                }),
            ).to.be.rejectedWith(/checksum mismatch/);
        });

        it("supports custom checksum types", async () => {
            const payload = new Uint8Array([0x01, 0x02]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                fullFileChecksumType: "SHA-512",
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });

            await OtaImageReader.file(stream.getReader(), crypto, result.image.byteLength, {
                calculateFullChecksum: true,
                checksumType: "SHA-512",
                expectedChecksum: result.fullFileChecksum,
            });

            // Verify it's actually SHA-512
            const decodedChecksum = Bytes.fromBase64(result.fullFileChecksum);
            expect(decodedChecksum.byteLength).to.equal(64); // SHA-512 = 64 bytes
        });

        it("validates payload digest during file reading", async () => {
            const payload = new Uint8Array([0xff, 0xee, 0xdd]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            // Corrupt the payload in the image
            const corruptedImage = new Uint8Array(Bytes.of(result.image));
            corruptedImage[corruptedImage.length - 1] ^= 0xff; // Flip last byte

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(corruptedImage);
                    controller.close();
                },
            });

            // Disable full checksum to validate payload digest instead
            await expect(
                OtaImageReader.file(stream.getReader(), crypto, corruptedImage.length, {
                    calculateFullChecksum: false,
                }),
            ).to.be.rejectedWith(/digest/);
        });

        it("handles different hash algorithms for payload validation", async () => {
            const payload = new Uint8Array([0x12, 0x34, 0x56]);

            // Create with SHA-384
            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
                imageDigestType: "SHA-384",
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });

            // Should validate successfully with SHA-384
            const header = await OtaImageReader.file(stream.getReader(), crypto, result.image.byteLength);
            expect(header.imageDigestType).to.equal(HashFipsAlgorithmId["SHA-384"]);
        });
    });

    describe("extractPayload", () => {
        it("extracts payload to writable stream", async () => {
            const payload = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            // Create a writable stream to collect extracted payload
            const extractedChunks: Bytes[] = [];
            const writableStream = new WritableStream<Bytes>({
                write(chunk) {
                    extractedChunks.push(chunk);
                },
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });

            const header = await OtaImageReader.extractPayload(
                stream.getReader(),
                writableStream.getWriter(),
                crypto,
                result.image.byteLength,
            );

            expect(header.vendorId).to.equal(0xfff1);
            expect(header.softwareVersion).to.equal(1);

            // Verify extracted payload matches original
            const extractedPayload = Bytes.concat(...extractedChunks);
            expect(Bytes.toHex(extractedPayload)).to.equal(Bytes.toHex(payload));
        });

        it("validates digest while extracting payload", async () => {
            const payload = new Uint8Array([0x11, 0x22, 0x33, 0x44]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            // Corrupt the payload
            const corruptedImage = new Uint8Array(Bytes.of(result.image));
            corruptedImage[corruptedImage.length - 1] ^= 0xff;

            const writableStream = new WritableStream<Bytes>();
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(corruptedImage);
                    controller.close();
                },
            });

            await expect(
                OtaImageReader.extractPayload(
                    stream.getReader(),
                    writableStream.getWriter(),
                    crypto,
                    corruptedImage.length,
                ),
            ).to.be.rejectedWith(/digest/);
        });
    });

    describe("error handling", () => {
        it("throws error for invalid/truncated file", async () => {
            const invalidImage = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(invalidImage);
                    controller.close();
                },
            });

            await expect(OtaImageReader.header(stream.getReader())).to.be.rejected;
        });

        it("throws error for size mismatch", async () => {
            const payload = new Uint8Array([0x01, 0x02]);

            const result = await OtaImageWriter.create(crypto, {
                vendorId: 0xfff1,
                productId: 0x8000,
                softwareVersion: 1,
                softwareVersionString: "v1.0.0",
                payload,
            });

            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(result.image);
                    controller.close();
                },
            });

            // Provide wrong expected size
            await expect(
                OtaImageReader.file(stream.getReader(), crypto, result.image.byteLength + 100),
            ).to.be.rejectedWith(/size/);
        });
    });
});
