/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    TestCert_PAA_NoVID_Cert,
    TestCert_PAA_NoVID_PrivateKey,
    TestCert_PAA_NoVID_PublicKey,
} from "#certificate/ChipPAAuthorities.js";
import { Paa } from "#certificate/kinds/AttestationCertificates.js";
import {
    Bytes,
    ContextTagged,
    Crypto,
    DerCodec,
    DerObject,
    DerType,
    MlDsa,
    MockFetch,
    Pem,
    PrivateKey,
    RawBytes,
    X509,
    X962,
} from "@matter/general";

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
        signerCertPem?: string;
        /** The CRL served for the distribution point, see {@link buildSignedTestCrl}. */
        crl: Bytes;
        /** Whether the entry is for a PAA, whose CRL revokes PAIs */
        isPAA?: boolean;
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
                        approvals: [],
                        rejects: [],
                        vid,
                        schemaVersion: 0,
                    },
                ],
            },
        },
    );

    if (revocation) {
        const normalizedSkid = revocation.issuerSkid.replace(/:/g, "").toUpperCase();

        // Mock the by-issuer endpoint for on-demand CRL lookup
        fetchMock.addResponse(`/dcl/pki/revocation-points/${normalizedSkid}`, {
            pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
                issuerSubjectKeyID: normalizedSkid,
                points: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: revocation.isPAA ?? false,
                        label: "test-revocation",
                        crlSignerDelegator: "",
                        crlSignerCertificate: revocation.signerCertPem ?? pemEncode(paaCert),
                        issuerSubjectKeyID: normalizedSkid,
                        dataURL: "https://example.com/test.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
                schemaVersion: 0,
            },
        });
        fetchMock.addResponse("https://example.com/test.crl", revocation.crl, { binary: true });
    }
}

/**
 * Build a minimal DER-encoded CRL containing specified revoked serial numbers.
 * Creates a valid-enough CRL structure for the parser to extract serial numbers from.
 *
 * @param issuerDnDer - Optional raw DER bytes of the issuer Name. When provided, the CRL's
 *   issuer DN will match the certificate's issuer for composite revocation key matching.
 *   When omitted, uses an empty issuer (issuerDnDerHex will still be set but won't match
 *   any real certificate — callers who need composite matching should provide this).
 */
export function buildTestCrl(revokedSerialHexes: string[], issuerDnDer?: Bytes): Uint8Array {
    return Bytes.of(
        DerCodec.encode({
            tbsCertList: crlTbs(revokedSerialHexes, issuerDnDer, X962.EcdsaWithSHA256),
            signatureAlgorithm: X962.EcdsaWithSHA256,
            signatureValue: { _tag: DerType.BitString, _bytes: new Uint8Array(0), _padding: 0 },
        }),
    );
}

/** A CRL signer key and the subject key identifier and subject Name DER of its certificate. */
export interface TestCrlSigner {
    key: PrivateKey | MlDsa.PrivateKey;
    subjectKeyId: Bytes;
    /** The CRL's issuer unless the CRL states another */
    subjectDer?: Bytes;
}

/** The private key of the CHIP test PAA without vendor ID. */
export function chipTestPaaKey() {
    return PrivateKey(TestCert_PAA_NoVID_PrivateKey, { publicKey: TestCert_PAA_NoVID_PublicKey });
}

/** The CRL signer of the CHIP test PAA without vendor ID. */
export function chipTestPaaCrlSigner(): TestCrlSigner {
    return {
        key: chipTestPaaKey(),
        subjectKeyId: Paa.fromAsn1(TestCert_PAA_NoVID_Cert).cert.extensions.subjectKeyIdentifier,
        subjectDer: Paa.fromAsn1(TestCert_PAA_NoVID_Cert).cert.subjectDer,
    };
}

/**
 * Build a CRL as Matter Core §13.2.6.1 accepts it: signed by the signer, with an Authority Key Identifier naming it,
 * and with a critical Issuing Distribution Point when `distributionPoint` is given.
 */
export async function buildSignedTestCrl(
    crypto: Crypto,
    signer: TestCrlSigner,
    revokedSerialHexes: string[],
    options: {
        issuerDnDer?: Bytes;
        /** URIs of the Issuing Distribution Point; the specification requires exactly one */
        distributionPoint?: string | readonly string[];
        distributionPointCritical?: boolean;
        withoutSignature?: boolean;
        /** Unused bits stated in the signature BIT STRING */
        signaturePadding?: number;
        /** Signature algorithm to state, where it should differ from the one the key signs with */
        signatureAlgorithm?: DerObject;
        /** Signature algorithm inside tbsCertList, where it should differ from the outer one */
        tbsSignatureAlgorithm?: DerObject;
        /** Further CRL extensions, keyed by any name */
        extensions?: Record<string, any>;
        /** CRL entry extensions, keyed by any name: for every revoked entry, or per entry in order */
        entryExtensions?: Record<string, any> | Array<Record<string, any> | undefined>;
    } = {},
): Promise<Uint8Array> {
    const { key } = signer;
    const signatureAlgorithm =
        options.signatureAlgorithm ??
        (MlDsa.isPrivateKey(key) ? MlDsa.AlgorithmIdentifier(key.parameterSet) : X962.EcdsaWithSHA256);

    const extensions: Record<string, any> = {
        authorityKeyIdentifier: X509.AuthorityKeyIdentifier(signer.subjectKeyId),
        ...options.extensions,
    };
    if (options.distributionPoint !== undefined) {
        const uris =
            typeof options.distributionPoint === "string" ? [options.distributionPoint] : options.distributionPoint;
        const fullName = RawBytes(
            Bytes.concat(...uris.map(uri => DerCodec.encode({ _tag: 0x86, _bytes: Bytes.fromString(uri) }))),
        );
        extensions.issuingDistributionPoint = DerObject("551d1c", {
            ...(options.distributionPointCritical === false ? {} : { critical: true }),
            value: DerCodec.encode({ distributionPoint: ContextTagged(0, ContextTagged(0, fullName)) }),
        });
    }

    const tbsCertList = crlTbs(
        revokedSerialHexes,
        options.issuerDnDer ?? signer.subjectDer,
        options.tbsSignatureAlgorithm ?? signatureAlgorithm,
        extensions,
        options.entryExtensions,
    );
    const tbsDer = DerCodec.encode(tbsCertList);
    const signature = options.withoutSignature
        ? new Uint8Array()
        : MlDsa.isPrivateKey(key)
          ? await crypto.signMlDsa(key, tbsDer)
          : (await crypto.signEcdsa(key, tbsDer)).der;

    return Bytes.of(
        DerCodec.encode({
            tbsCertList,
            signatureAlgorithm,
            signatureValue: { _tag: DerType.BitString, _bytes: signature, _padding: options.signaturePadding ?? 0 },
        }),
    );
}

function extensionsOfEntry(
    entryExtensions: Record<string, any> | Array<Record<string, any> | undefined> | undefined,
    index: number,
) {
    const extensions = Array.isArray(entryExtensions) ? entryExtensions[index] : entryExtensions;
    return extensions === undefined ? {} : { extensions };
}

function crlTbs(
    revokedSerialHexes: string[],
    issuerDnDer: Bytes | undefined,
    signatureAlgorithm: DerObject,
    extensions?: Record<string, any>,
    entryExtensions?: Record<string, any> | Array<Record<string, any> | undefined>,
) {
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
            ...extensionsOfEntry(entryExtensions, i),
        } as any;
    }

    const tbsCertList: Record<string, any> = {
        version: {
            _tag: DerType.Integer,
            _bytes: Uint8Array.of(1),
        },
        signature: signatureAlgorithm,
        issuer: issuerDnDer !== undefined ? DerCodec.decode(issuerDnDer) : { cn: ["Test Issuer"] },
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
    if (extensions !== undefined) {
        tbsCertList.crlExtensions = ContextTagged(0, extensions);
    }

    return tbsCertList;
}
