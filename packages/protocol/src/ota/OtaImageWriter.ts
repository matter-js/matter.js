/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, DataWriter, Endian, HashAlgorithm, HashFipsAlgorithmId } from "#general";
import { TlvOtaImageHeader } from "./OtaImageHeader.js";

/**
 * Result from OtaImageWriter.create() containing the OTA image and checksum information.
 */
export interface OtaImageWriterResult {
    /** The complete OTA image file */
    image: Bytes;
    /** Checksum of the full file (header + payload), base64 encoded */
    fullFileChecksum: string;
    /** Checksum algorithm type (defaults to SHA-256) */
    fullFileChecksumType: HashAlgorithm;
}

/**
 * Writer for creating OTA (Over-The-Air) update image files.
 *
 * This class creates properly formatted OTA images that comply with the Matter specification,
 * including file identifier, header encoding, and payload digest computation.
 *
 * The class can be used to convert raw firmware payloads into OTA image files suitable for distribution.
 * It does not use a streaming approach, so it requires the entire payload to be available in memory what is ok for now.
 */
export class OtaImageWriter {
    /**
     * Create a complete OTA image file.
     *
     * @param crypto - Crypto implementation for computing hash digests
     * @param options - Image configuration options
     * @param options.imageDigestType - Hash algorithm for payload digest (defaults to SHA-256)
     * @param options.fullFileChecksumType - Hash algorithm for full file checksum (defaults to SHA-256)
     * @returns OTA image result containing the image data and full file checksum
     */
    static async create(
        crypto: Crypto,
        options: {
            vendorId: number;
            productId: number;
            softwareVersion: number;
            softwareVersionString: string;
            minApplicableSoftwareVersion?: number;
            maxApplicableSoftwareVersion?: number;
            releaseNotesUrl?: string;
            payload: Bytes;
            imageDigestType?: HashAlgorithm;
            fullFileChecksumType?: HashAlgorithm;
        },
    ): Promise<OtaImageWriterResult> {
        const {
            vendorId,
            productId,
            softwareVersion,
            softwareVersionString,
            minApplicableSoftwareVersion,
            maxApplicableSoftwareVersion,
            releaseNotesUrl,
            payload,
            imageDigestType = "SHA-256",
            fullFileChecksumType = "SHA-256",
        } = options;

        // Create header with computed digest
        const header: {
            vendorId: number;
            productId: number;
            softwareVersion: number;
            softwareVersionString: string;
            payloadSize: bigint;
            minApplicableSoftwareVersion?: number;
            maxApplicableSoftwareVersion?: number;
            releaseNotesUrl?: string;
            imageDigestType: number;
            imageDigest: Bytes;
        } = {
            vendorId,
            productId,
            softwareVersion,
            softwareVersionString,
            minApplicableSoftwareVersion,
            maxApplicableSoftwareVersion,
            releaseNotesUrl,
            payloadSize: BigInt(payload.byteLength),
            imageDigestType: HashFipsAlgorithmId[imageDigestType],
            imageDigest: Bytes.of(await crypto.computeHash(payload, imageDigestType)),
        };

        // Encode header
        const headerTlv = Bytes.of(TlvOtaImageHeader.encode(header));

        // Create OTA file structure
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(0x1beef11e); // File identifier
        writer.writeUInt64(BigInt(16 + headerTlv.length + payload.byteLength)); // Total size (identifier:4 + size:8 + headerSize:4 + header + payload)
        writer.writeUInt32(headerTlv.length); // Header size
        writer.writeByteArray(headerTlv); // Header
        writer.writeByteArray(payload); // Payload

        const image = writer.toByteArray();

        // Calculate full file checksum using the specified checksum type, base64 encoded
        const fullChecksum = await crypto.computeHash(image, fullFileChecksumType);
        const fullFileChecksum = Bytes.toBase64(Bytes.of(fullChecksum));

        return {
            image,
            fullFileChecksum,
            fullFileChecksumType,
        };
    }
}
