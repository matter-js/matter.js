/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto } from "#general";
import { OtaImageWriter } from "#ota/OtaImageWriter.js";
import { DeviceSoftwareVersionModelDclSchema, VendorId } from "#types";

/**
 * Helper to create a valid OTA image for testing.
 * Returns the image bytes (not the full result object).
 */
export async function createOtaImage(
    crypto: Crypto,
    vendorId: number,
    productId: number,
    softwareVersion: number,
    payload: Uint8Array = new Uint8Array([0x01, 0x02, 0x03, 0x04]),
) {
    const result = await OtaImageWriter.create(crypto, {
        vendorId,
        productId,
        softwareVersion,
        softwareVersionString: `v${softwareVersion}.0.0`,
        minApplicableSoftwareVersion: softwareVersion - 1,
        maxApplicableSoftwareVersion: softwareVersion - 1,
        payload,
    });
    return result.image;
}

/**
 * Mock DCL response for version list queries.
 */
export const mockVersionsList = {
    modelVersions: {
        vid: VendorId(0xfff1),
        pid: 0x8000,
        softwareVersions: [1, 2, 3],
        schemaVersion: 0,
    },
};

/**
 * Helper to create mock DCL version metadata for testing.
 */
export function createVersionMetadata(
    version: number,
    valid: boolean = true,
    hasOta: boolean = true,
    overrides?: Partial<DeviceSoftwareVersionModelDclSchema>,
) {
    return {
        modelVersion: {
            vid: VendorId(0xfff1),
            pid: 0x8000,
            softwareVersion: version,
            softwareVersionString: `v${version}.0.0`,
            cdVersionNumber: 1,
            softwareVersionValid: valid,
            otaUrl: hasOta ? `https://example.com/ota-v${version}.bin` : undefined,
            otaFileSize: 1024,
            otaChecksum: "checksum123",
            otaChecksumType: 1,
            minApplicableSoftwareVersion: version - 1,
            maxApplicableSoftwareVersion: version - 1,
            releaseNotesUrl: `https://example.com/release-notes-v${version}`,
            schemaVersion: 0,
            ...overrides,
        },
    };
}
