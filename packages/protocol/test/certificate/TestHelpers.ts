/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DerCodec, DerType, ObjectId } from "#general";

/**
 * Encode DER bytes as a PEM string.
 */
export function pemEncode(der: Bytes): string {
    const base64 = Bytes.toBase64(der);
    const lines: string[] = ["-----BEGIN CERTIFICATE-----"];
    for (let i = 0; i < base64.length; i += 64) {
        lines.push(base64.slice(i, i + 64));
    }
    lines.push("-----END CERTIFICATE-----");
    return lines.join("\n");
}

/**
 * Build a minimal DER-encoded CRL containing specified revoked serial numbers.
 * Creates a valid-enough CRL structure for the parser to extract serial numbers from.
 */
export function buildTestCrl(revokedSerialHexes: string[]): Uint8Array {
    const revokedEntries: Record<string, any> = {};
    for (let i = 0; i < revokedSerialHexes.length; i++) {
        revokedEntries[`entry${i}`] = {
            serial: {
                _tag: DerType.Integer,
                _bytes: Bytes.fromHex(revokedSerialHexes[i]),
            },
            revocationDate: {
                _tag: DerType.UtcDate,
                _bytes: Bytes.fromString("250101000000Z"),
            },
        } as any;
    }

    const signatureAlgorithm = {
        _objectId: ObjectId("2a8648ce3d040302"),
    };

    const tbsCertList: Record<string, any> = {
        version: {
            _tag: DerType.Integer,
            _bytes: Uint8Array.of(1),
        },
        signature: signatureAlgorithm,
        issuer: {
            cn: ["Test Issuer"],
        },
        thisUpdate: {
            _tag: DerType.UtcDate,
            _bytes: Bytes.fromString("250101000000Z"),
        },
        nextUpdate: {
            _tag: DerType.UtcDate,
            _bytes: Bytes.fromString("260101000000Z"),
        },
    };

    if (revokedSerialHexes.length > 0) {
        tbsCertList.revokedCertificates = revokedEntries;
    }

    const certificateList: any = {
        tbsCertList,
        signatureAlgorithm,
        signatureValue: {
            _tag: DerType.BitString,
            _bytes: new Uint8Array(32),
            _padding: 0,
        },
    };

    return Bytes.of(DerCodec.encode(certificateList));
}
