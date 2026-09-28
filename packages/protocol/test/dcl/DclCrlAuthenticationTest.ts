/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Paa } from "#certificate/kinds/AttestationCertificates.js";
import { jsToMatterDate, ProductId_Matter, VendorId_Matter } from "#certificate/kinds/definitions/asn.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    Bytes,
    ContextTagged,
    Crypto,
    DerCodec,
    DerObject,
    DerType,
    Environment,
    MlDsa,
    MockFetch,
    MockStorageService,
    PrivateKey,
    StandardCrypto,
    Time,
    X509,
    X520,
    X962,
} from "@matter/general";
import { VendorId } from "@matter/types";
import { buildSignedTestCrl, pemEncode, type TestCrlSigner } from "../certificate/TestHelpers.js";

const crypto = new StandardCrypto();
const REVOKED = "01AB";
const OTHER_REVOKED = "02CD";
const DAY_MS = 86_400_000;

/** A generated certificate with its key, in the forms the tests need. */
interface Issued {
    der: Bytes;
    key: PrivateKey;
    skid: Bytes;
    name: string;
    ids: { vendorId?: number; productId?: number };
    crlSigner: TestCrlSigner;
}

function nameOf(commonName: string, ids: { vendorId?: number; productId?: number } = {}) {
    return {
        commonName: X520.CommonName(commonName),
        ...(ids.vendorId === undefined ? {} : { vendorId: VendorId_Matter(VendorId(ids.vendorId)) }),
        ...(ids.productId === undefined ? {} : { productId: ProductId_Matter(ids.productId) }),
    };
}

/**
 * Issue an EC certificate.  Without `issuer` it is self-signed; `authorityKeyIdentifier: false` omits the AKID, which
 * a PAA and a PAA-delegated CRL signer may do.
 */
async function issue(
    name: string,
    options: {
        issuer?: Issued;
        ca: boolean;
        authorityKeyIdentifier?: boolean;
        /** Reuse a key, for a re-issued certificate */
        key?: PrivateKey;
        /** Sign with another key than the issuer's, for a forged certificate */
        signingKey?: PrivateKey;
        vendorId?: number;
        productId?: number;
        /** Omit the cRLSign key usage */
        withoutCrlSign?: boolean;
        /** Omit the keyCertSign key usage of a CA */
        withoutKeyCertSign?: boolean;
        /** State another issuer name than the issuer's */
        issuerName?: string;
        serialNumber?: string;
    },
): Promise<Issued> {
    const key = options.key ?? (await crypto.createKeyPair());
    const skid = Bytes.of(await crypto.computeHash(key.publicKey, "SHA-1"));
    const issuer = options.issuer;
    const akid = issuer?.skid ?? skid;
    const now = Time.now;
    const der = X509.certificateToDer(
        await X509.sign(crypto, options.signingKey ?? issuer?.key ?? key, {
            serialNumber: Bytes.fromHex(options.serialNumber ?? "01"),
            signatureAlgorithm: X962.EcdsaWithSHA256,
            issuer:
                issuer === undefined
                    ? nameOf(options.issuerName ?? name, options)
                    : nameOf(options.issuerName ?? issuer.name, issuer.ids),
            subject: nameOf(name, options),
            validity: { notBefore: new Date(now.getTime() - DAY_MS), notAfter: new Date(now.getTime() + DAY_MS) },
            publicKey: X962.PublicKeyEcPrime256v1(key.publicKey),
            extensions: {
                basicConstraints: options.ca ? { isCa: true, pathLen: issuer === undefined ? 1 : 0 } : { isCa: false },
                keyUsage: options.ca
                    ? { keyCertSign: !options.withoutKeyCertSign, cRLSign: !options.withoutCrlSign }
                    : { cRLSign: !options.withoutCrlSign, digitalSignature: options.withoutCrlSign },
                subjectKeyIdentifier: skid,
                ...(options.authorityKeyIdentifier === false ? {} : { authorityKeyIdentifier: akid }),
            },
        }),
    );
    return {
        der,
        key,
        skid,
        name,
        ids: { vendorId: options.vendorId, productId: options.productId },
        crlSigner: { key, subjectKeyId: skid, subjectDer: Bytes.of(DerCodec.encode(nameOf(name, options))) },
    };
}

const hexOf = (bytes: Bytes) => Bytes.toHex(bytes).toUpperCase();

interface Point {
    signer: { der: Bytes };
    delegator?: Issued;
    isPAA: boolean;
    vid?: number;
    pid?: number;
    /** The entry's IssuerSubjectKeyID where it should differ from the issuer looked up */
    issuerSkid?: Bytes;
    /** The DCL's SHA-256 digest of the CRL, base64 */
    dataDigest?: string;
    dataUrl?: string;
    crl: Bytes;
}

describe("DclCertificateService CRL authentication (Matter Core §6.2.6.1)", () => {
    let fetchMock: MockFetch;
    let environment: Environment;
    let service: DclCertificateService | undefined;
    let paa: Issued;

    before(async () => {
        paa = await issue("Test PAA", { ca: true });
    });

    beforeEach(() => {
        fetchMock = new MockFetch();
        environment = new Environment("test");
        new MockStorageService(environment);
        environment.set(Crypto, crypto);
    });

    afterEach(async () => {
        fetchMock.uninstall();
        await service?.close();
        service = undefined;
    });

    /** Register the distribution points for `issuerSkid` and start a service trusting `trusted`. */
    async function serve(
        issuerSkid: Bytes,
        points: Point[],
        trusted: Array<Bytes | { der: Bytes; kind: DclCertificateService.CertificateKind }> = [paa.der],
    ) {
        const skid = hexOf(issuerSkid);
        fetchMock.addResponse("/dcl/pki/root-certificates", {
            approvedRootCertificates: { schemaVersion: 0, certs: [] },
        });
        fetchMock.addResponse(`/dcl/pki/revocation-points/${skid}`, {
            pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
                issuerSubjectKeyID: skid,
                points: points.map((point, index) => ({
                    vid: point.vid ?? 0xfff1,
                    ...(point.pid === undefined ? {} : { pid: point.pid }),
                    isPAA: point.isPAA,
                    label: `point-${index}`,
                    crlSignerDelegator: point.delegator === undefined ? "" : pemEncode(point.delegator.der),
                    crlSignerCertificate: pemEncode(point.signer.der),
                    issuerSubjectKeyID: point.issuerSkid === undefined ? skid : hexOf(point.issuerSkid),
                    dataURL: point.dataUrl ?? `https://example.com/${index}.crl`,
                    dataFileSize: "",
                    dataDigest: point.dataDigest ?? "",
                    dataDigestType: point.dataDigest === undefined ? 0 : 1,
                    revocationType: 1,
                    schemaVersion: 0,
                })),
                schemaVersion: 0,
            },
        });
        points.forEach((point, index) => {
            fetchMock.addResponse(point.dataUrl ?? `https://example.com/${index}.crl`, point.crl, { binary: true });
        });
        fetchMock.install();

        service = new DclCertificateService(environment, { updateInterval: null });
        await service.construction;
        for (const entry of trusted) {
            const { der, kind } = Bytes.isBytes(entry) ? { der: entry, kind: "PAA" as const } : entry;
            await service.addCertificate(der, kind, { isProduction: false });
        }
        return service;
    }

    async function revoked(
        issuerSkid: Bytes,
        points: Point[],
        serial = REVOKED,
        trusted?: Array<Bytes | { der: Bytes; kind: DclCertificateService.CertificateKind }>,
    ) {
        return (await serve(issuerSkid, points, trusted)).isRevoked(hexOf(issuerSkid), serial);
    }

    const crlBy = (signer: TestCrlSigner, options?: Parameters<typeof buildSignedTestCrl>[3], serials = [REVOKED]) =>
        buildSignedTestCrl(crypto, signer, serials, options);

    describe("signer forms (§11.23.11.6)", () => {
        it("accepts a self-signed PAA that is approved", async () => {
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl: await crlBy(paa.crlSigner) }])).true;
        });

        it("accepts an approved self-signed PAA without an authority key identifier", async () => {
            const bare = await issue("Bare PAA", { ca: true, authorityKeyIdentifier: false });
            expect(
                await revoked(bare.skid, [{ signer: bare, isPAA: true, crl: await crlBy(bare.crlSigner) }], REVOKED, [
                    bare.der,
                ]),
            ).true;
        });

        it("ignores a self-signed signer that is not an approved PAA", async () => {
            const stranger = await issue("Stranger", { ca: true });
            expect(
                await revoked(stranger.skid, [{ signer: stranger, isPAA: true, crl: await crlBy(stranger.crlSigner) }]),
            ).false;
        });

        it("ignores a self-signed signer that differs from the approved PAA with its key", async () => {
            const reissued = await issue(paa.name, { ca: true, key: paa.key, serialNumber: "02" });
            expect(reissued.skid).deep.equals(paa.skid);
            expect(await revoked(paa.skid, [{ signer: reissued, isPAA: true, crl: await crlBy(paa.crlSigner) }])).false;
        });

        it("ignores a self-signed signer on an entry for a PAI", async () => {
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: false, crl: await crlBy(paa.crlSigner) }])).false;
        });

        for (const authorityKeyIdentifier of [true, false]) {
            it(`accepts a signer the entry's PAA delegated ${authorityKeyIdentifier ? "with" : "without"} an authority key identifier`, async () => {
                const delegate = await issue("PAA CRL signer", { issuer: paa, ca: false, authorityKeyIdentifier });
                expect(
                    await revoked(paa.skid, [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }]),
                ).true;
            });
        }

        it("ignores a PAA-delegated signer that names another issuer", async () => {
            const delegate = await issue("PAA CRL signer", { issuer: paa, ca: false, issuerName: "Not the PAA" });
            expect(await revoked(paa.skid, [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }]))
                .false;
        });

        it("accepts a PAA-delegated signer that shares its PAA's name", async () => {
            const delegate = await issue(paa.name, { issuer: paa, ca: false });
            expect(await revoked(paa.skid, [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }]))
                .true;
        });

        it("ignores a PAA-delegated signer with the PAA's name but another key's signature", async () => {
            const forger = await crypto.createKeyPair();
            const delegate = await issue("PAA CRL signer", { issuer: paa, ca: false, signingKey: forger });
            expect(await revoked(paa.skid, [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }]))
                .false;
        });

        it("ignores a PAI posing as a PAA-delegated signer", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            expect(await revoked(paa.skid, [{ signer: pai, isPAA: true, crl: await crlBy(pai.crlSigner) }])).false;
        });

        it("ignores a signer without the cRLSign key usage", async () => {
            const delegate = await issue("PAA CRL signer", { issuer: paa, ca: false, withoutCrlSign: true });
            expect(await revoked(paa.skid, [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }]))
                .false;
        });

        it("ignores a delegated signer anchored at a CD signer rather than a PAA", async () => {
            const delegate = await issue("PAA CRL signer", { issuer: paa, ca: false });
            expect(
                await revoked(
                    paa.skid,
                    [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }],
                    REVOKED,
                    [{ der: paa.der, kind: "CDSigner" }],
                ),
            ).false;
        });

        it("ignores a PAA-delegated signer another PAA issued", async () => {
            const otherPaa = await issue("Other PAA", { ca: true });
            const delegate = await issue("PAA CRL signer", { issuer: otherPaa, ca: false });
            expect(
                await revoked(
                    paa.skid,
                    [{ signer: delegate, isPAA: true, crl: await crlBy(delegate.crlSigner) }],
                    REVOKED,
                    [paa.der, otherPaa.der],
                ),
            ).false;
        });

        it("accepts a PAI signing its own CRL", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            expect(await revoked(pai.skid, [{ signer: pai, isPAA: false, crl: await crlBy(pai.crlSigner) }])).true;
        });

        it("ignores a PAI that does not chain to an approved PAA", async () => {
            const strangerPaa = await issue("Stranger PAA", { ca: true });
            const pai = await issue("Test PAI", { issuer: strangerPaa, ca: true });
            expect(await revoked(pai.skid, [{ signer: pai, isPAA: false, crl: await crlBy(pai.crlSigner) }])).false;
        });

        it("ignores a PAI signing the CRL of another issuer", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            const otherPai = await issue("Other PAI", { issuer: paa, ca: true });
            expect(await revoked(otherPai.skid, [{ signer: pai, isPAA: false, crl: await crlBy(pai.crlSigner) }]))
                .false;
        });

        it("accepts a signer a PAI delegated, given that PAI as delegator", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            const delegate = await issue("PAI CRL signer", { issuer: pai, ca: false });
            expect(
                await revoked(pai.skid, [
                    { signer: delegate, delegator: pai, isPAA: false, crl: await crlBy(delegate.crlSigner) },
                ]),
            ).true;
        });

        it("ignores a PAI-delegated signer given without its delegator", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            const delegate = await issue("PAI CRL signer", { issuer: pai, ca: false });
            expect(await revoked(pai.skid, [{ signer: delegate, isPAA: false, crl: await crlBy(delegate.crlSigner) }]))
                .false;
        });

        it("ignores a delegator that is not a PAI", async () => {
            // Issued by the approved PAA, so only its missing CA flag disqualifies it
            const notPai = await issue("Not a PAI", { issuer: paa, ca: false });
            const delegate = await issue("PAI CRL signer", { issuer: notPai, ca: false });
            expect(
                await revoked(notPai.skid, [
                    { signer: delegate, delegator: notPai, isPAA: false, crl: await crlBy(delegate.crlSigner) },
                ]),
            ).false;
        });

        it("ignores a delegator that may not sign certificates", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true, withoutKeyCertSign: true });
            const delegate = await issue("PAI CRL signer", { issuer: pai, ca: false });
            expect(
                await revoked(pai.skid, [
                    { signer: delegate, delegator: pai, isPAA: false, crl: await crlBy(delegate.crlSigner) },
                ]),
            ).false;
        });

        it("ignores a PAI-delegated signer the delegator did not issue", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            const otherPai = await issue("Other PAI", { issuer: paa, ca: true });
            const delegate = await issue("PAI CRL signer", { issuer: otherPai, ca: false });
            expect(
                await revoked(pai.skid, [
                    { signer: delegate, delegator: pai, isPAA: false, crl: await crlBy(delegate.crlSigner) },
                ]),
            ).false;
        });
    });

    describe("vendor and product (steps 3 and 4)", () => {
        it("ignores a PAA signer of another vendor", async () => {
            const vendorPaa = await issue("Vendor PAA", { ca: true, vendorId: 0xfff2 });
            expect(
                await revoked(
                    vendorPaa.skid,
                    [{ signer: vendorPaa, isPAA: true, vid: 0xfff1, crl: await crlBy(vendorPaa.crlSigner) }],
                    REVOKED,
                    [vendorPaa.der],
                ),
            ).false;
        });

        it("accepts a PAI of the entry's vendor and product", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true, vendorId: 0xfff1, productId: 0x8000 });
            expect(
                await revoked(pai.skid, [
                    { signer: pai, isPAA: false, vid: 0xfff1, pid: 0x8000, crl: await crlBy(pai.crlSigner) },
                ]),
            ).true;
        });

        it("accepts a PAI with product ID 0 on an entry the DCL states without product", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true, vendorId: 0xfff1, productId: 0 });
            expect(
                await revoked(pai.skid, [{ signer: pai, isPAA: false, vid: 0xfff1, crl: await crlBy(pai.crlSigner) }]),
            ).true;
        });

        for (const [description, pid] of [
            ["another product", 0x8001],
            ["no product", undefined],
        ] as const) {
            it(`ignores a PAI with a product ID on an entry for ${description}`, async () => {
                const pai = await issue("Test PAI", { issuer: paa, ca: true, vendorId: 0xfff1, productId: 0x8000 });
                expect(
                    await revoked(pai.skid, [
                        { signer: pai, isPAA: false, vid: 0xfff1, pid, crl: await crlBy(pai.crlSigner) },
                    ]),
                ).false;
            });
        }
    });

    describe("CRL checks", () => {
        it("ignores a CRL whose authority key identifier names another signer (step 7.1)", async () => {
            const crl = await crlBy({ ...paa.crlSigner, subjectKeyId: new Uint8Array(20) });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("accepts a CRL whose issuer encodes the signer's name as another string type (RFC 5280 §7.1)", async () => {
            const printable = Bytes.of(DerCodec.encode({ commonName: X520.CommonName(paa.name.toUpperCase(), true) }));
            const crl = await crlBy(paa.crlSigner, { issuerDnDer: printable });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).true;
        });

        it("ignores a CRL whose issuer is not the signer (RFC 5280 §5.1.2.3)", async () => {
            const crl = await crlBy(paa.crlSigner, { issuerDnDer: Bytes.of(DerCodec.encode(nameOf("Someone else"))) });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL without a signature (step 8)", async () => {
            const crl = await crlBy(paa.crlSigner, { withoutSignature: true });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL whose signature BIT STRING states unused bits (step 8)", async () => {
            const crl = await crlBy(paa.crlSigner, { signaturePadding: 1 });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL whose outer signature algorithm differs from the signed one (step 8)", async () => {
            const crl = await crlBy(paa.crlSigner, { tbsSignatureAlgorithm: MlDsa.AlgorithmIdentifier("ML-DSA-44") });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL whose signature algorithm is neither ecdsa-with-SHA256 nor ML-DSA (step 8)", async () => {
            // ecdsa-with-SHA384 stated, while the key signs with SHA-256
            const crl = await crlBy(paa.crlSigner, { signatureAlgorithm: DerObject("2a8648ce3d040303") });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL signed with a key other than the signer's (step 8)", async () => {
            const impostor = await crypto.createKeyPair();
            const crl = await crlBy({ ...paa.crlSigner, key: impostor });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL with an unsupported critical extension such as a delta CRL indicator", async () => {
            const crl = await crlBy(paa.crlSigner, {
                extensions: {
                    deltaCrlIndicator: DerObject("551d1b", { critical: true, value: DerCodec.encode(1) }),
                },
            });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });

        it("ignores a CRL whose entry carries an unsupported critical extension", async () => {
            const crl = await crlBy(paa.crlSigner, {
                entryExtensions: { unknown: DerObject("2a0304", { critical: true, value: DerCodec.encode(1) }) },
            });
            expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
        });
    });

    describe("authority name (steps 9 and 10)", () => {
        it("files the revocations of an indirect CRL under the delegating PAI's name", async () => {
            const pai = await issue("Test PAI", { issuer: paa, ca: true });
            const delegate = await issue("PAI CRL signer", { issuer: pai, ca: false });
            const crl = await crlBy(delegate.crlSigner, {
                issuerDnDer: Bytes.of(DerCodec.encode(nameOf(delegate.name))),
            });
            const dcl = await serve(pai.skid, [{ signer: delegate, delegator: pai, isPAA: false, crl }]);

            expect(await dcl.isRevoked(hexOf(pai.skid), REVOKED, hexOf(DerCodec.encode(nameOf(pai.name))))).true;
            expect(await dcl.isRevoked(hexOf(pai.skid), REVOKED, hexOf(DerCodec.encode(nameOf(delegate.name))))).false;
        });

        const certificateIssuer = (commonName: string, options: { critical?: boolean; names?: number } = {}) => {
            const names: Record<string, ReturnType<typeof ContextTagged>> = {};
            for (let i = 0; i < (options.names ?? 1); i++) {
                names[`directoryName${i}`] = ContextTagged(4, nameOf(commonName));
            }
            return DerObject("551d1d", {
                ...(options.critical === false ? {} : { critical: true }),
                value: DerCodec.encode(names),
            });
        };

        for (const [description, options] of [
            ["is not critical", { critical: false }],
            ["names more than one issuer", { names: 2 }],
        ] as const) {
            it(`ignores a CRL whose certificateIssuer ${description} (RFC 5280 §5.3.3)`, async () => {
                // Naming the authority itself, so only the malformed shape can refuse the CRL
                const crl = await crlBy(paa.crlSigner, {
                    entryExtensions: { certificateIssuer: certificateIssuer(paa.name, options) },
                });
                expect(await revoked(paa.skid, [{ signer: paa, isPAA: true, crl }])).false;
            });
        }

        it("ignores entries whose certificateIssuer names another authority (step 10.1)", async () => {
            const crl = await crlBy(
                paa.crlSigner,
                { entryExtensions: [{ certificateIssuer: certificateIssuer("Someone else") }, undefined] },
                [OTHER_REVOKED, REVOKED],
            );
            // The first entry's issuer carries over to the second (RFC 5280 §5.3.3)
            const dcl = await serve(paa.skid, [{ signer: paa, isPAA: true, crl }]);

            expect(await dcl.isRevoked(hexOf(paa.skid), OTHER_REVOKED)).false;
            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
        });

        it("keeps entries once certificateIssuer names the authority again (step 10.1)", async () => {
            const crl = await crlBy(
                paa.crlSigner,
                {
                    entryExtensions: [
                        { certificateIssuer: certificateIssuer("Someone else") },
                        { certificateIssuer: certificateIssuer(paa.name) },
                    ],
                },
                [OTHER_REVOKED, REVOKED],
            );
            const dcl = await serve(paa.skid, [{ signer: paa, isPAA: true, crl }]);

            expect(await dcl.isRevoked(hexOf(paa.skid), OTHER_REVOKED)).false;
            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).true;
        });
    });

    it("ignores an entry for another issuer in the response (§11.23.11.7)", async () => {
        // A genuine CRL of the other issuer, returned for the wrong lookup
        const other = await issue("Other PAA", { ca: true });
        const dcl = await serve(
            paa.skid,
            [{ signer: other, isPAA: true, issuerSkid: other.skid, crl: await crlBy(other.crlSigner) }],
            [paa.der, other.der],
        );

        expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
    });

    describe("partitioned revocation lists (step 7.2)", () => {
        async function partition(url: string, options: Parameters<typeof buildSignedTestCrl>[3], serials: string[]) {
            return { signer: paa, isPAA: true, dataUrl: url, crl: await crlBy(paa.crlSigner, options, serials) };
        }
        const A = "https://example.com/a.crl";
        const B = "https://example.com/b.crl";

        it("combines the revocations of every partition", async () => {
            const dcl = await serve(paa.skid, [
                await partition(A, { distributionPoint: A }, [REVOKED]),
                await partition(B, { distributionPoint: B }, [OTHER_REVOKED]),
            ]);

            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).true;
            expect(await dcl.isRevoked(hexOf(paa.skid), OTHER_REVOKED)).true;
        });

        for (const [description, options] of [
            ["does not name its URL", { distributionPoint: "https://example.com/elsewhere.crl" }],
            ["is not critical", { distributionPoint: B, distributionPointCritical: false }],
            ["names more than its URL", { distributionPoint: [B, "https://example.com/c.crl"] }],
            ["is missing", {}],
        ] as const) {
            it(`ignores a partition whose Issuing Distribution Point ${description}`, async () => {
                const dcl = await serve(paa.skid, [
                    await partition(A, { distributionPoint: A }, [REVOKED]),
                    await partition(B, options, [OTHER_REVOKED]),
                ]);

                expect(await dcl.isRevoked(hexOf(paa.skid), OTHER_REVOKED)).false;
                expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).true;
            });
        }

        it("requires no Issuing Distribution Point from entries of different vendors", async () => {
            const dcl = await serve(paa.skid, [
                { ...(await partition(A, {}, [REVOKED])), vid: 0xfff1 },
                { ...(await partition(B, {}, [OTHER_REVOKED])), vid: 0xfff2 },
            ]);

            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).true;
            expect(await dcl.isRevoked(hexOf(paa.skid), OTHER_REVOKED)).true;
        });
    });

    describe("retrying", () => {
        const crlDownloads = () =>
            fetchMock.getCallLog().filter(call => call.url.startsWith("https://example.com/")).length;

        it("does not download a rejected CRL again", async () => {
            const crl = await crlBy(paa.crlSigner, { withoutSignature: true });
            const dcl = await serve(paa.skid, [{ signer: paa, isPAA: true, crl }]);

            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
            expect(crlDownloads()).equals(1);
        });

        it("uses the partitions that did load, and loads the others again next time", async () => {
            const A = "https://example.com/a.crl";
            const B = "https://example.com/b.crl";
            const dcl = await serve(paa.skid, [
                { signer: paa, isPAA: true, dataUrl: A, crl: await crlBy(paa.crlSigner, { distributionPoint: A }) },
                {
                    signer: paa,
                    isPAA: true,
                    dataUrl: B,
                    crl: await crlBy(paa.crlSigner, { distributionPoint: B }, [OTHER_REVOKED]),
                },
            ]);
            fetchMock.addResponse(B, "unavailable", { status: 503 });

            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).true;
            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).true;
            expect(crlDownloads()).equals(4);
        });

        for (const [description, setup] of [
            ["a CRL the server does not have", (url: string) => fetchMock.addResponse(url, "gone", { status: 404 })],
            ["a CRL that does not match the DCL's digest", undefined],
        ] as const) {
            it(`does not download ${description} again`, async () => {
                const crl = await crlBy(paa.crlSigner);
                const dcl = await serve(paa.skid, [
                    { signer: paa, isPAA: true, crl, ...(setup === undefined ? { dataDigest: "AAAA" } : {}) },
                ]);
                setup?.("https://example.com/0.crl");

                expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
                expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
                expect(crlDownloads()).equals(1);
            });
        }

        it("downloads again after a transient failure", async () => {
            const dcl = await serve(paa.skid, [{ signer: paa, isPAA: true, crl: await crlBy(paa.crlSigner) }]);
            fetchMock.addResponse("https://example.com/0.crl", "unavailable", { status: 503 });

            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
            expect(await dcl.isRevoked(hexOf(paa.skid), REVOKED)).false;
            expect(crlDownloads()).equals(2);
        });
    });

    describe("ML-DSA", () => {
        async function mlDsaPaa(parameterSet: MlDsa.ParameterSet) {
            const key = await crypto.createMlDsaKeyPair(parameterSet);
            const skid = Bytes.of(await crypto.computeHash(key.publicKey, "SHA-1"));
            const name = { commonName: `Matter PQC Test PAA ${parameterSet}`, vendorId: VendorId(0xfff1) };
            const cert = new Paa({
                serialNumber: Bytes.fromHex("01"),
                signatureAlgorithm: 0,
                mlDsaSignature: parameterSet,
                publicKeyAlgorithm: 0,
                ellipticCurveIdentifier: 0,
                ellipticCurvePublicKey: new Uint8Array(),
                mlDsaPublicKey: { parameterSet, key: key.publicKey },
                issuer: name,
                subject: name,
                notBefore: jsToMatterDate(Time.now, -1),
                notAfter: jsToMatterDate(Time.now, 10),
                extensions: {
                    basicConstraints: { isCa: true, pathLen: 1 },
                    keyUsage: { keyCertSign: true, cRLSign: true },
                    subjectKeyIdentifier: skid,
                    authorityKeyIdentifier: skid,
                },
            });
            await cert.sign(crypto, key);
            const der = cert.asSignedDer();
            return { der, skid, crlSigner: { key, subjectKeyId: skid, subjectDer: Paa.fromAsn1(der).cert.subjectDer } };
        }

        it("verifies a CRL signed with ML-DSA", async () => {
            const pqc = await mlDsaPaa("ML-DSA-65");
            const crl = await crlBy(pqc.crlSigner);
            expect(await revoked(pqc.skid, [{ signer: pqc, isPAA: true, crl }], REVOKED, [pqc.der])).true;
        });

        it("ignores an ML-DSA CRL signed with another key", async () => {
            const pqc = await mlDsaPaa("ML-DSA-44");
            const other = await crypto.createMlDsaKeyPair("ML-DSA-44");
            const crl = await crlBy({ ...pqc.crlSigner, key: other });
            expect(await revoked(pqc.skid, [{ signer: pqc, isPAA: true, crl }], REVOKED, [pqc.der])).false;
        });

        it("ignores an ML-DSA CRL whose algorithm identifier carries parameters", async () => {
            const pqc = await mlDsaPaa("ML-DSA-65");
            const crl = await crlBy(pqc.crlSigner, {
                signatureAlgorithm: DerObject(MlDsa.PARAMETERS["ML-DSA-65"].oid, {
                    parameters: { _tag: DerType.Null, _bytes: new Uint8Array() },
                }),
            });
            expect(await revoked(pqc.skid, [{ signer: pqc, isPAA: true, crl }], REVOKED, [pqc.der])).false;
        });

        it("ignores an EC-signed CRL from an ML-DSA signer", async () => {
            const pqc = await mlDsaPaa("ML-DSA-65");
            const crl = await crlBy({ ...pqc.crlSigner, key: paa.key });
            expect(await revoked(pqc.skid, [{ signer: pqc, isPAA: true, crl }], REVOKED, [pqc.der])).false;
        });
    });
});
