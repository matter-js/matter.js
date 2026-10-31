/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

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
    TlvStream,
    TlvTaggedList,
    TlvType,
    TlvUInt64,
    ValidationOutOfBoundsError,
} from "@matter/types";

const crypto = new StandardCrypto();

const ISSUER_TAG = 3;
const SUBJECT_TAG = 6;
const DN_TAG = {
    nodeId: 17,
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

async function vvscTlv(vvs: KeyMaterial, root: KeyMaterial, mutate?: Mutate<OperationalCertificate.Vvsc>) {
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
    const vvsc = new Vvsc(cert);
    await vvsc.sign(crypto, root.key);
    return vvsc.asSignedTlv();
}

/** One Matter-TLV DN entry with a 64-bit unsigned value, as a stream fragment. */
function dnEntry(tag: number, value: number | bigint): TlvStream {
    const stream = TlvTaggedList({ entry: TlvField(tag, TlvUInt64) }).encodeTlv({ entry: value });
    return stream.slice(1, -1);
}

/**
 * Inserts {@link entry} as the first element of the issuer or subject DN of a signed Matter-TLV certificate.
 *
 * The signature stays valid for the DN as matter.js decodes it whenever the decoder drops the inserted entry (an
 * unknown tag) or lets the original entry overwrite it (a duplicate of a single-valued tag that comes first).  So
 * these vectors reach the DN rule under test instead of failing on the signature.
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
 * Every vector is built from a conformant certificate with one field changed and is then signed again by its issuer, so
 * the ECDSA check never hides the rule under test.
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
        it("verifies an RCAC", async () => {
            await verifyRcac(rootTlv);
        });

        it("verifies an ICAC", async () => {
            await verifyIcac(icaTlv, rootTlv);
        });

        it("verifies a NOC issued by an ICAC", async () => {
            await verifyNoc(await nocTlv(node, ica), rootTlv, icaTlv);
        });

        it("verifies a NOC issued by the RCAC", async () => {
            const noc = await nocTlv(node, root, cert => {
                cert.issuer = { rcacId: ROOT_ID };
            });
            await verifyNoc(noc, rootTlv);
        });

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
        // CHIP requires serverAuth only (FabricTable and CASESession validation contexts), so matter.js does too.
        it("verifies a NOC with serverAuth as its only key purpose", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.extendedKeyUsage = [1];
            });
            await verifyNoc(noc, rootTlv, icaTlv);
        });

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

        it("refuses a NOC whose key usage lacks digitalSignature", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.extensions.keyUsage = { keyEncipherment: true };
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /digitalSignature/);
        });
    });

    describe("NOC subject DN", () => {
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

        it("refuses a CAT with version 0", async () => {
            const noc = withLeadingDnEntry(
                await nocTlv(node, ica),
                SUBJECT_TAG,
                dnEntry(DN_TAG.caseAuthenticatedTag, 0x0001_0000),
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(ValidationOutOfBoundsError, /version/);
        });

        it("refuses node ID 0", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.nodeId = NodeId(0n);
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(OperationalNodeIdError);
        });

        it("refuses node ID 0xFFFF_FFF0_0000_0000, the first value above the operational range", async () => {
            const noc = await nocTlv(node, ica, cert => {
                cert.subject.nodeId = NodeId(0xffff_fff0_0000_0000n);
            });
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(OperationalNodeIdError);
        });

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

        it("refuses a matter-icac-id", async () => {
            const noc = await resignedNoc(
                withLeadingDnEntry(await nocTlv(node, ica), SUBJECT_TAG, dnEntry(DN_TAG.icacId, ICAC_ID)),
                ica,
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /icacId/);
        });

        it("refuses a matter-rcac-id", async () => {
            const noc = await resignedNoc(
                withLeadingDnEntry(await nocTlv(node, ica), SUBJECT_TAG, dnEntry(DN_TAG.rcacId, ROOT_ID)),
                ica,
            );
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(CertificateError, /rcacId/);
        });

        it("refuses a second matter-icac-id in the issuer DN", async () => {
            const noc = withLeadingDnEntry(await nocTlv(node, ica), ISSUER_TAG, dnEntry(DN_TAG.icacId, 9));
            await expect(verifyNoc(noc, rootTlv, icaTlv)).rejectedWith(UnexpectedDataError, /icacId/);
        });
    });

    describe("ICAC subject DN", () => {
        it("refuses an RCAC in the ICAC position", async () => {
            const noc = await nocTlv(node, root, cert => {
                cert.issuer = { rcacId: ROOT_ID };
            });
            await expect(verifyNoc(noc, rootTlv, rootTlv)).rejected;
            await expect(verifyIcac(rootTlv, rootTlv)).rejected;
        });

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
    });

    describe("RCAC subject DN and extensions", () => {
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

        it("refuses a matter-node-id", async () => {
            const rcac = await resignedRcac(
                withLeadingDnEntry(await rcacTlv(root), SUBJECT_TAG, dnEntry(DN_TAG.nodeId, NODE_ID)),
                root,
            );
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /nodeId/);
        });

        it("refuses a key usage flag beyond keyCertSign, cRLSign and digitalSignature", async () => {
            const rcac = await rcacTlv(root, cert => {
                cert.extensions.keyUsage = { keyCertSign: true, cRLSign: true, keyEncipherment: true };
            });
            await expect(verifyRcac(rcac)).rejectedWith(CertificateError, /keyUsage/);
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
});
