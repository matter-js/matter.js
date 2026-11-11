/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { jsToMatterDate } from "#certificate/kinds/definitions/asn.js";
import { Icac } from "#certificate/kinds/Icac.js";
import { Noc, OperationalNodeIdError } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import {
    AbortedError,
    Bytes,
    CertificateError,
    ImplementationError,
    MemoryStorageDriver,
    PrivateKey,
    StandardCrypto,
    StorageContext,
    StorageManager,
    Time,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, NodeId, ValidationOutOfBoundsError } from "@matter/types";

const crypto = new StandardCrypto();

describe("CertificateAuthority", () => {
    describe("2-tier PKI (default)", () => {
        it("creates a new CA without ICAC", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const rootCert = ca.rootCert;
            const icacCert = ca.icacCert;

            expect(rootCert).ok;
            expect(icacCert).undefined;

            const rcac = Rcac.fromTlv(rootCert);
            expect(BigInt(rcac.cert.subject.rcacId)).equal(BigInt(0));
        });

        it("generates NOC signed by root", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n), [
                CaseAuthenticatedTag(0x00010001),
            ]);

            const nocCert = Noc.fromTlv(noc);
            expect(BigInt(nocCert.cert.issuer.rcacId!)).equal(BigInt(0));
            expect(nocCert.cert.issuer.icacId).undefined;
        });

        it("refuses a NOC whose node ID is outside the operational range", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(0xffff_ffff_0000_0001n));

            await expect(Noc.fromTlv(noc).verify(crypto, Rcac.fromTlv(ca.rootCert))).rejectedWith(
                OperationalNodeIdError,
            );
        });

        it("verifies a NOC whose node ID is in the operational range", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n));

            await Noc.fromTlv(noc).verify(crypto, Rcac.fromTlv(ca.rootCert));
        });

        it("persists and loads from storage", async () => {
            const storage = new StorageManager(new MemoryStorageDriver());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, context);
            const rootCert1 = ca1.rootCert;

            const ca2 = new CertificateAuthority(crypto, context);
            await ca2.construction;
            const rootCert2 = ca2.rootCert;

            expect(Bytes.toHex(rootCert1)).equal(Bytes.toHex(rootCert2));
            expect(ca2.icacCert).undefined;

            await storage.close();
        });
    });

    describe("3-tier PKI with ICAC", () => {
        it("creates a CA with ICAC when intermediateCert=true", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const rootCert = ca.rootCert;
            const icacCert = ca.icacCert;

            expect(rootCert).ok;
            expect(icacCert).ok;

            const rcac = Rcac.fromTlv(rootCert);
            const icac = Icac.fromTlv(icacCert!);

            expect(BigInt(rcac.cert.subject.rcacId)).equal(BigInt(0));
            expect(BigInt(icac.cert.subject.icacId)).equal(BigInt(1));
            expect(BigInt(icac.cert.issuer.rcacId!)).equal(BigInt(0));
        });

        it("generates NOC signed by ICAC when ICAC exists", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n));

            const nocCert = Noc.fromTlv(noc);
            expect(BigInt(nocCert.cert.issuer.icacId!)).equal(BigInt(1));
            expect(nocCert.cert.issuer.rcacId).undefined;
        });

        // Characterization: passes without the fix.
        it("generates an ICAC and NOC that verify against the root", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n), [
                CaseAuthenticatedTag(0x00010001),
            ]);

            const root = Rcac.fromTlv(ca.rootCert);
            const icac = Icac.fromTlv(ca.icacCert!);
            await root.verify(crypto);
            await icac.verify(crypto, root);
            await Noc.fromTlv(noc).verify(crypto, root, icac);
        });

        it("names the full subject of a stored ICAC as the issuer of its NOCs", async () => {
            const { rootCertId, rootKeyIdentifier, rootCertBytes, rootKeyPair } = (
                await CertificateAuthority.create(crypto)
            ).config;
            if (rootKeyPair === undefined) {
                throw new ImplementationError("The CA needs its root key pair");
            }
            const icacKey = await crypto.createKeyPair();
            const icacKeyIdentifier = Bytes.of(await crypto.computeHash(icacKey.publicKey, "SHA-1"));
            const storedIcac = new Icac({
                serialNumber: Bytes.fromHex("02"),
                signatureAlgorithm: 1,
                publicKeyAlgorithm: 1,
                ellipticCurveIdentifier: 1,
                issuer: Rcac.fromTlv(rootCertBytes).cert.subject,
                notBefore: jsToMatterDate(Time.now, -1),
                notAfter: jsToMatterDate(Time.now, 10),
                subject: { icacId: 2n, fabricId: FabricId(1n) },
                ellipticCurvePublicKey: icacKey.publicKey,
                extensions: {
                    basicConstraints: { isCa: true },
                    keyUsage: { keyCertSign: true, cRLSign: true },
                    subjectKeyIdentifier: icacKeyIdentifier,
                    authorityKeyIdentifier: rootKeyIdentifier,
                },
            });
            await storedIcac.sign(crypto, PrivateKey(rootKeyPair));
            const ca = await CertificateAuthority.create(crypto, {
                rootCertId,
                rootKeyIdentifier,
                rootCertBytes,
                rootKeyPair,
                icacCertId: 2n,
                icacKeyPair: icacKey.keyPair,
                icacKeyIdentifier,
                icacCertBytes: storedIcac.asSignedTlv(),
                nextCertificateId: 100n,
            });

            const noc = await ca.generateNoc((await crypto.createKeyPair()).publicKey, FabricId(1n), NodeId(100n));

            await Noc.verifyChain(crypto, rootCertBytes, noc, ca.icacCert);
        });

        it("persists ICAC to storage", async () => {
            const storage = new StorageManager(new MemoryStorageDriver());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, true);
            const icacCert1 = ca1.icacCert;
            const config1 = ca1.config;
            await context.set(config1);

            const ca2 = new CertificateAuthority(crypto, config1);
            await ca2.construction;
            const icacCert2 = ca2.icacCert;

            expect(icacCert1).ok;
            expect(icacCert2).ok;
            expect(Bytes.toHex(icacCert1!)).equal(Bytes.toHex(icacCert2!));

            await storage.close();
        });

        it("auto-detects ICAC from storage when ica option not provided", async () => {
            const storage = new StorageManager(new MemoryStorageDriver());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, true);
            await ca1.construction;
            expect(ca1.icacCert).ok;

            await context.set(ca1.config);

            const ca2 = new CertificateAuthority(crypto, context);
            await ca2.construction;

            expect(ca2.icacCert).ok;

            await storage.close();
        });

        it("loads ICAC from storage and sets intermediateCert=true (storage takes precedence)", async () => {
            const storage = new StorageManager(new MemoryStorageDriver());
            await storage.initialize();
            const context = storage.createContext("test");

            const ca1 = await CertificateAuthority.create(crypto, true);
            await ca1.construction;
            expect(ca1.icacCert).ok;

            await context.set(ca1.config);

            const ca2 = new CertificateAuthority(crypto, context);
            await ca2.construction;

            expect(ca2.icacCert).ok;

            await storage.close();
        });
    });

    describe("Configuration behavior", () => {
        let storage: StorageManager;
        let context: StorageContext;

        beforeEach(async () => {
            storage = new StorageManager(new MemoryStorageDriver());
            await storage.initialize();
            context = storage.createContext("test");
        });

        afterEach(async () => {
            await storage.close();
        });

        it("throws ImplementationError when intermediateCert=true but no ICAC data in storage", async () => {
            const ca1 = await CertificateAuthority.create(crypto, context, false);
            await ca1.construction;

            await expect(CertificateAuthority.create(crypto, context, true)).rejectedWith(
                "Stored credentials contain ICAC certificate: false, but configuration expected it to be true",
            );
        });

        it("throws ImplementationError when ICAC data exists but intermediateCert=false", async () => {
            const ca1 = await CertificateAuthority.create(crypto, context, true);
            await ca1.construction;

            await expect(CertificateAuthority.create(crypto, context, false)).rejectedWith(
                "Stored credentials contain ICAC certificate: true, but configuration expected it to be false",
            );
        });
    });

    describe("Certificate ID management", () => {
        it("increments certificate IDs correctly", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair1 = await crypto.createKeyPair();
            const keyPair2 = await crypto.createKeyPair();

            const noc1 = await ca.generateNoc(keyPair1.publicKey, FabricId(1n), NodeId(100n));
            const noc2 = await ca.generateNoc(keyPair2.publicKey, FabricId(1n), NodeId(101n));

            const nocCert1 = Noc.fromTlv(noc1);
            const nocCert2 = Noc.fromTlv(noc2);

            const id1 = BigInt("0x" + Bytes.toHex(nocCert1.cert.serialNumber));
            const id2 = BigInt("0x" + Bytes.toHex(nocCert2.cert.serialNumber));

            expect(id2).equal(id1 + 1n);
        });

        it("allocates ICAC cert ID before NOC IDs", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const icacCert = Icac.fromTlv(ca.icacCert!);
            const icacId = BigInt("0x" + Bytes.toHex(icacCert.cert.serialNumber));

            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n));
            const nocCert = Noc.fromTlv(noc);
            const nocId = BigInt("0x" + Bytes.toHex(nocCert.cert.serialNumber));

            expect(icacId).equal(BigInt(1));
            expect(nocId).equal(BigInt(2));
        });
    });

    describe("Configuration export", () => {
        it("exports complete configuration with ICAC", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const config = ca.config as CertificateAuthority.ConfigurationWithIcac;

            expect(BigInt(config.rootCertId)).equal(BigInt(0));
            expect(BigInt(config.icacCertId)).equal(BigInt(1));
            expect(config.icacKeyPair).ok;
            expect(config.icacKeyIdentifier).ok;
            expect(config.icacCertBytes).ok;
        });

        it("can reconstruct CA from exported config", async () => {
            const ca1 = await CertificateAuthority.create(crypto, true);
            const config = ca1.config;

            const ca2 = await CertificateAuthority.create(crypto, config);
            const rootCert1 = ca1.rootCert;
            const rootCert2 = ca2.rootCert;
            const icacCert1 = ca1.icacCert;
            const icacCert2 = ca2.icacCert;

            expect(Bytes.toHex(rootCert1)).equal(Bytes.toHex(rootCert2));
            expect(Bytes.toHex(icacCert1!)).equal(Bytes.toHex(icacCert2!));
        });
    });

    describe("SKI derivation", () => {
        it("derives root SKI as 160-bit SHA-1 of the public key (RFC 5280 method-1)", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const rcac = Rcac.fromTlv(ca.rootCert);
            const ski = rcac.cert.extensions.subjectKeyIdentifier;

            expect(ski.byteLength).equal(20);

            const expected = Bytes.of(await crypto.computeHash(rcac.cert.ellipticCurvePublicKey, "SHA-1"));
            expect(Bytes.toHex(ski)).equal(Bytes.toHex(expected));
            expect(Bytes.toHex(rcac.cert.extensions.authorityKeyIdentifier!)).equal(Bytes.toHex(ski));
        });

        it("derives ICAC SKI as 160-bit SHA-1 of the public key", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const icac = Icac.fromTlv(ca.icacCert!);
            const ski = icac.cert.extensions.subjectKeyIdentifier;

            expect(ski.byteLength).equal(20);

            const expected = Bytes.of(await crypto.computeHash(icac.cert.ellipticCurvePublicKey, "SHA-1"));
            expect(Bytes.toHex(ski)).equal(Bytes.toHex(expected));
        });

        it("derives NOC SKI as 160-bit SHA-1 of the public key", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const keyPair = await crypto.createKeyPair();
            const noc = Noc.fromTlv(await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n)));
            const ski = noc.cert.extensions.subjectKeyIdentifier!;

            expect(ski.byteLength).equal(20);

            const expected = Bytes.of(await crypto.computeHash(noc.cert.ellipticCurvePublicKey, "SHA-1"));
            expect(Bytes.toHex(ski)).equal(Bytes.toHex(expected));
            const rcac = Rcac.fromTlv(ca.rootCert);
            expect(Bytes.toHex(noc.cert.extensions.authorityKeyIdentifier!)).equal(
                Bytes.toHex(rcac.cert.extensions.subjectKeyIdentifier),
            );
        });
    });

    describe("NOC generation with CATs", () => {
        it("generates NOC with CASE Authenticated Tags", async () => {
            const ca = await CertificateAuthority.create(crypto, true);
            const keyPair = await crypto.createKeyPair();
            const cats = [CaseAuthenticatedTag(0x00010001), CaseAuthenticatedTag(0x00020001)];
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n), cats);

            const nocCert = Noc.fromTlv(noc);
            expect(nocCert.cert.subject.caseAuthenticatedTags).deep.equal(cats);
        });

        // Characterization: passes without the fix.
        // The signature covers the X.509 DN in this order, so decoding must keep it and never sort the keys.
        it("keeps the subject DN order fabric ID, node ID, CATs", async () => {
            const ca = await CertificateAuthority.create(crypto);
            const keyPair = await crypto.createKeyPair();
            const noc = await ca.generateNoc(keyPair.publicKey, FabricId(1n), NodeId(100n), [
                CaseAuthenticatedTag(0x00010001),
            ]);

            const nocCert = Noc.fromTlv(noc);
            expect(Object.keys(nocCert.cert.subject)).deep.equal(["fabricId", "nodeId", "caseAuthenticatedTags"]);
            await nocCert.verify(crypto, Rcac.fromTlv(ca.rootCert));
        });
    });

    describe("external issuer", () => {
        type Request = CertificateAuthority.Issuer.NocRequest;

        async function createIssuer(
            options: {
                intermediateCert?: boolean;
                issue?: (
                    signer: CertificateAuthority,
                    request: Request,
                ) => Promise<CertificateAuthority.Issuer.IssuedNoc>;
                fabric?: CertificateAuthority.Issuer.Fabric;
            } = {},
        ) {
            const signer = await CertificateAuthority.create(crypto, options.intermediateCert ?? false);
            const requests = new Array<Request>();
            const issuer: CertificateAuthority.Issuer = {
                rootCert: signer.rootCert,
                fabric: options.fabric,
                issueNoc(request) {
                    requests.push(request);
                    return options.issue?.(signer, request) ?? signer.issueNoc(request);
                },
            };
            const ca = await CertificateAuthority.create(crypto, issuer);
            return { signer, ca, requests };
        }

        async function request(overrides: Partial<Request> = {}): Promise<Request> {
            return {
                publicKey: (await crypto.createKeyPair()).publicKey,
                fabricId: FabricId(1n),
                nodeId: NodeId(100n),
                ...overrides,
            };
        }

        it("uses the issuer's root certificate", async () => {
            const { signer, ca } = await createIssuer();

            expect(Bytes.toHex(ca.rootCert)).equal(Bytes.toHex(signer.rootCert));
            expect(ca.icacCert).undefined;
        });

        it("returns the issuer's NOC with the ICAC that signed it", async () => {
            const { signer, ca, requests } = await createIssuer({ intermediateCert: true });
            const cats = [CaseAuthenticatedTag(0x0001_0001)];

            const { noc, icac } = await ca.issueNoc(await request({ caseAuthenticatedTags: cats }));

            expect(requests.length).equal(1);
            expect(requests[0].caseAuthenticatedTags).deep.equal(cats);
            expect(icac).deep.equal(signer.icacCert);
            await Noc.fromTlv(noc).verify(crypto, Rcac.fromTlv(signer.rootCert), Icac.fromTlv(icac!));
        });

        it("forwards the device's attestation and CSR responses to the issuer", async () => {
            const { ca, requests } = await createIssuer();
            const evidence: CertificateAuthority.Issuer.CommissioningEvidence = {
                dac: Bytes.fromHex("01"),
                pai: Bytes.fromHex("02"),
                attestationElements: Bytes.fromHex("03"),
                attestationSignature: Bytes.fromHex("04"),
                attestationNonce: Bytes.fromHex("05"),
                attestationChallenge: Bytes.fromHex("06"),
                nocsrElements: Bytes.fromHex("07"),
                nocsrSignature: Bytes.fromHex("08"),
                csrNonce: Bytes.fromHex("09"),
            };

            await ca.issueNoc(await request({ evidence }));

            expect(requests[0].evidence).deep.equal(evidence);
        });

        it("provides the issuer's fabric, and none for the built-in issuer", async () => {
            const fabric = {
                fabricId: FabricId(7n),
                identityProtectionKey: Bytes.fromHex("000102030405060708090a0b0c0d0e0f"),
            };
            const { ca } = await createIssuer({ fabric });

            expect(ca.fabric).deep.equal(fabric);
            expect((await CertificateAuthority.create(crypto)).fabric).undefined;
        });

        it("refuses an IPK that is not 16 bytes", async () => {
            await expect(
                createIssuer({ fabric: { fabricId: FabricId(7n), identityProtectionKey: Bytes.fromHex("0001") } }),
            ).rejectedWith(ImplementationError);
        });

        it("renews its own NOC at start only when the issuer asks for it", async () => {
            const { ca } = await createIssuer();
            const signer = await CertificateAuthority.create(crypto);
            const renewing = await CertificateAuthority.create(crypto, {
                rootCert: signer.rootCert,
                renewNocAtStart: true,
                issueNoc: request => signer.issueNoc(request),
            });

            expect(ca.renewsNocAtStart).false;
            expect(renewing.renewsNocAtStart).true;
            expect(signer.renewsNocAtStart).true;
        });

        it("accepts an empty ICAC as none", async () => {
            const { ca } = await createIssuer({
                issue: async (signer, request) => ({
                    noc: (await signer.issueNoc(request)).noc,
                    icac: new Uint8Array(0),
                }),
            });

            await ca.issueNoc(await request());
        });

        /** A CA with only the root of {@link signer}, so it signs NOCs with the root key. */
        async function rootOnly(signer: CertificateAuthority) {
            const { rootCertId, rootKeyIdentifier, rootCertBytes, rootKeyPair } = signer.config;
            if (rootKeyPair === undefined) {
                throw new ImplementationError("The signer needs its root key pair");
            }
            return CertificateAuthority.create(crypto, {
                rootCertId,
                rootKeyIdentifier,
                rootCertBytes,
                rootKeyPair,
                nextCertificateId: 100n,
            });
        }

        it("refuses a NOC the root signed when the issuer returns an ICAC with it", async () => {
            const { ca } = await createIssuer({
                intermediateCert: true,
                issue: async (signer, request) => {
                    const { noc } = await (await rootOnly(signer)).issueNoc(request);
                    return { noc, icac: signer.icacCert };
                },
            });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError, "did not sign");
        });

        it("does not ask the issuer when the request is already aborted", async () => {
            const { ca, requests } = await createIssuer();
            const abort = new AbortController();
            abort.abort(new AbortedError("test abort"));

            await expect(ca.issueNoc(await request({ abort: abort.signal }))).rejectedWith(AbortedError);
            expect(requests.length).equal(0);
        });

        it("refuses a NOC for another node", async () => {
            const { ca } = await createIssuer({
                issue: (signer, request) => signer.issueNoc({ ...request, nodeId: NodeId(101n) }),
            });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError);
        });

        it("refuses a NOC with other CATs", async () => {
            const { ca } = await createIssuer({
                issue: (signer, request) => signer.issueNoc({ ...request, caseAuthenticatedTags: undefined }),
            });

            await expect(
                ca.issueNoc(await request({ caseAuthenticatedTags: [CaseAuthenticatedTag(0x0001_0001)] })),
            ).rejectedWith(CertificateError);
        });

        it("refuses a NOC for another public key", async () => {
            const other = (await crypto.createKeyPair()).publicKey;
            const { ca } = await createIssuer({
                issue: (signer, request) => signer.issueNoc({ ...request, publicKey: other }),
            });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError);
        });

        it("refuses a NOC that does not chain to the root", async () => {
            const foreign = await CertificateAuthority.create(crypto);
            const { ca } = await createIssuer({ issue: (_signer, request) => foreign.issueNoc(request) });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError);
        });

        it("refuses a NOC for another fabric", async () => {
            const { ca } = await createIssuer({
                issue: (signer, request) => signer.issueNoc({ ...request, fabricId: FabricId(2n) }),
            });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError);
        });

        it("refuses a NOC with another CAT of the same count", async () => {
            const { ca } = await createIssuer({
                issue: (signer, request) =>
                    signer.issueNoc({ ...request, caseAuthenticatedTags: [CaseAuthenticatedTag(0x0002_0001)] }),
            });

            await expect(
                ca.issueNoc(await request({ caseAuthenticatedTags: [CaseAuthenticatedTag(0x0001_0001)] })),
            ).rejectedWith(CertificateError);
        });

        it("refuses an ICAC that does not chain to the root", async () => {
            const foreign = await CertificateAuthority.create(crypto, true);
            const { ca } = await createIssuer({ issue: (_signer, request) => foreign.issueNoc(request) });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError);
        });

        it("refuses bytes that are not a NOC as CertificateError", async () => {
            const { ca } = await createIssuer({ issue: async () => ({ noc: Bytes.fromHex("0102") }) });

            await expect(ca.issueNoc(await request())).rejectedWith(CertificateError);
        });

        it("refuses a root certificate whose signature does not verify", async () => {
            const signer = await CertificateAuthority.create(crypto);
            const rootCert = Bytes.of(signer.rootCert).slice();
            rootCert[rootCert.length - 2] ^= 0xff;

            await expect(
                CertificateAuthority.create(crypto, { rootCert, issueNoc: request => signer.issueNoc(request) }),
            ).rejectedWith(ImplementationError, "Root certificate of the external issuer is invalid");
        });

        it("refuses an invalid CAT list before it calls the issuer", async () => {
            const { ca, requests } = await createIssuer();
            const tags = [CaseAuthenticatedTag(0x0001_0001), CaseAuthenticatedTag(0x0001_0002)];

            await expect(ca.issueNoc(await request({ caseAuthenticatedTags: tags }))).rejectedWith(
                ValidationOutOfBoundsError,
            );
            expect(requests.length).equal(0);
        });

        it("stops waiting for the issuer when the request aborts", async () => {
            const { ca } = await createIssuer({ issue: () => new Promise(() => {}) });
            const abort = new AbortController();

            const issued = ca.issueNoc(await request({ abort: abort.signal }));
            abort.abort(new AbortedError("test abort"));

            await expect(issued).rejectedWith(AbortedError);
        });

        it("has no configuration to export", async () => {
            const { ca } = await createIssuer();

            expect(() => ca.config).throws(ImplementationError, "external issuer holds no key material");
        });

        it("stops issuing after erase", async () => {
            const { ca, requests } = await createIssuer();
            await ca.erase();

            await expect(ca.issueNoc(await request())).rejected;
            expect(requests.length).equal(0);
        });
    });
});
