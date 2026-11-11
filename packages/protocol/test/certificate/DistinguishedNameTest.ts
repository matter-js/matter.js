/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateProfileError } from "#certificate/kinds/Certificate.js";
import { Unsigned } from "#certificate/kinds/common.js";
import {
    FabricId_Matter,
    FirmwareSigningId_Matter,
    jsToMatterDate,
    NocCat_Matter,
    NodeId_Matter,
    ProductId_Matter,
    RcacId_Matter,
    VendorId_Matter,
} from "#certificate/kinds/definitions/asn.js";
import { OperationalCertificate } from "#certificate/kinds/definitions/operational.js";
import {
    DistinguishedName,
    distinguishedNameToAsn1,
    TlvDistinguishedName,
} from "#certificate/kinds/DistinguishedName.js";
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
    ImplementationError,
    PrivateKey,
    RawBytes,
    StandardCrypto,
    Time,
    UnexpectedDataError,
    X520,
    X962,
} from "@matter/general";
import {
    CaseAuthenticatedTag,
    FabricId,
    NodeId,
    TlvAny,
    TlvCaseAuthenticatedTag,
    TlvField,
    TlvFabricId,
    TlvNodeId,
    TlvOptionalField,
    TlvOptionalRepeatedField,
    TlvString,
    TlvType,
    TlvUInt64,
    ValidationDatatypeMismatchError,
    ValidationMandatoryFieldMissingError,
    ValidationOutOfBoundsError,
    VendorId,
} from "@matter/types";

const crypto = new StandardCrypto();

const ROOT_ID = 1;
const NODE_ID = NodeId(0x1234n);
const FABRIC_ID = FabricId(1n);
const CAT_A = CaseAuthenticatedTag(0x0001_0001);
const CAT_B = CaseAuthenticatedTag(0x0002_0001);
const CAT_C = CaseAuthenticatedTag(0x0003_0001);

const ISSUER_TAG = 3;
const SUBJECT_TAG = 6;
const ISSUER_ELEMENT = 3;
const SUBJECT_ELEMENT = 5;

/** TLV tags of the DN attributes (Matter Core § 6.5.6.1) */
const DN_TAG = { commonName: 1, orgUnitName: 8, domainComponent: 16, nodeId: 17, rcacId: 20, fabricId: 21, cat: 22 };

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
async function nocDer(
    chain: Chain,
    subject: Record<string, DerNodeDefinition>,
    issuer?: Record<string, DerNodeDefinition>,
) {
    const tbs = DerCodec.decode(new Noc(nocCert(chain)).asUnsignedDer());
    tbs._elements![SUBJECT_ELEMENT] = DerCodec.decode(DerCodec.encode(subject));
    if (issuer !== undefined) {
        tbs._elements![ISSUER_ELEMENT] = DerCodec.decode(DerCodec.encode(issuer));
    }
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
    return dnTags(tlv, SUBJECT_TAG);
}

function dnTags(tlv: Bytes, dnTag: number) {
    const stream = TlvAny.decode(tlv);
    const start = stream.findIndex(({ tag }, index) => index > 0 && tag?.id === dnTag);
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

        it("refuses a repeated commonName that the TLV decoder would cut at U+001F", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                cn1: X520.CommonName("A"),
                nodeId: NodeId_Matter(NODE_ID),
                fabricId: FabricId_Matter(FABRIC_ID),
                cn2: X520.CommonName("B\u001FC"),
            });

            expect(() => Noc.fromAsn1(der).asSignedTlv()).throws(ValidationDatatypeMismatchError, /0x1F/);
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
            expect(DistinguishedName.rdnsOf(subject)?.map(({ type }) => type)).deep.equals([
                "caseAuthenticatedTag",
                "nodeId",
                "orgUnitName",
                "fabricId",
                "orgUnitName",
            ]);
            expect(Object.hasOwn(subject, "rdns")).false;
        });

        it("refuses a change in place", async () => {
            const { subject } = await decodedNoc(await chain());
            expect(() => Object.assign(subject, { orgUnitName: "Changed" })).throws(TypeError);
            expect(() => Array.prototype.push.call(subject.caseAuthenticatedTags, CAT_B)).throws(TypeError);
            const rdns = DistinguishedName.rdnsOf(subject);
            expect(rdns).not.undefined;
            expect(Object.isFrozen(rdns)).true;
            expect(rdns?.every(rdn => Object.isFrozen(rdn))).true;
        });

        it("encodes a changed copy from its properties", async () => {
            const keys = await chain();
            const cert = await decodedNoc(keys);

            const tlv = await resigned(keys, { ...cert, subject: { ...cert.subject, orgUnitName: "Changed" } });

            expect(subjectTags(tlv)).deep.equals([DN_TAG.cat, DN_TAG.nodeId, DN_TAG.orgUnitName, DN_TAG.fabricId]);
            expect(Noc.fromTlv(tlv).cert.subject.orgUnitName).equals("Changed");
            await verify(tlv, keys);
        });

        it("encodes a copy with a forged RDN list from its properties", async () => {
            const keys = await chain();
            const cert = await decodedNoc(keys);
            const subject = { ...cert.subject, orgUnitName: "Changed" };
            Object.defineProperty(subject, "rdns", { value: DistinguishedName.rdnsOf(cert.subject) });

            const tlv = await resigned(keys, { ...cert, subject });

            expect(subjectTags(tlv)).deep.equals([DN_TAG.cat, DN_TAG.nodeId, DN_TAG.orgUnitName, DN_TAG.fabricId]);
            expect(Noc.fromTlv(tlv).cert.subject.orgUnitName).equals("Changed");
        });

        it("refuses to encode a copy with an enumerable RDN list property", async () => {
            const cert = await decodedNoc(await chain());
            const subject = { ...cert.subject, rdns: DistinguishedName.rdnsOf(cert.subject) };

            expect(() => distinguishedNameToAsn1(subject)).throws(ImplementationError, /"rdns"/);
        });
    });

    describe("PrintableString attributes", () => {
        const PRINTABLE_STRING_ATTRIBUTES = {
            commonNamePs: X520.CommonName,
            surNamePs: X520.SurName,
            serialNumPs: X520.SerialNumber,
            countryNamePs: X520.CountryName,
            localityNamePs: X520.LocalityName,
            stateOrProvinceNamePs: X520.StateOrProvinceName,
            orgNamePs: X520.OrganisationName,
            orgUnitNamePs: X520.OrganizationalUnitName,
            titlePs: X520.Title,
            namePs: X520.Name,
            givenNamePs: X520.GivenName,
            initialsPs: X520.Initials,
            genQualifierPs: X520.GenerationQualifier,
            dnQualifierPs: X520.DnQualifier,
            pseudonymPs: X520.Pseudonym,
        };

        for (const [name, attribute] of Object.entries(PRINTABLE_STRING_ATTRIBUTES)) {
            it(`round trips ${name} from DER to TLV to DER`, async () => {
                const keys = await chain();
                const der = await nocDer(keys, {
                    nodeId: NodeId_Matter(NODE_ID),
                    fabricId: FabricId_Matter(FABRIC_ID),
                    attribute: attribute("Text", true),
                });

                const tlv = Noc.fromAsn1(der).asSignedTlv();

                expect(DistinguishedName.rdnsOf(Noc.fromTlv(tlv).cert.subject)?.map(({ type }) => type)).deep.equals([
                    "nodeId",
                    "fabricId",
                    name,
                ]);
                expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedDer())).equals(Bytes.toHex(der));
            });
        }

        it("round trips a commonNamePs that carries a VendorID and a ProductID", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                nodeId: NodeId_Matter(NODE_ID),
                fabricId: FabricId_Matter(FABRIC_ID),
                commonName: X520.CommonName("Mvid:FFF1 Mpid:8000", true),
            });

            const noc = Noc.fromAsn1(der);
            const tlv = noc.asSignedTlv();
            const derSubject: DistinguishedName.View = noc.cert.subject;
            const tlvSubject: DistinguishedName.View = Noc.fromTlv(tlv).cert.subject;

            expect(derSubject.vendorId).equals(0xfff1);
            expect(tlvSubject.vendorId).undefined;
            expect(subjectTags(tlv)).deep.equals([DN_TAG.nodeId, DN_TAG.fabricId, 129]);
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedDer())).equals(Bytes.toHex(der));
        });

        it("reads a PrintableString domainComponent as domainComponent", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                nodeId: NodeId_Matter(NODE_ID),
                fabricId: FabricId_Matter(FABRIC_ID),
                dc: [
                    DerObject("0992268993F22C640119", { value: DatatypeOverride(DerType.PrintableString, "example") }),
                ],
            });

            const noc = Noc.fromAsn1(der);

            expect(noc.cert.subject.domainComponent).equals("example");
            expect(subjectTags(noc.asSignedTlv())).deep.equals([
                DN_TAG.nodeId,
                DN_TAG.fabricId,
                DN_TAG.domainComponent,
            ]);
        });
    });

    describe("an issuer", () => {
        it("round trips repeated attributes and interleaved CATs and verifies the signature", async () => {
            const keys = await chain();
            const der = await nocDer(
                keys,
                { nodeId: NodeId_Matter(NODE_ID), fabricId: FabricId_Matter(FABRIC_ID) },
                {
                    cn1: X520.CommonName("Issuer A"),
                    catA: NocCat_Matter(CAT_A),
                    rcacId: RcacId_Matter(ROOT_ID),
                    ou1: X520.OrganizationalUnitName("Unit"),
                    catB: NocCat_Matter(CAT_B),
                    cn2: X520.CommonName("Issuer B"),
                },
            );
            const rootKey = Rcac.fromTlv(keys.rootTlv).publicKey;

            const tlv = Noc.fromAsn1(der).asSignedTlv();

            expect(dnTags(tlv, ISSUER_TAG)).deep.equals([
                DN_TAG.commonName,
                DN_TAG.cat,
                DN_TAG.rcacId,
                DN_TAG.orgUnitName,
                DN_TAG.cat,
                DN_TAG.commonName,
            ]);
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedDer())).equals(Bytes.toHex(der));
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedTlv())).equals(Bytes.toHex(tlv));
            await Noc.fromAsn1(der).verifySignature(crypto, rootKey);
            await Noc.fromTlv(tlv).verifySignature(crypto, rootKey);
        });
    });

    describe("a DN built in code", () => {
        const fiveRdns: DistinguishedName.View = {
            nodeId: NODE_ID,
            fabricId: FABRIC_ID,
            caseAuthenticatedTags: [CAT_A, CAT_B, CAT_C],
        };

        async function verifyInMemory(subject: Unsigned<OperationalCertificate.Noc>["subject"]) {
            const keys = await chain();
            const noc = new Noc({ ...nocCert(keys), subject });
            await noc.sign(crypto, keys.root.key);
            await noc.verify(crypto, Rcac.fromTlv(keys.rootTlv));
        }

        it("counts one RDN per property and per CAT", () => {
            expect(DistinguishedName.rdnCount(fiveRdns)).equals(5);
            expect(DistinguishedName.rdnCount({ ...fiveRdns, orgUnitName: "Unit" })).equals(6);
        });

        it("accepts five RDNs and refuses six when verified", async () => {
            await verifyInMemory({
                nodeId: NODE_ID,
                fabricId: FABRIC_ID,
                caseAuthenticatedTags: [CAT_A, CAT_B, CAT_C],
            });
            await expect(
                verifyInMemory({
                    nodeId: NODE_ID,
                    fabricId: FABRIC_ID,
                    caseAuthenticatedTags: [CAT_A, CAT_B, CAT_C],
                    orgUnitName: "Unit",
                }),
            ).rejectedWith(CertificateError, /more than 5 RDNs/);
        });

        it("keeps the CATs in the order given", async () => {
            const keys = await chain();
            const noc = new Noc({
                ...nocCert(keys),
                subject: { nodeId: NODE_ID, fabricId: FABRIC_ID, caseAuthenticatedTags: [CAT_C, CAT_A, CAT_B] },
            });
            await noc.sign(crypto, keys.root.key);

            const decoded = Noc.fromTlv(noc.asSignedTlv());

            expect(Noc.fromAsn1(noc.asSignedDer()).cert.subject.caseAuthenticatedTags).deep.equals([
                CAT_C,
                CAT_A,
                CAT_B,
            ]);
            expect(decoded.cert.subject.caseAuthenticatedTags).deep.equals([CAT_C, CAT_A, CAT_B]);
            expect(
                DistinguishedName.rdnsOf(decoded.cert.subject)?.flatMap(rdn =>
                    rdn.type === "caseAuthenticatedTag" ? [rdn.value] : [],
                ),
            ).deep.equals([CAT_C, CAT_A, CAT_B]);
        });

        it("keeps CATs out of ascending order between other attributes of a decoded DN", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                catC: NocCat_Matter(CAT_C),
                nodeId: NodeId_Matter(NODE_ID),
                catA: NocCat_Matter(CAT_A),
                fabricId: FabricId_Matter(FABRIC_ID),
                catB: NocCat_Matter(CAT_B),
            });

            const tlv = Noc.fromAsn1(der).asSignedTlv();

            expect(Noc.fromTlv(tlv).cert.subject.caseAuthenticatedTags).deep.equals([CAT_C, CAT_A, CAT_B]);
            expect(subjectTags(tlv)).deep.equals([DN_TAG.cat, DN_TAG.nodeId, DN_TAG.cat, DN_TAG.fabricId, DN_TAG.cat]);
            expect(Bytes.toHex(Noc.fromTlv(tlv).asSignedDer())).equals(Bytes.toHex(der));
        });

        it("leaves out a VendorID that its commonNamePs carries", () => {
            expect(
                Object.keys(distinguishedNameToAsn1({ commonNamePs: "Mvid:FFF1", vendorId: VendorId(0xfff1) })),
            ).deep.equals(["rdn0"]);
        });

        it("leaves out a VendorID that a later commonName carries", () => {
            expect(
                Object.keys(
                    distinguishedNameToAsn1({
                        commonName: "Plain",
                        commonNamePs: "Mvid:FFF1",
                        vendorId: VendorId(0xfff1),
                    }),
                ),
            ).deep.equals(["rdn0", "rdn1"]);
        });

        it("keeps a VendorID that no commonName carries", () => {
            expect(
                Object.keys(distinguishedNameToAsn1({ commonName: "Plain", vendorId: VendorId(0xfff1) })),
            ).deep.equals(["rdn0", "rdn1"]);
        });

        // Characterization: passes without the RDN list too
        it("encodes its current properties after a change", () => {
            const dn: { commonName: string; orgUnitName?: string } = { commonName: "Plain" };
            expect(DistinguishedName.rdnCount(dn)).equals(1);

            dn.orgUnitName = "Unit";

            expect(DistinguishedName.rdnCount(dn)).equals(2);
            expect(DistinguishedName.rdnsOf(dn)).undefined;
        });

        it("skips a property whose value is undefined", () => {
            const dn = { commonName: "Plain", unknown: undefined };

            expect(Object.keys(distinguishedNameToAsn1(dn))).deep.equals(["rdn0"]);
        });

        for (const name of ["unknown", "caseAuthenticatedTag"]) {
            it(`refuses to encode a property ${name}`, async () => {
                const keys = await chain();
                const subject = { nodeId: NODE_ID, fabricId: FABRIC_ID, [name]: CAT_A };
                const noc = new Noc({ ...nocCert(keys), subject });

                expect(() => distinguishedNameToAsn1(subject)).throws(ImplementationError, `"${name}"`);
                expect(() => noc.asUnsignedDer()).throws(ImplementationError, `"${name}"`);
                expect(() => OperationalCertificate.TlvNoc.encode({ ...noc.cert, signature: Bytes.empty })).throws(
                    ImplementationError,
                    `"${name}"`,
                );
            });
        }
    });

    describe("a copy of a decoded DN with a VendorID or ProductID", () => {
        const base = { nodeId: NodeId_Matter(NODE_ID), fabricId: FabricId_Matter(FABRIC_ID) };

        /** Decode `subject` from DER, copy it with spread, encode the copy and decode that again. */
        async function reencodedCopy(subject: Record<string, DerNodeDefinition>) {
            const keys = await chain();
            const decoded: DistinguishedName.View = Noc.fromAsn1(await nocDer(keys, subject)).cert.subject;
            const copy: DistinguishedName.View = { ...decoded };
            const asn1 = distinguishedNameToAsn1(copy);
            const again: DistinguishedName.View = Noc.fromAsn1(await nocDer(keys, asn1)).cert.subject;
            return { decoded, copy, asn1, again };
        }

        it("encodes to TLV when the commonName gives the VendorID and ProductID", async () => {
            const keys = await chain();
            const der = await nocDer(keys, { ...base, commonName: X520.CommonName("Matter Mvid:FFF1 Mpid:8000") });
            const { subject } = Noc.fromAsn1(der).cert;

            const noc = new Noc({ ...nocCert(keys), subject: { ...subject } });
            await noc.sign(crypto, keys.root.key);
            const tlv = noc.asSignedTlv();

            expect(subjectTags(tlv)).deep.equals([DN_TAG.nodeId, DN_TAG.fabricId, DN_TAG.commonName]);
            await verify(tlv, keys);
        });

        it("keeps a VendorID attribute that differs from the one in the commonName", async () => {
            const { decoded, copy, again } = await reencodedCopy({
                ...base,
                commonName: X520.CommonName("Matter Mvid:FFF1"),
                vendorId: VendorId_Matter(VendorId(0xfff2)),
            });

            expect(decoded.vendorId).equals(0xfff2);
            expect(DistinguishedName.rdnsOf(copy)).undefined;
            expect(again.vendorId).equals(0xfff2);
        });

        it("leaves out the attributes when the commonName gives the same values", async () => {
            const { copy, asn1, again } = await reencodedCopy({
                ...base,
                commonName: X520.CommonName("Matter Mvid:FFF1 Mpid:8000"),
            });

            expect(Object.keys(asn1)).deep.equals(["rdn0", "rdn1", "rdn2"]);
            expect(DistinguishedName.rdnCount(copy)).equals(3);
            expect(again.vendorId).equals(0xfff1);
            expect(again.productId).equals(0x8000);
        });

        it("keeps both attributes when only one of them equals the commonName value", async () => {
            const { again } = await reencodedCopy({
                ...base,
                commonName: X520.CommonName("Matter Mvid:FFF1"),
                vendorId: VendorId_Matter(VendorId(0xfff1)),
                productId: ProductId_Matter(0x8000),
            });

            expect(again.vendorId).equals(0xfff1);
            expect(again.productId).equals(0x8000);
        });

        it("keeps a ProductID attribute next to a commonName with another ProductID", async () => {
            const { again } = await reencodedCopy({
                ...base,
                commonName: X520.CommonName("Matter Mvid:FFF1 Mpid:8000"),
                productId: ProductId_Matter(0x8001),
            });

            expect(again.vendorId).undefined;
            expect(again.productId).equals(0x8001);
        });

        it("encodes a commonName with a malformed prefix next to a VendorID attribute", async () => {
            const { again } = await reencodedCopy({
                ...base,
                commonName: X520.CommonName("Matter Mvid:"),
                vendorId: VendorId_Matter(VendorId(0xfff1)),
            });

            expect(again.vendorId).equals(0xfff1);
        });
    });

    describe("a DN built in code with a VendorID next to a commonName with a ProductID", () => {
        it("keeps the VendorID", async () => {
            const keys = await chain();
            const subject: DistinguishedName.View = {
                nodeId: NODE_ID,
                fabricId: FABRIC_ID,
                commonName: "X Mpid:8000",
                vendorId: VendorId(0xfff1),
            };

            const decoded: DistinguishedName.View = Noc.fromAsn1(await nocDer(keys, distinguishedNameToAsn1(subject)))
                .cert.subject;

            expect(decoded.vendorId).equals(0xfff1);
            expect(decoded.productId).undefined;
        });
    });

    describe("a DER certificate with a VendorID in its subject", () => {
        it("cannot be converted to TLV", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                nodeId: NodeId_Matter(NODE_ID),
                fabricId: FabricId_Matter(FABRIC_ID),
                vendorId: VendorId_Matter(VendorId(0xfff1)),
            });

            expect(() => Noc.fromAsn1(der).asSignedTlv()).throws(
                ValidationDatatypeMismatchError,
                /vendorId.*not defined in the TLV DN schema/,
            );
        });
    });

    describe("a repeated firmware signing ID", () => {
        it("is refused in DER", async () => {
            const keys = await chain();
            const der = await nocDer(keys, {
                nodeId: NodeId_Matter(NODE_ID),
                fabricId: FabricId_Matter(FABRIC_ID),
                fw1: FirmwareSigningId_Matter(1),
                fw2: FirmwareSigningId_Matter(2),
            });

            expect(() => Noc.fromAsn1(der)).throws(CertificateError, /firmwareSigningId more than once/);
            expect(() => Noc.fromAsn1(der)).not.throws(CertificateProfileError);
        });
    });

    describe("the TLV schema", () => {
        const schema = TlvDistinguishedName({
            commonName: TlvOptionalField(1, TlvString),
            firmwareSigningId: TlvOptionalField(18, TlvUInt64),
            nodeId: TlvField(17, TlvNodeId),
            fabricId: TlvField(21, TlvFabricId),
            caseAuthenticatedTags: TlvOptionalRepeatedField(22, TlvCaseAuthenticatedTag, { maxLength: 3 }),
        });

        const u64 = (tagId: number, value: bigint) =>
            `27${tagId.toString(16).padStart(2, "0")}${value.toString(16).padStart(16, "0").match(/../g)!.reverse().join("")}`;
        const u32 = (tagId: number, value: number) =>
            `26${tagId.toString(16).padStart(2, "0")}${value.toString(16).padStart(8, "0").match(/../g)!.reverse().join("")}`;
        const NODE = u64(17, 0x1234n);
        const FABRIC = u64(21, 1n);
        const list = (...entries: string[]) => Bytes.fromHex(`17${entries.join("")}18`);

        it("decodes the entries of a list", () => {
            const dn = schema.decode(list(NODE, u32(22, CAT_A), FABRIC));

            expect(dn).deep.equals({ nodeId: NODE_ID, fabricId: FABRIC_ID, caseAuthenticatedTags: [CAT_A] });
            expect(DistinguishedName.rdnsOf(dn)?.map(({ type }) => type)).deep.equals([
                "nodeId",
                "caseAuthenticatedTag",
                "fabricId",
            ]);
        });

        it("skips an unknown context tag, also one with a container value", () => {
            const dn = schema.decode(list("246301", NODE, "356324010518", FABRIC));

            expect(DistinguishedName.rdnsOf(dn)?.map(({ type }) => type)).deep.equals(["nodeId", "fabricId"]);
        });

        // Characterization: CHIP writes a PrintableString domainComponent with tag 144, which the specification does not define.
        it("skips tag 144 of a PrintableString domainComponent", () => {
            const dn = schema.decode(list(NODE, "2c9003616263", FABRIC));

            expect(DistinguishedName.rdnsOf(dn)?.map(({ type }) => type)).deep.equals(["nodeId", "fabricId"]);
        });

        for (const validate of [true, false]) {
            it(`refuses a missing mandatory field when validate is ${validate}`, () => {
                expect(() => schema.decode(list(NODE), validate)).throws(
                    ValidationMandatoryFieldMissingError,
                    /fabricId/,
                );
            });
        }

        it("refuses more than three CATs", () => {
            expect(() =>
                schema.decode(list(NODE, FABRIC, u32(22, CAT_A), u32(22, CAT_B), u32(22, CAT_C), u32(22, 0x0004_0001))),
            ).throws(ValidationOutOfBoundsError);
        });

        it("refuses to encode a decoded DN with two CATs of one identifier to DER", () => {
            const dn = schema.decode(list(NODE, FABRIC, u32(22, CAT_A), u32(22, 0x0001_0002)));

            expect(() => distinguishedNameToAsn1(dn)).throws(ValidationOutOfBoundsError, /duplicate/);
        });

        it("refuses a value that is not a list", () => {
            expect(() => schema.decode(Bytes.fromHex(`15${NODE}${FABRIC}18`))).throws(
                UnexpectedDataError,
                /Unexpected type/,
            );
        });

        it("refuses an entry with a profile tag", () => {
            expect(() => schema.decode(list(NODE, FABRIC, "44010001"))).throws(
                UnexpectedDataError,
                /should be context-specific/,
            );
        });

        it("refuses an entry without a tag", () => {
            expect(() => schema.decode(list(NODE, FABRIC, "0401"))).throws(UnexpectedDataError, /should have an id/);
        });

        it("refuses a repeated firmware signing ID", () => {
            expect(() => schema.decode(list(NODE, FABRIC, u64(18, 1n), u64(18, 2n)))).throws(
                CertificateError,
                /firmwareSigningId more than once/,
            );
        });
    });

    describe("equality", () => {
        it("compares a decoded identifier with the same value as bigint", async () => {
            const { subject } = Rcac.fromTlv((await chain()).rootTlv).cert;
            expect(typeof subject.rcacId).equal("number");
            expect(DistinguishedName.areEqual(subject, { rcacId: BigInt(ROOT_ID) })).true;
        });

        it("refuses another value, another attribute, another order and another count", () => {
            expect(DistinguishedName.areEqual({ icacId: 1 }, { icacId: 2 })).false;
            expect(DistinguishedName.areEqual({ commonName: "a" }, { commonName: "b" })).false;
            expect(DistinguishedName.areEqual({ icacId: 1 }, { rcacId: 1 })).false;
            expect(DistinguishedName.areEqual({ icacId: 1, commonName: "a" }, { commonName: "a", icacId: 1 })).false;
            expect(DistinguishedName.areEqual({ icacId: 1 }, { icacId: 1, commonName: "a" })).false;
        });
    });
});
