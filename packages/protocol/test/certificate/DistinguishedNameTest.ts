/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Unsigned } from "#certificate/kinds/common.js";
import { FabricId_Matter, jsToMatterDate, NocCat_Matter, NodeId_Matter } from "#certificate/kinds/definitions/asn.js";
import { OperationalCertificate } from "#certificate/kinds/definitions/operational.js";
import { DistinguishedName } from "#certificate/kinds/DistinguishedName.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import {
    Bytes,
    CertificateError,
    DatatypeOverride,
    DerBitString,
    DerCodec,
    DerNode,
    DerNodeDefinition,
    DerObject,
    DerType,
    PrivateKey,
    RawBytes,
    StandardCrypto,
    Time,
    X520,
    X962,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, NodeId, TlvAny, TlvType } from "@matter/types";

const crypto = new StandardCrypto();

const ROOT_ID = 1;
const NODE_ID = NodeId(0x1234n);
const FABRIC_ID = FabricId(1n);
const CAT_A = CaseAuthenticatedTag(0x0001_0001);
const CAT_B = CaseAuthenticatedTag(0x0002_0001);
const CAT_C = CaseAuthenticatedTag(0x0003_0001);

const SUBJECT_TAG = 6;
const SUBJECT_ELEMENT = 5;

/** TLV tags of the DN attributes (Matter Core § 6.5.6.1) */
const DN_TAG = { commonName: 1, orgUnitName: 8, domainComponent: 16, nodeId: 17, fabricId: 21, cat: 22 };

/** domain-component, 0.9.2342.19200300.100.1.25, written out so the test does not use the encoder under test */
function domainComponent(value: string) {
    return [DerObject("0992268993F22C640119", { value: DatatypeOverride(DerType.IA5String, value) })];
}

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

interface Chain {
    root: KeyMaterial;
    node: KeyMaterial;
    rootTlv: Bytes;
}

async function chain(): Promise<Chain> {
    const root = await keyMaterial();
    const rcac = new Rcac({
        ...commonFields(root.key.publicKey),
        issuer: { rcacId: ROOT_ID },
        subject: { rcacId: ROOT_ID },
        extensions: {
            basicConstraints: { isCa: true },
            keyUsage: { keyCertSign: true, cRLSign: true },
            subjectKeyIdentifier: root.skid,
            authorityKeyIdentifier: root.skid,
        },
    });
    await rcac.sign(crypto, root.key);
    return { root, node: await keyMaterial(), rootTlv: rcac.asSignedTlv() };
}

function nocCert({ root, node }: Chain): Unsigned<OperationalCertificate.Noc> {
    return {
        ...commonFields(node.key.publicKey),
        issuer: { rcacId: ROOT_ID },
        subject: { nodeId: NODE_ID, fabricId: FABRIC_ID },
        extensions: {
            basicConstraints: { isCa: false },
            keyUsage: { digitalSignature: true },
            extendedKeyUsage: [2, 1],
            subjectKeyIdentifier: node.skid,
            authorityKeyIdentifier: root.skid,
        },
    };
}

/**
 * A NOC in DER whose subject has the RDNs of `subject` in that order, signed by the root.  The subject is written with
 * the DER codec, not with the DN encoder under test.
 */
async function nocDer(chain: Chain, subject: Record<string, DerNodeDefinition>) {
    const tbs = DerCodec.decode(new Noc(nocCert(chain)).asUnsignedDer());
    tbs._elements![SUBJECT_ELEMENT] = DerCodec.decode(DerCodec.encode(subject));
    const tbsBytes = reencode(tbs);
    const signature = await crypto.signEcdsa(chain.root.key, tbsBytes);
    return DerCodec.encode({
        tbs: RawBytes(tbsBytes),
        signatureAlgorithm: X962.EcdsaWithSHA256,
        signature: DerBitString(signature.der),
    });
}

/** The tags of the subject DN entries of a Matter-TLV certificate, in encoded order. */
function subjectTags(tlv: Bytes) {
    const stream = TlvAny.decode(tlv);
    const start = stream.findIndex(({ tag }, index) => index > 0 && tag?.id === SUBJECT_TAG);
    const tags = new Array<number | undefined>();
    for (let index = start + 1; stream[index].typeLength.type !== TlvType.EndOfContainer; index++) {
        tags.push(stream[index].tag?.id);
    }
    return tags;
}

async function verify(tlv: Bytes, { rootTlv }: Chain) {
    await Noc.fromTlv(tlv).verify(crypto, Rcac.fromTlv(rootTlv));
}

describe("Certificate distinguished name", () => {
    describe("keeps every RDN in order", () => {
        it("for repeated commonName, organizationalUnitName and domainComponent", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                cn1: X520.CommonName("A"),
                ou1: X520.OrganizationalUnitName("Unit 1"),
                nodeId: NodeId_Matter(NODE_ID),
                dc1: domainComponent("example"),
                ou2: X520.OrganizationalUnitName("Unit 2"),
                fabricId: FabricId_Matter(FABRIC_ID),
                cn2: X520.CommonName("B"),
                dc2: domainComponent("com"),
            });

            const tlv = Noc.fromAsn1(der).asSignedTlv();
            const { commonName, orgUnitName, domainComponent: dc, nodeId } = Noc.fromTlv(tlv).cert.subject;

            expect(subjectTags(tlv)).deep.equals([
                DN_TAG.commonName,
                DN_TAG.orgUnitName,
                DN_TAG.nodeId,
                DN_TAG.domainComponent,
                DN_TAG.orgUnitName,
                DN_TAG.fabricId,
                DN_TAG.commonName,
                DN_TAG.domainComponent,
            ]);
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedDer())).equals(Bytes.toHex(der));
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedTlv())).equals(Bytes.toHex(tlv));
            expect({ commonName, orgUnitName, dc, nodeId }).deep.equals({
                commonName: "A",
                orgUnitName: "Unit 1",
                dc: "example",
                nodeId: NODE_ID,
            });
        });

        it("for CATs between other attributes", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                catA: NocCat_Matter(CAT_A),
                nodeId: NodeId_Matter(NODE_ID),
                catB: NocCat_Matter(CAT_B),
                fabricId: FabricId_Matter(FABRIC_ID),
                catC: NocCat_Matter(CAT_C),
            });

            const tlv = Noc.fromAsn1(der).asSignedTlv();

            expect(subjectTags(tlv)).deep.equals([DN_TAG.cat, DN_TAG.nodeId, DN_TAG.cat, DN_TAG.fabricId, DN_TAG.cat]);
            expect(Noc.fromTlv(tlv).cert.subject.caseAuthenticatedTags).deep.equals([CAT_A, CAT_B, CAT_C]);
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedDer())).equals(Bytes.toHex(der));
            await verify(tlv, keys);
        });
    });

    describe("verifies the signature", () => {
        it("of a NOC with a repeated organizationalUnitName, from TLV and from DER", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                nodeId: NodeId_Matter(NODE_ID),
                ou1: X520.OrganizationalUnitName("Unit 1"),
                fabricId: FabricId_Matter(FABRIC_ID),
                ou2: X520.OrganizationalUnitName("Unit 2"),
                ou3: X520.OrganizationalUnitName("Unit 3"),
            });

            await Noc.fromAsn1(der).verify(crypto, Rcac.fromTlv(keys.rootTlv));
            await verify(Noc.fromAsn1(der).asSignedTlv(), keys);
        });
    });

    describe("counts every RDN against the limit of five", () => {
        async function nocWithUnits(keys: Chain, count: number) {
            const units: Record<string, DerNodeDefinition> = {};
            for (let index = 0; index < count; index++) {
                units[`ou${index}`] = X520.OrganizationalUnitName(`Unit ${index}`);
            }
            return nocDer(keys, { nodeId: NodeId_Matter(NODE_ID), fabricId: FabricId_Matter(FABRIC_ID), ...units });
        }

        it("accepts five", async () => {
            const keys = await chain();
            const der = await nocWithUnits(keys, 3);
            await Noc.fromAsn1(der).verify(crypto, Rcac.fromTlv(keys.rootTlv));
            await verify(Noc.fromAsn1(der).asSignedTlv(), keys);
        });

        it("refuses six, from TLV and from DER", async () => {
            const keys = await chain();
            const der = await nocWithUnits(keys, 4);
            await expect(Noc.fromAsn1(der).verify(crypto, Rcac.fromTlv(keys.rootTlv))).rejectedWith(
                CertificateError,
                /more than 5 RDNs/,
            );
            await expect(verify(Noc.fromAsn1(der).asSignedTlv(), keys)).rejectedWith(
                CertificateError,
                /more than 5 RDNs/,
            );
        });
    });

    describe("a decoded subject", () => {
        async function decodedNoc(keys: Chain) {
            const der = await nocDer(keys, {
                catA: NocCat_Matter(CAT_A),
                nodeId: NodeId_Matter(NODE_ID),
                ou1: X520.OrganizationalUnitName("Unit 1"),
                fabricId: FabricId_Matter(FABRIC_ID),
                ou2: X520.OrganizationalUnitName("Unit 2"),
            });
            const { signature: _signature, ...cert } = OperationalCertificate.TlvNoc.decode(
                Noc.fromAsn1(der).asSignedTlv(),
            );
            return cert;
        }

        async function resigned(keys: Chain, cert: Unsigned<OperationalCertificate.Noc>) {
            const noc = new Noc(cert);
            await noc.sign(crypto, keys.root.key);
            return noc.asSignedTlv();
        }

        it("holds its RDN list", async () => {
            const { subject } = await decodedNoc(await chain());
            expect(subject.rdns?.map(({ type }) => type)).deep.equals([
                "caseAuthenticatedTag",
                "nodeId",
                "orgUnitName",
                "fabricId",
                "orgUnitName",
            ]);
            expect(DistinguishedName.rdnsOf(subject)).equals(subject.rdns);
        });

        it("refuses a change in place", async () => {
            const { subject } = await decodedNoc(await chain());
            expect(() => {
                subject.orgUnitName = "Changed";
            }).throws(TypeError);
            expect(() => subject.caseAuthenticatedTags?.push(CAT_B)).throws(TypeError);
            expect(Object.isFrozen(subject.rdns)).true;
        });

        it("encodes a changed copy from its properties", async () => {
            const keys = await chain();
            const cert = await decodedNoc(keys);

            const tlv = await resigned(keys, { ...cert, subject: { ...cert.subject, orgUnitName: "Changed" } });

            expect(subjectTags(tlv)).deep.equals([DN_TAG.cat, DN_TAG.nodeId, DN_TAG.orgUnitName, DN_TAG.fabricId]);
            expect(Noc.fromTlv(tlv).cert.subject.orgUnitName).equals("Changed");
            await verify(tlv, keys);
        });
    });
});
