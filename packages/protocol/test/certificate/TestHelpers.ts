/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Paa } from "#certificate/kinds/AttestationCertificates.js";
import { Bytes, DerCodec, DerType, MockFetch, ObjectId, Pem } from "@matter/general";

/**
 * Encode DER bytes as a PEM certificate string.
 * Convenience wrapper around Pem.encode for test readability.
 */
export function pemEncode(der: Bytes): string {
    return Pem.encode(der);
}

/** Format a hex SKID string with colon separators (e.g., "AABB" → "AA:BB"). */
export function formatSkidWithColons(hexSkid: string): string {
    return hexSkid
        .match(/.{1,2}/g)!
        .join(":")
        .toUpperCase();
}

/**
 * Set up MockFetch with DCL API responses for a given PAA certificate.
 * Mocks the root certificate list, individual certificate detail, and empty revocation data.
 * Optionally includes revocation distribution points.
 */
export function setupDclFetchMock(
    fetchMock: MockFetch,
    paaCert: Bytes,
    revocation?: {
        issuerSkid: string;
        revokedSerials: string[];
        signerCertPem?: string;
    },
) {
    const paa = Paa.fromAsn1(paaCert);
    const skid = Bytes.toHex(paa.cert.extensions.subjectKeyIdentifier).toUpperCase();
    const skidWithColons = formatSkidWithColons(skid);
    const vid = paa.cert.subject.vendorId ?? 0;
    const subject = Bytes.toBase64(Bytes.fromString("test-subject"));

    fetchMock.addResponse("/dcl/pki/root-certificates", {
        approvedRootCertificates: {
            schemaVersion: 0,
            certs: [{ subject, subjectKeyId: skidWithColons }],
        },
    });
    fetchMock.addResponse(
        `/dcl/pki/certificates/${encodeURIComponent(subject)}/${encodeURIComponent(skidWithColons)}`,
        {
            approvedCertificates: {
                subject,
                subjectKeyId: skidWithColons,
                schemaVersion: 0,
                certs: [
                    {
                        pemCert: pemEncode(paaCert),
                        serialNumber: Bytes.toHex(paa.cert.serialNumber),
                        subject,
                        subjectAsText: `CN=${paa.cert.subject.commonName}`,
                        subjectKeyId: skidWithColons,
                        isRoot: true,
                        owner: "cosmos1...",
                        approvals: {} as any,
                        rejects: {} as any,
                        vid,
                        schemaVersion: 0,
                    },
                ],
            },
        },
    );

    if (revocation) {
        const issuerSkidWithColons = formatSkidWithColons(revocation.issuerSkid);
        const testCrl = buildTestCrl(revocation.revokedSerials);

        fetchMock.addResponse("/dcl/pki/revocation-points", {
            PkiRevocationDistributionPoint: [
                {
                    vid: 0xfff1,
                    pid: 0,
                    isPAA: false,
                    label: "test-revocation",
                    crlSignerDelegator: "",
                    crlSignerCertificate: revocation.signerCertPem ?? pemEncode(paaCert),
                    issuerSubjectKeyID: issuerSkidWithColons,
                    dataURL: "https://example.com/test.crl",
                    dataFileSize: "",
                    dataDigest: "",
                    dataDigestType: 0,
                    revocationType: 1,
                    schemaVersion: 0,
                },
            ],
        });
        fetchMock.addResponse("https://example.com/test.crl", testCrl, { binary: true });
    } else {
        fetchMock.addResponse("/dcl/pki/revocation-points", {
            PkiRevocationDistributionPoint: [],
        });
    }
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
