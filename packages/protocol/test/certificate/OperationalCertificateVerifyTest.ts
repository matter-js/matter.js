/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateProfileError } from "#certificate/kinds/Certificate.js";
import { Unsigned } from "#certificate/kinds/common.js";
import { jsToMatterDate } from "#certificate/kinds/definitions/asn.js";
import { OperationalCertificate } from "#certificate/kinds/definitions/operational.js";
import { Icac } from "#certificate/kinds/Icac.js";
import { Noc, OperationalNodeIdError } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import { Vvsc } from "#certificate/kinds/Vvsc.js";
import {
    Bytes,
    CertificateError,
    DerCodec,
    DerNode,
    DerType,
    InternalError,
    PrivateKey,
    StandardCrypto,
    Time,
    UnexpectedDataError,
} from "@matter/general";
import {
    CaseAuthenticatedTag,
    FabricId,
    NodeId,
    TlvAny,
    TlvField,
    TlvLength,
    TlvStream,
    TlvTaggedList,
    TlvType,
    TlvUInt64,
    ValidationMandatoryFieldMissingError,
    ValidationOutOfBoundsError,
} from "@matter/types";

const crypto = new StandardCrypto();

const ISSUER_TAG = 3;
const SUBJECT_TAG = 6;
const DN_TAG = {
    nodeId: 17,
    firmwareSigningId: 18,
    icacId: 19,
    rcacId: 20,
    fabricId: 21,
    caseAuthenticatedTag: 22,
    vvsId: 23,
};

const ROOT_ID = 1;
const ICAC_ID = 2;
const VVS_ID = 3;
const NODE_ID = NodeId(0x1234n);
const FABRIC_ID = FabricId(1n);

interface KeyMaterial {
    key: PrivateKey;
    skid: Bytes;
}

async function keyMaterial(): Promise<KeyMaterial> {
    const key = await crypto.createKeyPair();
    return { key, skid: Bytes.of(await crypto.computeHash(key.publicKey, "SHA-1")) };
}

function commonFields(publicKey: Bytes) {
    return {
        serialNumber: Bytes.fromHex("01"),
        signatureAlgorithm: 1,
        publicKeyAlgorithm: 1,
        ellipticCurveIdentifier: 1,
        notBefore: jsToMatterDate(Time.now, -1),
        notAfter: jsToMatterDate(Time.now, 10),
        ellipticCurvePublicKey: publicKey,
    };
}

type Mutate<T> = (cert: Unsigned<T>) => void;

async function rcacTlv(root: KeyMaterial, mutate?: Mutate<OperationalCertificate.Rcac>) {
    const cert: Unsigned<OperationalCertificate.Rcac> = {
        ...commonFields(root.key.publicKey),
        issuer: { rcacId: ROOT_ID },
        subject: { rcacId: ROOT_ID },
        extensions: {
            basicConstraints: { isCa: true },
            keyUsage: { keyCertSign: true, cRLSign: true },
            subjectKeyIdentifier: root.skid,
            authorityKeyIdentifier: root.skid,
        },
    };
    mutate?.(cert);
    const rcac = new Rcac(cert);
    await rcac.sign(crypto, root.key);
    return rcac.asSignedTlv();
}

async function icacTlv(ica: KeyMaterial, root: KeyMaterial, mutate?: Mutate<OperationalCertificate.Icac>) {
    const cert: Unsigned<OperationalCertificate.Icac> = {
        ...commonFields(ica.key.publicKey),
        issuer: { rcacId: ROOT_ID },
        subject: { icacId: ICAC_ID },
        extensions: {
            basicConstraints: { isCa: true },
            keyUsage: { keyCertSign: true, cRLSign: true },
            subjectKeyIdentifier: ica.skid,
            authorityKeyIdentifier: root.skid,
        },
    };
    mutate?.(cert);
    const icac = new Icac(cert);
    await icac.sign(crypto, root.key);
    return icac.asSignedTlv();
}

async function nocTlv(node: KeyMaterial, issuer: KeyMaterial, mutate?: Mutate<OperationalCertificate.Noc>) {
    const cert: Unsigned<OperationalCertificate.Noc> = {
        ...commonFields(node.key.publicKey),
        issuer: { icacId: ICAC_ID },
        subject: { nodeId: NODE_ID, fabricId: FABRIC_ID },
        extensions: {
            basicConstraints: { isCa: false },
            keyUsage: { digitalSignature: true },
            extendedKeyUsage: [2, 1],
            subjectKeyIdentifier: node.skid,
            authorityKeyIdentifier: issuer.skid,
        },
    };
    mutate?.(cert);
    const noc = new Noc(cert);
    await noc.sign(crypto, issuer.key);
    return noc.asSignedTlv();
}

function vvscCert(
    vvs: KeyMaterial,
    root: KeyMaterial,
    mutate?: Mutate<OperationalCertificate.Vvsc>,
): Unsigned<OperationalCertificate.Vvsc> {
    const cert: Unsigned<OperationalCertificate.Vvsc> = {
        ...commonFields(vvs.key.publicKey),
        issuer: { rcacId: ROOT_ID },
        subject: { vvsId: VVS_ID },
        extensions: {
            basicConstraints: { isCa: false },
            keyUsage: { digitalSignature: true },
            subjectKeyIdentifier: vvs.skid,
            authorityKeyIdentifier: root.skid,
        },
    };
    mutate?.(cert);
    return cert;
}

async function vvscTlv(vvs: KeyMaterial, root: KeyMaterial, mutate?: Mutate<OperationalCertificate.Vvsc>) {
    const vvsc = new Vvsc(vvscCert(vvs, root, mutate));
    await vvsc.sign(crypto, root.key);
    return vvsc.asSignedTlv();
}

/** One Matter-TLV DN entry with a 64-bit unsigned value, as a stream fragment. */
function dnEntry(tag: number, value: number | bigint): TlvStream {
    const stream = TlvTaggedList({ entry: TlvField(tag, TlvUInt64) }).encodeTlv({ entry: value });
    return stream.slice(1, -1);
}

/**
 * Inserts {@link entry} as the first element of the issuer or subject DN of a signed Matter-TLV certificate.  The
 * signature is not updated; use {@link resignedNoc}, {@link resignedIcac} or {@link resignedRcac} where the decoded
 * certificate must carry a valid signature.
 */
function withLeadingDnEntry(tlv: Bytes, dnTag: typeof ISSUER_TAG | typeof SUBJECT_TAG, entry: TlvStream): Bytes {
    const stream = TlvAny.decode(tlv);
    let depth = 0;
    for (let index = 0; index < stream.length; index++) {
        const { tag, typeLength } = stream[index];
        if (depth === 1 && tag?.id === dnTag) {
            stream.splice(index + 1, 0, ...entry);
            return TlvAny.encode(stream);
        }
        switch (typeLength.type) {
            case TlvType.Structure:
            case TlvType.List:
            case TlvType.Array:
                depth++;
                break;
            case TlvType.EndOfContainer:
                depth--;
                break;
        }
    }
    throw new InternalError(`Certificate has no DN with tag ${dnTag}`);
}

function replaceOnce(source: Bytes, search: Bytes, replacement: Bytes) {
    const bytes = Bytes.of(source).slice();
    const pattern = Bytes.of(search);
    for (let offset = 0; offset + pattern.length <= bytes.length; offset++) {
        if (pattern.every((byte, index) => bytes[offset + index] === byte)) {
            bytes.set(Bytes.of(replacement), offset);
            return bytes;
        }
    }
    throw new InternalError("Pattern not found");
}

const OP_OID_BASE = "2b0601040182a27c01";
const ATT_OID_BASE = "2b0601040182a27c02";
const OID = {
    nodeId: `${OP_OID_BASE}01`,
    firmwareSigningId: `${OP_OID_BASE}02`,
    icacId: `${OP_OID_BASE}03`,
    rcacId: `${OP_OID_BASE}04`,
    fabricId: `${OP_OID_BASE}05`,
    caseAuthenticatedTag: `${OP_OID_BASE}06`,
    vvsId: `${OP_OID_BASE}07`,
    vendorId: `${ATT_OID_BASE}01`,
    productId: `${ATT_OID_BASE}02`,
    commonName: "550403",
    orgName: "55040a",
};

function reencode(node: DerNode): Bytes {
    if (node._elements === undefined) {
        const bytes =
            node._tag === DerType.BitString
                ? Bytes.concat(Uint8Array.of(node._padding ?? 0), node._bytes)
                : node._bytes;
        return DerCodec.encode({ _tag: node._tag, _bytes: bytes });
    }
    return DerCodec.encode({ _tag: node._tag, _bytes: Bytes.concat(...node._elements.map(reencode)) });
}

function findAttribute(node: DerNode, oidHex: string): DerNode | undefined {
    const elements = node._elements;
    if (elements === undefined) {
        return undefined;
    }
    if (
        elements.length === 2 &&
        elements[0]._tag === DerType.ObjectIdentifier &&
        Bytes.toHex(elements[0]._bytes) === oidHex
    ) {
        return node;
    }
    for (const element of elements) {
        const found = findAttribute(element, oidHex);
        if (found !== undefined) {
            return found;
        }
    }
}

/**
 * Re-encodes a certificate with the first DN attribute that has {@link oid} carrying {@link text} (and, when given,
 * {@link newOid}), so the DER lengths stay correct for text of any length.
 */
function withRdn(der: Bytes, oid: string, text: string, newOid = oid): Bytes {
    const cert = DerCodec.decode(der);
    const attribute = findAttribute(cert, oid);
    if (attribute === undefined) {
        throw new InternalError(`Certificate has no DN attribute ${oid}`);
    }
    attribute._elements![0]._bytes = Bytes.fromHex(newOid);
    attribute._elements![1]._bytes = Bytes.fromString(text);
    return reencode(cert);
}

const SUBJECT_ELEMENT = 5;

/** Re-encodes a certificate without the subject RDN that holds the DN attribute with {@link oid}. */
function withoutSubjectRdn(der: Bytes, oid: string): Bytes {
    const cert = DerCodec.decode(der);
    const subject = cert._elements?.[0]._elements?.[SUBJECT_ELEMENT] ?? expect.fail("Certificate has no subject");
    const index = subject._elements?.findIndex(rdn => findAttribute(rdn, oid) !== undefined) ?? -1;
    if (index < 0) {
        expect.fail(`Subject has no DN attribute ${oid}`);
    }
    subject._elements!.splice(index, 1);
    return reencode(cert);
}

const EXTENSIONS_TAG = 10;
const KEY_USAGE_TAG = 2;
const KEY_USAGE_RESERVED_BIT = 0x0200;

/**
 * Replaces the raw key usage bitmap of a signed Matter-TLV certificate.  The decoder drops bits without a name, so the
 * verifier rebuilds the same signed bytes and the issuer signature stays valid.
 */
function withKeyUsageBitmap(tlv: Bytes, bitmap: number): Bytes {
    const stream = TlvAny.decode(tlv);
    let depth = 0;
    let inExtensions = false;
    for (const element of stream) {
        const { tag, typeLength } = element;
        if (depth === 2 && inExtensions && tag?.id === KEY_USAGE_TAG) {
            element.typeLength = { type: TlvType.UnsignedInt, length: TlvLength.TwoBytes };
            element.value = bitmap;
            return TlvAny.encode(stream);
        }
        switch (typeLength.type) {
            case TlvType.Structure:
            case TlvType.List:
            case TlvType.Array:
                depth++;
                if (depth === 2) {
                    inExtensions = tag?.id === EXTENSIONS_TAG;
                }
                break;
            case TlvType.EndOfContainer:
                depth--;
                break;
        }
    }
    throw new InternalError("Certificate has no key usage extension");
}

/** Signs a certificate again after {@link withLeadingDnEntry} added an entry the decoder keeps. */
async function resignedNoc(tlv: Bytes, issuer: KeyMaterial) {
    const { signature: _signature, ...cert } = OperationalCertificate.TlvNoc.decode(tlv);
    const noc = new Noc(cert);
    await noc.sign(crypto, issuer.key);
    return noc.asSignedTlv();
}

async function resignedIcac(tlv: Bytes, root: KeyMaterial) {
    const { signature: _signature, ...cert } = OperationalCertificate.TlvIcac.decode(tlv);
    const icac = new Icac(cert);
    await icac.sign(crypto, root.key);
    return icac.asSignedTlv();
}

async function resignedRcac(tlv: Bytes, root: KeyMaterial) {
    const { signature: _signature, ...cert } = OperationalCertificate.TlvRcac.decode(tlv);
    const rcac = new Rcac(cert);
    await rcac.sign(crypto, root.key);
    return rcac.asSignedTlv();
}

async function verifyRcac(tlv: Bytes) {
    await Rcac.fromTlv(tlv).verify(crypto);
}

async function verifyIcac(tlv: Bytes, rootTlv: Bytes) {
    await Icac.fromTlv(tlv).verify(crypto, Rcac.fromTlv(rootTlv));
}

async function verifyNoc(tlv: Bytes, rootTlv: Bytes, icaTlv?: Bytes) {
    await Noc.fromTlv(tlv).verify(crypto, Rcac.fromTlv(rootTlv), icaTlv ? Icac.fromTlv(icaTlv) : undefined);
}

async function verifyVvsc(tlv: Bytes) {
    await Vvsc.fromTlv(tlv).verify(crypto);
}

/**
 * Negative and edge vectors for operational certificate verification.
 *
 * Each vector changes one field of a conformant certificate. Each vector is signed again by the issuer, so the
 * signature check does not hide the rule under test.
 *
 * @see {@link MatterSpecification.v161.Core} § 6.5.6.3 and § 6.5.12
 */
describe("Operational certificate verification", () => {
    let root: KeyMaterial;
    let ica: KeyMaterial;
    let node: KeyMaterial;
    let rootTlv: Bytes;
    let icaTlv: Bytes;

    before(async () => {
        MockTime.reset(1_767_225_600_000);
        root = await keyMaterial();
        ica = await keyMaterial();
        node = await keyMaterial();
        rootTlv = await rcacTlv(root);
        icaTlv = await icacTlv(ica, root);
    });

    describe("conformant certificates", () => {
        // Characterization: passes without the fix.
        it("verifies an RCAC", async () => {
            await verifyRcac(rootTlv);
        });

        // Characterization: passes without the fix.
        it("verifies an ICAC", async () => {
            await verifyIcac(icaTlv, rootTlv);
        });

        // Characterization: passes without the fix.
        it("verifies a NOC issued by an ICAC", async () => {
            await verifyNoc(await nocTlv(node, ica), rootTlv, icaTlv);
        });

        // Characterization: passes without the fix.
        it("verifies a NOC issued by the RCAC", async () => {
            const noc = await nocTlv(node, root, cert => {
                cert.issuer = { rcacId: ROOT_ID };
            });
            await verifyNoc(noc, rootTlv);
        });

        // Characterization: passes without the fix.
        it("verifies a NOC whose subject has five RDNs, three of them CATs", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.caseAuthenticatedTags = [
                    CaseAuthenticatedTag(0x0001_0001),
                    CaseAuthenticatedTag(0x0002_0001),
                    CaseAuthenticatedTag(0x0003_0001),
                ];
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        // Characterization: passes without the fix.
        it("does not count an absent attribute of an in-memory certificate as an RDN", async () => {
            const noc = Noc.fromTlv(
                await nocTlv(node, ica, cert => {
                    cert.subject.caseAuthenticatedTags = [
                        CaseAuthenticatedTag(0x0001_0001),
                        CaseAuthenticatedTag(0x0002_0001),
                        CaseAuthenticatedTag(0x0003_0001),
                    ];
                }),
            );
            noc.cert.subject.commonName = undefined;
            await noc.verify(crypto, Rcac.fromTlv(rootTlv), Icac.fromTlv(icaTlv));
        });

        // Characterization: passes without the fix.
        it("verifies a NOC with node ID 0xFFFF_FFEF_FFFF_FFFF, the top of the operational range", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.nodeId = NodeId(0xffff_ffef_ffff_ffffn);
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        it("verifies a VVSC", async () => {
            await verifyVvsc(await vvscTlv(await keyMaterial(), root));
        });
    });

    describe("NOC extensions", () => {
        // CHIP requires serverAuth only (FabricTable.cpp:344, CASESession.cpp:455), so matter.js does too.
        // Characterization: passes without the fix.
        it("verifies a NOC with serverAuth as its only key purpose", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.extendedKeyUsage = [1];
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        it("refuses a NOC with clientAuth as its only key purpose", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.extendedKeyUsage = [2];
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /serverAuth/);
        });

        // Characterization: passes without the fix.
        it("refuses a NOC without extended key usage", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.extendedKeyUsage = undefined;
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /serverAuth/);
        });

        // Characterization: the spec requires exactly {serverAuth, clientAuth}; CHIP accepts extra purposes.
        it("verifies a NOC with an additional key purpose", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.extendedKeyUsage = [2, 1, 3];
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        // Characterization: the spec requires exactly digitalSignature; CHIP accepts additional key usage flags.
        it("verifies a NOC with an additional key usage flag", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.keyUsage = { digitalSignature: true, keyEncipherment: true };
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        // Characterization: the NOC check reads only digitalSignature. CHIP refuses a bit without a name in any certificate.
        it("verifies a NOC whose key usage bitmap has a bit that has no name", async () => {
            const noc = withKeyUsageBitmap(await nocTlv(node, ica), 0x0001 | KEY_USAGE_RESERVED_BIT);
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        // Characterization: passes without the fix.
        it("refuses a NOC whose key usage lacks digitalSignature", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.keyUsage = { keyEncipherment: true };
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /digitalSignature/);
        });
    });

    describe("NOC subject DN", () => {
        it("refuses a subject with six RDNs, three of them CATs", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject = {
                    nodeId: NODE_ID,
                    fabricId: FABRIC_ID,
                    caseAuthenticatedTags: [
                        CaseAuthenticatedTag(0x0001_0001),
                        CaseAuthenticatedTag(0x0002_0001),
                        CaseAuthenticatedTag(0x0003_0001),
                    ],
                    commonName: "node",
                };
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /more than 5 RDNs/);
        });

        // Characterization: passes without the fix.
        it("verifies an issuer DN with exactly five RDNs", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.issuer = {
                    icacId: ICAC_ID,
                    commonName: "a",
                    surName: "b",
                    serialNum: "c",
                    countryName: "DE",
                };
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

        // Characterization: passes without the fix.
        it("refuses an issuer DN with six RDNs", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.issuer = {
                    icacId: ICAC_ID,
                    commonName: "a",
                    surName: "b",
                    serialNum: "c",
                    countryName: "DE",
                    localityName: "e",
                };
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(
                CertificateError,
                /issuer must not contain more/,
            );
        });

        // Characterization: passes without the fix.
        it("refuses a CAT with version 0", async () => {
            const noc = withLeadingDnEntry(
                await nocTlv(node, ica),
                SUBJECT_TAG,
                dnEntry(DN_TAG.caseAuthenticatedTag, 0x0001_0000),
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(ValidationOutOfBoundsError, /version/);
        });

        // Characterization: passes without the fix.
        it("refuses node ID 0", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.nodeId = NodeId(0n);
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(OperationalNodeIdError);
        });

        // Characterization: passes without the fix.
        it("refuses node ID 0xFFFF_FFF0_0000_0000, the first value above the operational range", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.nodeId = NodeId(0xffff_fff0_0000_0000n);
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(OperationalNodeIdError);
        });

        // Characterization: passes without the fix.
        it("refuses fabric ID 0", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.fabricId = FabricId(0n);
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /Invalid fabricId/);
        });

        it("refuses a second matter-node-id", async () => {
            const noc = withLeadingDnEntry(await nocTlv(node, ica), SUBJECT_TAG, dnEntry(DN_TAG.nodeId, 0x5678));
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(UnexpectedDataError, /nodeId/);
        });

        it("refuses a second matter-fabric-id", async () => {
            const noc = withLeadingDnEntry(
                await nocTlv(node, ica, cert => {
                    cert.subject = { fabricId: FABRIC_ID, nodeId: NODE_ID };
                }),
                SUBJECT_TAG,
                dnEntry(DN_TAG.fabricId, 2),
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(UnexpectedDataError, /fabricId/);
        });

        // Characterization: passes without the fix.
        it("refuses a matter-icac-id", async () => {
            const noc = await resignedNoc(
                withLeadingDnEntry(await nocTlv(node, ica), SUBJECT_TAG, dnEntry(DN_TAG.icacId, ICAC_ID)),
                ica,
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /icacId/);
        });

        // Characterization: passes without the fix.
        it("refuses a matter-rcac-id", async () => {
            const noc = await resignedNoc(
                withLeadingDnEntry(await nocTlv(node, ica), SUBJECT_TAG, dnEntry(DN_TAG.rcacId, ROOT_ID)),
                ica,
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /rcacId/);
        });

        it("refuses a matter-vvs-id", async () => {
            const noc = withLeadingDnEntry(await nocTlv(node, ica), SUBJECT_TAG, dnEntry(DN_TAG.vvsId, VVS_ID));
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /vvsId/);
        });

        it("refuses a second matter-icac-id in the issuer DN", async () => {
            const noc = withLeadingDnEntry(await nocTlv(node, ica), ISSUER_TAG, dnEntry(DN_TAG.icacId, 9));
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(UnexpectedDataError, /icacId/);
        });
    });

    describe("ICAC extensions", () => {
        it("refuses a key usage bitmap with a bit that has no name", async () => {
            const icac = withKeyUsageBitmap(await icacTlv(ica, root), 0x0060 | KEY_USAGE_RESERVED_BIT);
            await expect(verifyIcac(icac, rootTlv)).rejectedWith(CertificateError, /keyUsage/);
        });

        it("accepts the optional digitalSignature flag", async () => {
            await verifyIcac(
                await icacTlv(ica, root, cert => {
                    cert.extensions.keyUsage = { keyCertSign: true, cRLSign: true, digitalSignature: true };
                }),
                rootTlv,
            );
        });
    });

    describe("ICAC subject DN", () => {
        // Characterization: passes without the fix.
        it("refuses an RCAC in the ICAC position", async () => {
            const noc = await nocTlv(node, root, cert => {
                cert.issuer = { rcacId: ROOT_ID };
            });
            await expect(verifyNoc(noc, rootTlv, rootTlv)).rejectedWith(ValidationMandatoryFieldMissingError, /icacId/);
        });

        // Characterization: passes without the fix.
        it("refuses fabric ID 0", async () => {
            const icac = await icacTlv(ica, root, cert => {
                cert.subject.fabricId = FabricId(0n);
            });
            await expect(verifyIcac(icac, rootTlv)).rejectedWith(CertificateError, /Invalid fabricId/);
        });

        it("refuses a second matter-icac-id", async () => {
            const icac = withLeadingDnEntry(await icacTlv(ica, root), SUBJECT_TAG, dnEntry(DN_TAG.icacId, 9));
            await expect(verifyIcac(icac, rootTlv)).rejectedWith(UnexpectedDataError, /icacId/);
        });

        it("refuses a second matter-fabric-id", async () => {
            const icac = withLeadingDnEntry(
                await icacTlv(ica, root, cert => {
                    cert.subject = { fabricId: FABRIC_ID, icacId: ICAC_ID };
                }),
                SUBJECT_TAG,
                dnEntry(DN_TAG.fabricId, 2),
            );
            await expect(verifyIcac(icac, rootTlv)).rejectedWith(UnexpectedDataError, /fabricId/);
        });

        // Characterization: passes without the fix.
        it("refuses a matter-noc-cat", async () => {
            const icac = await resignedIcac(
                withLeadingDnEntry(
                    await icacTlv(ica, root),
                    SUBJECT_TAG,
                    dnEntry(DN_TAG.caseAuthenticatedTag, 0x0001_0001),
                ),
                root,
            );
            await expect(verifyIcac(icac, rootTlv)).rejectedWith(CertificateError, /caseAuthenticatedTags/);
        });

        it("refuses a matter-vvs-id", async () => {
            const icac = withLeadingDnEntry(await icacTlv(ica, root), SUBJECT_TAG, dnEntry(DN_TAG.vvsId, VVS_ID));
            await expect(verifyIcac(icac, rootTlv)).rejectedWith(CertificateError, /vvsId/);
        });
    });

    describe("RCAC subject DN and extensions", () => {
        // Characterization: passes without the fix.
        it("refuses fabric ID 0", async () => {
            const rcac = await rcacTlv(root, cert => {
                cert.subject.fabricId = FabricId(0n);
            });
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /Invalid fabricId/);
        });

        it("refuses a second matter-rcac-id", async () => {
            const rcac = withLeadingDnEntry(await rcacTlv(root), SUBJECT_TAG, dnEntry(DN_TAG.rcacId, 9));
            await expect(verifyRcac(rcac)).rejectedWith(UnexpectedDataError, /rcacId/);
        });

        it("refuses a second matter-fabric-id", async () => {
            const rcac = withLeadingDnEntry(
                await rcacTlv(root, cert => {
                    cert.subject = { fabricId: FABRIC_ID, rcacId: ROOT_ID };
                }),
                SUBJECT_TAG,
                dnEntry(DN_TAG.fabricId, 2),
            );
            await expect(verifyRcac(rcac)).rejectedWith(UnexpectedDataError, /fabricId/);
        });

        // Characterization: passes without the fix.
        it("refuses a matter-node-id", async () => {
            const rcac = await resignedRcac(
                withLeadingDnEntry(await rcacTlv(root), SUBJECT_TAG, dnEntry(DN_TAG.nodeId, NODE_ID)),
                root,
            );
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /nodeId/);
        });

        it("refuses a matter-vvs-id", async () => {
            const rcac = withLeadingDnEntry(await rcacTlv(root), SUBJECT_TAG, dnEntry(DN_TAG.vvsId, VVS_ID));
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /vvsId/);
        });

        // Characterization: passes without the fix.
        it("refuses a key usage flag beyond keyCertSign, cRLSign and digitalSignature", async () => {
            const rcac = await rcacTlv(root, cert => {
                cert.extensions.keyUsage = { keyCertSign: true, cRLSign: true, keyEncipherment: true };
            });
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /keyUsage/);
        });

        it("refuses a key usage bitmap with a bit that has no name", async () => {
            const rcac = withKeyUsageBitmap(await rcacTlv(root), 0x0060 | KEY_USAGE_RESERVED_BIT);
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /keyUsage/);
        });

        it("accepts the optional digitalSignature flag", async () => {
            await verifyRcac(
                await rcacTlv(root, cert => {
                    cert.extensions.keyUsage = { keyCertSign: true, cRLSign: true, digitalSignature: true };
                }),
            );
        });
    });

    describe("VVSC extensions", () => {
        it("refuses a VVSC that is a CA", async () => {
            const cert = vvscCert(await keyMaterial(), root, c => {
                c.extensions.basicConstraints = { isCa: true };
            });
            expect(() => new Vvsc(cert)).throws(CertificateError, /must not be a CA/);
        });

        it("refuses a VVSC with a key usage flag besides digitalSignature", async () => {
            const cert = vvscCert(await keyMaterial(), root, c => {
                c.extensions.keyUsage = { digitalSignature: true, keyEncipherment: true };
            });
            await expect(new Vvsc(cert).verify(crypto)).rejectedWith(CertificateError, /keyUsage/);
        });

        it("refuses a VVSC key usage bitmap with a bit that has no name", async () => {
            const vvsc = withKeyUsageBitmap(await vvscTlv(await keyMaterial(), root), 0x0001 | KEY_USAGE_RESERVED_BIT);
            await expect(verifyVvsc(vvsc)).rejectedWith(CertificateError, /keyUsage/);
        });

        it("refuses a VVSC with an empty key usage", async () => {
            const cert = vvscCert(await keyMaterial(), root, c => {
                c.extensions.keyUsage = {};
            });
            await expect(new Vvsc(cert).verify(crypto)).rejectedWith(CertificateError, /keyUsage/);
        });

        it("refuses a VVSC without digitalSignature", async () => {
            const cert = vvscCert(await keyMaterial(), root, c => {
                c.extensions.keyUsage = { keyCertSign: true };
            });
            await expect(new Vvsc(cert).verify(crypto)).rejectedWith(CertificateError, /keyUsage/);
        });
    });

    describe("VVSC subject DN", () => {
        it("refuses a second matter-vvs-id", async () => {
            const vvsc = withLeadingDnEntry(
                await vvscTlv(await keyMaterial(), root),
                SUBJECT_TAG,
                dnEntry(DN_TAG.vvsId, 9),
            );
            await expect(verifyVvsc(vvsc)).rejectedWith(UnexpectedDataError, /vvsId/);
        });

        it("refuses a matter-node-id", async () => {
            const vvsc = withLeadingDnEntry(
                await vvscTlv(await keyMaterial(), root),
                SUBJECT_TAG,
                dnEntry(DN_TAG.nodeId, NODE_ID),
            );
            await expect(verifyVvsc(vvsc)).rejectedWith(CertificateError, /nodeId/);
        });

        it("refuses a matter-fabric-id", async () => {
            const vvsc = withLeadingDnEntry(
                await vvscTlv(await keyMaterial(), root),
                SUBJECT_TAG,
                dnEntry(DN_TAG.fabricId, FABRIC_ID),
            );
            await expect(verifyVvsc(vvsc)).rejectedWith(CertificateError, /fabricId/);
        });
    });

    describe("matter-firmware-signing-id", () => {
        const values = { "above 32 bits": 0x1_0000_0001n, "above 53 bits": 0xffff_ffff_ffff_ffffn };

        for (const [name, value] of Object.entries(values)) {
            it(`round-trips a value ${name} through TLV and DER`, async () => {
                const rcac = Rcac.fromTlv(
                    withLeadingDnEntry(await rcacTlv(root), SUBJECT_TAG, dnEntry(DN_TAG.firmwareSigningId, value)),
                );
                const idOf = (certificate: Rcac) => BigInt(Reflect.get(certificate.cert.subject, "firmwareSigningId"));

                expect(idOf(rcac)).equals(value);
                expect(idOf(Rcac.fromTlv(rcac.asSignedTlv()))).equals(value);
                expect(idOf(Rcac.fromAsn1(rcac.asSignedDer()))).equals(value);
            });
        }
    });

    describe("DER parsing", () => {
        it("refuses a CAT with version 0", async () => {
            const der = Noc.fromTlv(
                await nocTlv(node, ica, cert => {
                    cert.subject.caseAuthenticatedTags = [CaseAuthenticatedTag(0xabcd_0001)];
                }),
            ).asSignedDer();
            const mutated = replaceOnce(der, Bytes.fromString("ABCD0001"), Bytes.fromString("ABCD0000"));

            expect(() => Noc.fromAsn1(mutated)).throws(CertificateError, /Invalid CASE Authenticated Tag "ABCD0000"/);
        });

        it("refuses a CAT that is not eight hexadecimal digits", async () => {
            const der = Noc.fromTlv(
                await nocTlv(node, ica, cert => {
                    cert.subject.caseAuthenticatedTags = [CaseAuthenticatedTag(0xabcd_0001)];
                }),
            ).asSignedDer();
            const mutated = replaceOnce(der, Bytes.fromString("ABCD0001"), Bytes.fromString("ABCD000Z"));

            expect(() => Noc.fromAsn1(mutated)).throws(CertificateError, /Invalid caseAuthenticatedTag "ABCD000Z"/);
        });

        // Characterization: passes without the fix.
        for (const count of [2, 3]) {
            it(`parses a NOC with ${count} CASE Authenticated Tags`, async () => {
                const tags = [0x0001_0001, 0x0002_0001, 0x0003_0001]
                    .slice(0, count)
                    .map(tag => CaseAuthenticatedTag(tag));
                const noc = Noc.fromTlv(
                    await nocTlv(node, ica, cert => {
                        cert.subject.caseAuthenticatedTags = tags;
                    }),
                );

                expect(Noc.fromAsn1(noc.asSignedDer()).cert.subject.caseAuthenticatedTags).deep.equals(tags);
            });
        }

        describe("Matter-specific attribute text (§6.1.1)", () => {
            const fields = [
                { field: "nodeId", octets: 8, source: "noc" },
                { field: "fabricId", octets: 8, source: "noc" },
                { field: "icacId", octets: 8, source: "noc" },
                { field: "caseAuthenticatedTag", octets: 4, source: "noc" },
                { field: "rcacId", octets: 8, source: "rcac" },
                { field: "vvsId", octets: 8, source: "rcac" },
                { field: "firmwareSigningId", octets: 8, source: "rcac" },
                { field: "vendorId", octets: 2, source: "rcac" },
                { field: "productId", octets: 2, source: "rcac" },
            ] as const;

            async function derFor(source: "noc" | "rcac", field: keyof typeof OID, text: string) {
                if (source === "rcac") {
                    return withRdn(Rcac.fromTlv(rootTlv).asSignedDer(), OID.rcacId, text, OID[field]);
                }
                const noc = Noc.fromTlv(
                    await nocTlv(node, ica, cert => {
                        cert.subject.caseAuthenticatedTags = [CaseAuthenticatedTag(0xabcd_0001)];
                    }),
                );
                return withRdn(noc.asSignedDer(), OID[field], text);
            }

            for (const { field, octets, source } of fields) {
                const zeros = (count: number) => "0".repeat(count);
                const refused = {
                    "lowercase digits": `${zeros(octets * 2 - 1)}a`,
                    "too short": zeros(octets * 2 - 1),
                    "too long": zeros(octets * 2 + 1),
                    "trailing garbage": `${zeros(octets * 2 - 1)}G`,
                    "0x prefix": `0x${zeros(octets * 2 - 2)}`,
                    empty: "",
                };
                for (const [name, text] of Object.entries(refused)) {
                    it(`refuses ${field} text that is ${name}`, async () => {
                        const der = await derFor(source, field, text);
                        const parse = () => (source === "noc" ? Noc.fromAsn1(der) : Rcac.fromAsn1(der));
                        const message = new RegExp(`Invalid ${field} `);
                        if (field === "vendorId" || field === "productId") {
                            expect(parse).throws(CertificateProfileError, message);
                        } else {
                            expect(parse).throws(CertificateError, message);
                            expect(parse).not.throws(CertificateProfileError);
                        }
                    });
                }
            }

            // Characterization: passes without the fix.
            it("accepts the maximum 64-bit value", async () => {
                const der = withRdn(Rcac.fromTlv(rootTlv).asSignedDer(), OID.rcacId, "FFFFFFFFFFFFFFFF");
                expect(Rcac.fromAsn1(der).cert.issuer.rcacId).equals(0xffff_ffff_ffff_ffffn);
            });
        });

        // Characterization: passes without the fix.
        describe("mandatory subject attribute absent from a DER certificate", () => {
            // A DER certificate does not pass the TLV schema, so verification is the check that refuses it
            it("refuses a NOC without matter-node-id", async () => {
                const der = withoutSubjectRdn(Noc.fromTlv(await nocTlv(node, ica)).asSignedDer(), OID.nodeId);
                const error = await Noc.fromAsn1(der)
                    .verify(crypto, Rcac.fromTlv(rootTlv), Icac.fromTlv(icaTlv))
                    .catch((error: unknown) => error);
                expect(error)
                    .instanceOf(CertificateError)
                    .with.property("message")
                    .match(/Invalid nodeId/);
                expect(error).not.instanceOf(OperationalNodeIdError);
            });

            it("refuses a NOC without matter-fabric-id", async () => {
                const der = withoutSubjectRdn(Noc.fromTlv(await nocTlv(node, ica)).asSignedDer(), OID.fabricId);
                await expect(
                    Noc.fromAsn1(der).verify(crypto, Rcac.fromTlv(rootTlv), Icac.fromTlv(icaTlv)),
                ).rejectedWith(CertificateError, /Invalid fabricId/);
            });

            it("refuses an ICAC without matter-icac-id", async () => {
                const der = withoutSubjectRdn(Icac.fromTlv(icaTlv).asSignedDer(), OID.icacId);
                await expect(Icac.fromAsn1(der).verify(crypto, Rcac.fromTlv(rootTlv))).rejectedWith(
                    CertificateError,
                    /Invalid icacId/,
                );
            });

            it("refuses an RCAC without matter-rcac-id", async () => {
                const der = withoutSubjectRdn(Rcac.fromTlv(rootTlv).asSignedDer(), OID.rcacId);
                await expect(Rcac.fromAsn1(der).verify(crypto)).rejectedWith(CertificateError, /Invalid rcacId/);
            });
        });

        describe("repeated attributes", () => {
            it("refuses a repeated matter-specific attribute", async () => {
                const noc = Noc.fromTlv(await nocTlv(node, ica)).asSignedDer();
                const der = withRdn(noc, OID.fabricId, "0000000000001234", OID.nodeId);
                expect(() => Noc.fromAsn1(der)).throws(CertificateError, /nodeId more than once/);
                expect(() => Noc.fromAsn1(der)).not.throws(CertificateProfileError);
            });

            // Characterization: a repeated standard attribute is not refused; the last value wins.
            it("keeps accepting a repeated standard attribute", async () => {
                const rcac = Rcac.fromTlv(
                    await rcacTlv(root, cert => {
                        cert.subject.commonName = "A";
                        cert.subject.orgName = "B";
                    }),
                ).asSignedDer();
                const der = withRdn(rcac, OID.orgName, "B", OID.commonName);
                expect(Rcac.fromAsn1(der).cert.subject.commonName).equals("B");
            });
        });
    });
});
