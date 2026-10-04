/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestCert_PAA_NoVID_Cert } from "#certificate/ChipPAAuthorities.js";
import {
    DeviceAttestationCheck,
    DeviceAttestationError,
    DeviceAttestationValidator,
} from "#certificate/DeviceAttestationValidator.js";
import { DeviceCertification } from "#certificate/DeviceCertification.js";
import { Dac, Paa, Pai } from "#certificate/kinds/AttestationCertificates.js";
import { Certificate } from "#certificate/kinds/Certificate.js";
import { CertificatePublicKey, MlDsaSignature } from "#certificate/kinds/CertificateSignature.js";
import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
import { jsToMatterDate, matterToJsDate } from "#certificate/kinds/definitions/asn.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { TlvAttestation } from "#common/OperationalCredentialsTypes.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    asError,
    Bytes,
    CertificateError,
    Crypto,
    CryptoVerifyError,
    DerCodec,
    DerBitString,
    DerObject,
    DerType,
    EcdsaSignature,
    Environment,
    ImplementationError,
    MlDsa,
    MockFetch,
    MockStorageService,
    ObjectId,
    Pem,
    PrivateKey,
    StandardCrypto,
    Time,
    X509,
    X520,
    X962,
} from "@matter/general";
import { Specification } from "@matter/model";
import { VendorId } from "@matter/types";
import { AnnexHCertificates } from "./PqcAnnexHCertificates.js";

const crypto = new StandardCrypto();

// Absent in the browser run
const nodeCrypto = typeof process === "undefined" ? undefined : process.getBuiltinModule?.("node:crypto");
const der = (name: keyof typeof AnnexHCertificates) => Pem.asDer(AnnexHCertificates[name]);

function flipBit(bytes: Bytes, index: number) {
    const copy = Uint8Array.from(Bytes.of(bytes));
    copy[index] ^= 0x01;
    return copy;
}

describe("PQC Phase 1 attestation certificates", () => {
    MockForwardFeatures.enable("pqc-phase-1");

    describe("Annex H examples", () => {
        const expected: Array<[keyof typeof AnnexHCertificates, "Paa" | "Pai" | "Dac", string, string]> = [
            ["paaMlDsa65", "Paa", "ML-DSA-65", "ML-DSA-65"],
            ["paaMlDsa44", "Paa", "ML-DSA-44", "ML-DSA-44"],
            ["paiMlDsa65ByPaaMlDsa65", "Pai", "ML-DSA-65", "ML-DSA-65"],
            ["paiMlDsa44ByPaaMlDsa65", "Pai", "ML-DSA-44", "ML-DSA-65"],
            ["paiEcdsaByPaaMlDsa65", "Pai", "ECDSA-P256", "ML-DSA-65"],
            ["paiMlDsa44ByPaaMlDsa44", "Pai", "ML-DSA-44", "ML-DSA-44"],
            ["paiEcdsaByPaaMlDsa44", "Pai", "ECDSA-P256", "ML-DSA-44"],
            ["dacByPaiMlDsa65", "Dac", "ECDSA-P256", "ML-DSA-65"],
            ["dacByPaiMlDsa44", "Dac", "ECDSA-P256", "ML-DSA-44"],
        ];

        const parse = { Paa: Paa.fromAsn1, Pai: Pai.fromAsn1, Dac: Dac.fromAsn1 };

        for (const [name, kind, keyAlgorithm, signatureAlgorithm] of expected) {
            it(`parses ${name} as a ${kind} with a ${keyAlgorithm} key signed with ${signatureAlgorithm}`, () => {
                const cert = parse[kind](der(name));
                const { signature } = cert;

                expect(cert.publicKey.algorithm).equals(keyAlgorithm);
                expect(signature instanceof MlDsaSignature ? signature.parameterSet : "ecdsa-with-SHA256").equals(
                    signatureAlgorithm,
                );
            });

            it(`re-encodes ${name} byte for byte`, () => {
                expect(Bytes.toHex(parse[kind](der(name)).asSignedDer())).equals(Bytes.toHex(der(name)));
            });
        }

        const chain: Array<[() => Pai | Dac, () => Paa | Pai]> = [
            [() => Pai.fromAsn1(der("paiMlDsa65ByPaaMlDsa65")), () => Paa.fromAsn1(der("paaMlDsa65"))],
            [() => Pai.fromAsn1(der("paiMlDsa44ByPaaMlDsa65")), () => Paa.fromAsn1(der("paaMlDsa65"))],
            [() => Pai.fromAsn1(der("paiEcdsaByPaaMlDsa65")), () => Paa.fromAsn1(der("paaMlDsa65"))],
            [() => Pai.fromAsn1(der("paiMlDsa44ByPaaMlDsa44")), () => Paa.fromAsn1(der("paaMlDsa44"))],
            [() => Pai.fromAsn1(der("paiEcdsaByPaaMlDsa44")), () => Paa.fromAsn1(der("paaMlDsa44"))],
            [() => Dac.fromAsn1(der("dacByPaiMlDsa65")), () => Pai.fromAsn1(der("paiMlDsa65ByPaaMlDsa65"))],
            [() => Dac.fromAsn1(der("dacByPaiMlDsa44")), () => Pai.fromAsn1(der("paiMlDsa44ByPaaMlDsa65"))],
        ];

        chain.forEach(([subject, issuer], index) => {
            it(`verifies chain link ${index + 1} against its issuer's key`, async () => {
                await subject().verifySignature(crypto, issuer().publicKey);
            });
        });

        it("verifies a PAA's self-signature", async () => {
            const paa = Paa.fromAsn1(der("paaMlDsa44"));
            await paa.verifySignature(crypto, paa.publicKey);
        });

        it("rejects an issuer key of another algorithm", async () => {
            const pai = Pai.fromAsn1(der("paiMlDsa44ByPaaMlDsa65"));

            await expect(pai.verifySignature(crypto, Paa.fromAsn1(der("paaMlDsa44")).publicKey)).rejectedWith(
                CertificateError,
                /Signature is ML-DSA-65 but the signer key is ML-DSA-44/,
            );
            await expect(
                Dac.fromAsn1(der("dacByPaiMlDsa65")).verifySignature(
                    crypto,
                    Pai.fromAsn1(der("paiEcdsaByPaaMlDsa65")).publicKey,
                ),
            ).rejectedWith(CertificateError, /Signature is ML-DSA-65 but the signer key is ECDSA-P256/);
        });

        it("rejects an ML-DSA issuer key for an ECDSA signature", async () => {
            const ecdsaSigned = await buildChain({ paa: "ML-DSA-65", pai: "ECDSA-P256" });
            const dac = Dac.fromAsn1(ecdsaSigned.dacDer);

            await expect(dac.verifySignature(crypto, Paa.fromAsn1(der("paaMlDsa65")).publicKey)).rejectedWith(
                CertificateError,
                /Signature is ecdsa-with-SHA256 but the signer key is ML-DSA-65/,
            );
        });

        it("rejects a tampered certificate", async () => {
            const tampered = Pai.fromAsn1(flipBit(der("paiMlDsa65ByPaaMlDsa65"), 200));

            await expect(tampered.verifySignature(crypto, Paa.fromAsn1(der("paaMlDsa65")).publicKey)).rejectedWith(
                CryptoVerifyError,
            );
        });

        it("rejects an ML-DSA key in a DAC", () => {
            expect(() => Dac.fromAsn1(der("paiMlDsa44ByPaaMlDsa44"))).throws(CertificateError, /EC P-256/);
        });

        it("rejects a DAC key of an unsupported algorithm", async () => {
            const { paaKey, paiDer } = await buildChain({ paa: "ECDSA-P256", pai: "ECDSA-P256" });
            if (MlDsa.isPrivateKey(paaKey)) {
                throw new ImplementationError("Expected an EC PAA key");
            }
            // A PAI's DER re-signed with an unknown key algorithm OID is DAC-shaped enough for this check
            const original = Pai.fromAsn1(paiDer);
            const { signature: _signature, ...unsigned } = x509Of(original);
            const signed = await X509.sign(crypto, paaKey, {
                ...unsigned,
                publicKey: {
                    type: { algorithm: ObjectId("2a0304"), curve: X962.PublicKeyAlgorithmEcPublicKeyP256 },
                    bytes: DerBitString(original.cert.ellipticCurvePublicKey),
                },
            });

            expect(() => Dac.fromAsn1(X509.certificateToDer(signed))).throws(CertificateError, /neither EC P-256/);
        });

        it("rejects ML-DSA certificates where only traditional certificates are allowed", () => {
            expect(() => Noc.fromAsn1(der("paaMlDsa44"))).throws(CertificateError, /600 byte limit/);
            expect(() => Certificate.parseAsn1Certificate(der("paiMlDsa44ByPaaMlDsa44"))).throws(
                CertificateError,
                /600 byte limit/,
            );
        });
    });

    describe("parsing", () => {
        // Parsing rejects these before any signature check, so the altered bytes need no new signature
        function rewrite(from: string, to: string) {
            const hex = Bytes.toHex(der("paiMlDsa44ByPaaMlDsa44"));
            expect(hex.split(from).length).equals(2);
            return Bytes.fromHex(hex.replace(from, to));
        }

        it("rejects differing inner and outer signature algorithms", () => {
            // The outer AlgorithmIdentifier follows the TBSCertificate; replace only the second id-ml-dsa-44
            const hex = Bytes.toHex(der("paiMlDsa44ByPaaMlDsa44"));
            const oid = "0609608648016503040311";
            const outer = hex.lastIndexOf(oid);
            const altered = Bytes.fromHex(
                hex.slice(0, outer) + "0609608648016503040312" + hex.slice(outer + oid.length),
            );

            expect(() => Pai.fromAsn1(altered)).throws(CertificateError, /differs/);
        });

        it("rejects an ML-DSA signature of the wrong length", () => {
            const pai = Pai.fromAsn1(der("paiMlDsa44ByPaaMlDsa44"));
            const shortened = X509.certificateToDer({
                ...x509Of(pai),
                signature: Bytes.of(new Uint8Array(2419)),
            });

            expect(() => Pai.fromAsn1(shortened)).throws(CertificateError, /Invalid ML-DSA-44 signature/);
        });

        it("rejects an ML-DSA signature algorithm with parameters", async () => {
            const { paaKey, paiDer } = await buildChain({ paa: "ML-DSA-44", pai: "ECDSA-P256" });
            if (!MlDsa.isPrivateKey(paaKey)) {
                throw new ImplementationError("Expected an ML-DSA PAA key");
            }
            const withParameters = DerObject(MlDsa.PARAMETERS["ML-DSA-44"].oid, {
                parameters: { _tag: DerType.Null, _bytes: new Uint8Array() },
            });
            const { signature: _signature, ...parsed } = x509Of(Pai.fromAsn1(paiDer));
            const unsigned = { ...parsed, signatureAlgorithm: withParameters };
            const signed = X509.certificateToDer({
                ...unsigned,
                signature: await crypto.signMlDsa(paaKey, X509.certificateToDer(unsigned)),
            });

            expect(() => Pai.fromAsn1(signed)).throws(CertificateError, /must not carry parameters/);
        });

        it("rejects an ML-DSA signature BIT STRING with unused bits", () => {
            // 2420-byte signature: BIT STRING of 2421 content octets, the first stating the unused bits
            const altered = rewrite("0382097500", "0382097501");

            expect(() => Pai.fromAsn1(altered)).throws(CertificateError, /without unused bits/);
        });

        it("rejects an ML-DSA signature that is not a BIT STRING", () => {
            // Re-tag the 2420-byte signature as an OCTET STRING, which drops the unused-bits octet
            const hex = Bytes.toHex(der("paiMlDsa44ByPaaMlDsa44"));
            expect(hex.startsWith("30820f")).true;
            const outerLength = parseInt(hex.slice(4, 8), 16) - 1;
            const altered = Bytes.fromHex(
                `3082${outerLength.toString(16).padStart(4, "0")}${hex.slice(8).replace("0382097500", "04820974")}`,
            );

            expect(() => Pai.fromAsn1(altered)).throws(CertificateError, /must be a BIT STRING/);
        });

        it("rejects an ML-DSA public key that is not canonical RFC 9881", () => {
            // BIT STRING of the 1312-byte key with one unused bit instead of none
            const altered = rewrite("0382052100", "0382052101");

            expect(() => Pai.fromAsn1(altered)).throws(CertificateError, /Invalid ML-DSA-44 public key/);
        });

        async function ecSignedPai(alter: (cert: X509.UnsignedCertificate, key: Bytes) => X509.UnsignedCertificate) {
            const { paaKey, paaDer, paiDer } = await buildChain({ paa: "ECDSA-P256", pai: "ECDSA-P256" });
            if (MlDsa.isPrivateKey(paaKey)) {
                throw new ImplementationError("Expected an EC PAA key");
            }
            const original = Pai.fromAsn1(paiDer);
            const { signature: _signature, ...unsigned } = x509Of(original);
            const signed = await X509.sign(crypto, paaKey, alter(unsigned, original.cert.ellipticCurvePublicKey));
            return { pai: Pai.fromAsn1(X509.certificateToDer(signed)), paa: Paa.fromAsn1(paaDer) };
        }

        it("refuses a public key of an unsupported algorithm", async () => {
            const { pai } = await ecSignedPai((cert, key) => ({
                ...cert,
                publicKey: {
                    type: { algorithm: ObjectId("2a0304"), curve: X962.PublicKeyAlgorithmEcPublicKeyP256 },
                    bytes: DerBitString(key),
                },
            }));

            expect(() => pai.publicKey).throws(CertificateError, /neither EC P-256 nor ML-DSA/);
        });

        it("refuses an EC key on an unsupported curve", async () => {
            const { pai } = await ecSignedPai((cert, key) => ({
                ...cert,
                publicKey: {
                    type: { algorithm: X962.PublicKeyAlgorithmEcPublicKey, curve: ObjectId("2b81040022") },
                    bytes: DerBitString(key),
                },
            }));

            expect(() => pai.publicKey).throws(CertificateError, /neither EC P-256 nor ML-DSA/);
        });

        it("refuses to verify a signature of an unsupported algorithm", async () => {
            // ecdsa-with-SHA384 declared, while X509.sign still signs with SHA-256
            const { pai, paa } = await ecSignedPai(cert => ({
                ...cert,
                signatureAlgorithm: DerObject("2a8648ce3d040303"),
            }));

            await expect(pai.verifySignature(crypto, paa.publicKey)).rejectedWith(
                CertificateError,
                /neither ecdsa-with-SHA256 nor ML-DSA/,
            );
        });

        it("rejects a signature algorithm that is not an OBJECT IDENTIFIER", async () => {
            const { paiDer } = await buildChain({ paa: "ECDSA-P256", pai: "ECDSA-P256" });
            const hex = Bytes.toHex(paiDer);
            const algorithm = "300a06082a8648ce3d040302";
            expect(hex.split(algorithm).length).equals(3);

            const altered = Bytes.fromHex(hex.replaceAll(algorithm, "300a02082a8648ce3d040302"));

            expect(() => Pai.fromAsn1(altered)).throws(CertificateError, /Invalid signature algorithm structure/);
        });

        for (const [description, from, to, message] of [
            [
                "a public key algorithm that is not an OBJECT IDENTIFIER",
                "06072a8648ce3d0201",
                "02072a8648ce3d0201",
                /Invalid public key algorithm structure/,
            ],
            [
                "a curve that is not an OBJECT IDENTIFIER",
                "06082a8648ce3d030107",
                "02082a8648ce3d030107",
                /Invalid public key algorithm structure/,
            ],
            ["an EC key BIT STRING with unused bits", "0342000", "0342010", /without unused bits/],
        ] as const) {
            it(`rejects ${description}`, async () => {
                const { paiDer } = await buildChain({ paa: "ECDSA-P256", pai: "ECDSA-P256" });
                const hex = Bytes.toHex(paiDer);
                expect(hex.split(from).length).equals(2);

                expect(() => Pai.fromAsn1(Bytes.fromHex(hex.replace(from, to)))).throws(CertificateError, message);
            });
        }

        it("rejects a traditional attestation certificate larger than 600 bytes", async () => {
            const { paaKey, paiDer } = await buildChain({ paa: "ECDSA-P256", pai: "ECDSA-P256" });
            if (MlDsa.isPrivateKey(paaKey)) {
                throw new ImplementationError("Expected an EC PAA key");
            }
            const pai = Pai.fromAsn1(paiDer);
            const bulky = await X509.sign(crypto, paaKey, {
                ...x509Of(pai),
                extensions: {
                    ...pai.cert.extensions,
                    futureExtension: [DerCodec.encode(DerObject("2a0304", { value: new Uint8Array(200) }))],
                },
            });
            const bulkyDer = X509.certificateToDer(bulky);

            expect(bulkyDer.byteLength).greaterThan(600);
            expect(() => Pai.fromAsn1(bulkyDer)).throws(CertificateError, /600 byte limit/);
        });
    });

    describe("generation", () => {
        const layouts: Array<{ paa: Algorithm; pai: Algorithm }> = [
            { paa: "ML-DSA-65", pai: "ML-DSA-44" },
            { paa: "ML-DSA-44", pai: "ML-DSA-44" },
            { paa: "ML-DSA-65", pai: "ECDSA-P256" },
        ];

        for (const layout of layouts) {
            it(`creates a ${layout.paa} PAA, a ${layout.pai} PAI and a DAC that verify`, async () => {
                const { paaDer, paiDer, dacDer } = await buildChain(layout);
                const paa = Paa.fromAsn1(paaDer);
                const pai = Pai.fromAsn1(paiDer);
                const dac = Dac.fromAsn1(dacDer);

                expect(paa.publicKey.algorithm).equals(layout.paa);
                expect(pai.publicKey.algorithm).equals(layout.pai);
                expect(dac.publicKey.algorithm).equals("ECDSA-P256");
                await paa.verifySignature(crypto, paa.publicKey);
                await pai.verifySignature(crypto, paa.publicKey);
                await dac.verifySignature(crypto, pai.publicKey);
            });
        }

        it("creates certificates OpenSSL accepts", async function () {
            const { paaDer, paiDer, dacDer } = await buildChain({ paa: "ML-DSA-65", pai: "ML-DSA-44" });
            if (nodeCrypto === undefined || !opensslParses(der("paaMlDsa65"))) {
                this.skip();
            }

            const paa = new nodeCrypto.X509Certificate(Bytes.of(paaDer));
            const pai = new nodeCrypto.X509Certificate(Bytes.of(paiDer));
            const dac = new nodeCrypto.X509Certificate(Bytes.of(dacDer));

            expect(paa.verify(paa.publicKey)).true;
            expect(pai.verify(paa.publicKey)).true;
            expect(dac.verify(pai.publicKey)).true;
        });

        it("refuses a key that does not match the declared signature algorithm", async () => {
            const mlDsaKey = await crypto.createMlDsaKeyPair("ML-DSA-44");
            const ecKey = await crypto.createKeyPair();

            const declaresMlDsa65 = unsignedPai("ML-DSA-65", { algorithm: "ECDSA-P256", key: ecKey.publicKey });
            await expect(declaresMlDsa65.sign(crypto, mlDsaKey)).rejectedWith(ImplementationError, /ML-DSA-44 key/);
            await expect(declaresMlDsa65.sign(crypto, ecKey)).rejectedWith(ImplementationError, /EC key/);

            const declaresEcdsa = unsignedPai(undefined, { algorithm: "ECDSA-P256", key: ecKey.publicKey });
            await expect(declaresEcdsa.sign(crypto, mlDsaKey)).rejectedWith(ImplementationError, /ML-DSA-44 key/);
        });

        it("refuses a signature object of another algorithm", async () => {
            const ecKey = await crypto.createKeyPair();
            const pai = unsignedPai("ML-DSA-44", { algorithm: "ECDSA-P256", key: ecKey.publicKey });

            expect(() => {
                pai.signature = new EcdsaSignature(new Uint8Array(64));
            }).throws(ImplementationError, /ML-DSA-44/);
        });
    });

    describe("trust store", () => {
        let fetchMock: MockFetch;
        let environment: Environment;
        let service: DclCertificateService | undefined;

        beforeEach(() => {
            fetchMock = new MockFetch();
            fetchMock.addResponse("/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();
            environment = new Environment("test");
            new MockStorageService(environment);
            environment.set(Crypto, crypto);
        });

        afterEach(async () => {
            fetchMock.uninstall();
            await service?.close();
            service = undefined;
        });

        it("seeds an ML-DSA PAA", async () => {
            service = new DclCertificateService(environment, {
                seed: {
                    paaRoots: {
                        builtAt: "2026-09-28T00:00:00Z",
                        expectedCount: 1,
                        entries: (async function* () {
                            yield {
                                role: "paa" as const,
                                subjectKeyId: PAA_MLDSA65_SKID.toLowerCase(),
                                derHex: Bytes.toHex(der("paaMlDsa65")),
                                kind: "production" as const,
                            };
                        })(),
                    },
                },
                updateInterval: null,
            });
            await service.construction;

            expect(service.getCertificate(PAA_MLDSA65_SKID)).not.undefined;
        });

        it("serves a stored ML-DSA PAA without trying to repair it", async () => {
            service = new DclCertificateService(environment, { updateInterval: null });
            await service.construction;
            await service.addCertificate(der("paaMlDsa65"), "PAA", { isProduction: false });
            fetchMock.clearCallLog();

            const served = await service.getCertificateAsDer(PAA_MLDSA65_SKID, { considerTestCertificates: true });

            expect(Bytes.toHex(served)).equals(Bytes.toHex(der("paaMlDsa65")));
            expect(fetchMock.getCallLog()).deep.equals([]);
        });

        it("fetches an ML-DSA PAA from the DCL", async () => {
            fetchMock.uninstall();
            fetchMock = new MockFetch();
            mockDclRootCertificate(fetchMock, der("paaMlDsa65"), PAA_MLDSA65_SKID);
            service = new DclCertificateService(environment);
            await service.construction;

            expect(service.getCertificate(PAA_MLDSA65_SKID)).not.undefined;
        });
    });

    describe("device certification", () => {
        it("refuses an unservable chain even without product information", async () => {
            const chain = await buildChain({ paa: "ML-DSA-65", pai: "ML-DSA-44" });
            const certification = new DeviceCertification(crypto, {
                privateKey: chain.dacKey,
                certificate: chain.dacDer,
                intermediateCertificate: chain.paiDer,
                declaration: await CertificationDeclaration.generate(crypto, VENDOR_ID, PRODUCT_ID),
            });

            const failure = await certification.construction.then(
                () => undefined,
                (error: unknown) => asError(error),
            );

            expect(asError(failure?.cause).message).match(/DAC of \d+ bytes exceeds the 600 bytes/);
        });

        it("refuses a chain it cannot serve without segmented responses", async () => {
            const chain = await buildChain({ paa: "ML-DSA-65", pai: "ML-DSA-44" });
            const certification = new DeviceCertification(
                crypto,
                {
                    privateKey: chain.dacKey,
                    certificate: chain.dacDer,
                    intermediateCertificate: chain.paiDer,
                    declaration: await CertificationDeclaration.generate(crypto, VENDOR_ID, PRODUCT_ID),
                },
                { name: "PQC device", deviceType: 0x100, vendorId: VENDOR_ID, productId: PRODUCT_ID },
            );

            const failure = await certification.construction.then(
                () => undefined,
                (error: unknown) => asError(error),
            );

            expect(failure?.cause).instanceOf(ImplementationError);
            expect(asError(failure?.cause).message).match(/DAC of \d+ bytes exceeds the 600 bytes/);
        });
    });

    describe("device attestation", () => {
        let fetchMock: MockFetch;
        let environment: Environment;
        let service: DclCertificateService | undefined;

        beforeEach(() => {
            fetchMock = new MockFetch();
            fetchMock.addResponse("/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();
            environment = new Environment("test");
            new MockStorageService(environment);
            environment.set(Crypto, crypto);
        });

        afterEach(async () => {
            fetchMock.uninstall();
            await service?.close();
            service = undefined;
        });

        async function validate(chain: Chain, trustedPaaDer = chain.paaDer) {
            service = new DclCertificateService(environment, { updateInterval: null });
            await service.construction;
            await service.addCertificate(trustedPaaDer, "PAA", { isProduction: false });
            await service.addCertificate(CertificationDeclaration.testSignerCertificate(), "CDSigner");

            const attestationChallenge = crypto.randomBytes(16);
            const attestationNonce = crypto.randomBytes(32);
            const attestationElements = TlvAttestation.encode({
                declaration: await CertificationDeclaration.generate(crypto, VENDOR_ID, PRODUCT_ID),
                attestationNonce,
                timestamp: 0,
            });
            const signature = await crypto.signEcdsa(chain.dacKey, [attestationElements, attestationChallenge]);

            return DeviceAttestationValidator.validate(
                { crypto, dclCertificateService: service, attestationChallenge },
                {
                    dac: chain.dacDer,
                    pai: chain.paiDer,
                    attestationElements,
                    attestationSignature: signature.bytes,
                    attestationNonce,
                    vendorId: VENDOR_ID,
                    productId: PRODUCT_ID,
                },
            );
        }

        it("accepts a chain under an ML-DSA PAA and PAI", async () => {
            const result = await validate(await buildChain({ paa: "ML-DSA-65", pai: "ML-DSA-44" }));

            // The PAA is registered as a test certificate, which is the only error expected
            expect(
                result.findings.filter(
                    finding =>
                        finding.level === "error" && finding.type !== DeviceAttestationCheck.TrustedAsTestCertificate,
                ),
            ).deep.equals([]);
        });

        for (const layout of [
            { paa: "ML-DSA-44", pai: "ML-DSA-65" },
            { paa: "ECDSA-P256", pai: "ML-DSA-44" },
        ] as const) {
            it(`rejects a ${layout.pai} PAI under a ${layout.paa} PAA`, async () => {
                await expect(validate(await buildChain(layout))).rejectedWith(
                    DeviceAttestationError,
                    new RegExp(`PAI key algorithm ${layout.pai} is stronger`),
                );
            });
        }

        it("rejects a PAI the trusted ML-DSA PAA did not sign", async () => {
            const chain = await buildChain({ paa: "ML-DSA-65", pai: "ML-DSA-44" });
            const impostor = await buildChain({ paa: "ML-DSA-65", pai: "ML-DSA-44" }, chain.paaKey.publicKey);

            await expect(validate({ ...impostor, paaDer: chain.paaDer })).rejectedWith(
                DeviceAttestationError,
                /PAI signature verification failed/,
            );
        });
    });
});

describe("PQC Phase 1 attestation certificates while forward Matter features are off", () => {
    // The cert-testing branch turns forward features on
    before(function () {
        if (Specification.ENABLE_FORWARD_MATTER_FEATURES) {
            this.skip();
        }
    });

    const annexH: Array<[keyof typeof AnnexHCertificates, (der: Bytes) => unknown]> = [
        ["paaMlDsa65", Paa.fromAsn1],
        ["paaMlDsa44", Paa.fromAsn1],
        ["paiEcdsaByPaaMlDsa65", Pai.fromAsn1],
        ["paiMlDsa44ByPaaMlDsa44", Pai.fromAsn1],
        ["dacByPaiMlDsa44", Dac.fromAsn1],
    ];

    for (const [name, parse] of annexH) {
        it(`rejects ${name}`, () => {
            expect(() => parse(der(name))).throws(CertificateError, NOT_SUPPORTED);
        });
    }

    for (const layout of [
        { paa: "ML-DSA-65", pai: "ML-DSA-44" },
        { paa: "ML-DSA-65", pai: "ECDSA-P256" },
    ] as const) {
        it(`does not validate a device chain of a ${layout.pai} PAI under a ${layout.paa} PAA`, async () => {
            const chain = await buildChain(layout);
            const attestationNonce = crypto.randomBytes(32);

            await expect(
                DeviceAttestationValidator.validate(
                    { crypto, attestationChallenge: crypto.randomBytes(16) },
                    {
                        dac: chain.dacDer,
                        pai: chain.paiDer,
                        attestationElements: TlvAttestation.encode({
                            declaration: await CertificationDeclaration.generate(crypto, VENDOR_ID, PRODUCT_ID),
                            attestationNonce,
                            timestamp: 0,
                        }),
                        attestationSignature: new Uint8Array(64),
                        attestationNonce,
                        vendorId: VENDOR_ID,
                        productId: PRODUCT_ID,
                    },
                ),
            ).rejectedWith(
                DeviceAttestationError,
                /cannot be parsed: ML-DSA attestation certificates are not supported/,
            );
        });
    }

    describe("trust store", () => {
        let fetchMock: MockFetch;
        let environment: Environment;
        let service: DclCertificateService | undefined;

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

        it("refuses to add an ML-DSA PAA", async () => {
            mockDclRootCertificate(fetchMock);
            service = new DclCertificateService(environment, { updateInterval: null });
            await service.construction;

            await expect(service.addCertificate(der("paaMlDsa65"), "PAA")).rejectedWith(
                CertificateError,
                NOT_SUPPORTED,
            );
        });

        it("does not seed an ML-DSA PAA but seeds the entries after it", async () => {
            mockDclRootCertificate(fetchMock);
            service = new DclCertificateService(environment, {
                seed: {
                    paaRoots: {
                        builtAt: "2026-09-28T00:00:00Z",
                        expectedCount: 2,
                        entries: (async function* () {
                            yield {
                                role: "paa" as const,
                                subjectKeyId: PAA_MLDSA65_SKID,
                                derHex: Bytes.toHex(der("paaMlDsa65")),
                                kind: "production" as const,
                            };
                            yield {
                                role: "paa" as const,
                                subjectKeyId: PAA_NOVID_SKID,
                                derHex: Bytes.toHex(TestCert_PAA_NoVID_Cert),
                                kind: "production" as const,
                            };
                        })(),
                    },
                },
                updateInterval: null,
            });
            await service.construction;

            expect(service.getCertificate(PAA_MLDSA65_SKID)).undefined;
            expect(service.getCertificate(PAA_NOVID_SKID)).not.undefined;
        });

        it("does not store an ML-DSA PAA fetched from the DCL", async () => {
            mockDclRootCertificate(fetchMock, der("paaMlDsa65"), PAA_MLDSA65_SKID);
            service = new DclCertificateService(environment);
            await service.construction;

            expect(fetchMock.getCallLog().some(({ url }) => url.includes("/dcl/pki/certificates/"))).true;
            expect(service.getCertificate(PAA_MLDSA65_SKID)).undefined;
        });
    });
});

const PAA_MLDSA65_SKID = "0CE26FC8F0E9CC09DE243E2C1E1D41E47BB2A7A9";
const NOT_SUPPORTED = /ML-DSA attestation certificates are not supported/;
const PAA_NOVID_SKID = "785CE705B86B8F4E6FC793AA60CB43EA696882D5";

/** Serve a DCL root certificate list with {@link paaDer} as its only entry, or an empty list without it. */
function mockDclRootCertificate(fetchMock: MockFetch, paaDer?: Bytes, skid?: string) {
    const reference =
        paaDer === undefined || skid === undefined
            ? undefined
            : { subject: "UFFDIFBBQQ==", subjectKeyId: skid.replace(/(..)(?!$)/g, "$1:") };
    fetchMock.addResponse("/dcl/pki/root-certificates", {
        approvedRootCertificates: { schemaVersion: 0, certs: reference === undefined ? [] : [reference] },
    });
    if (paaDer !== undefined && reference !== undefined) {
        fetchMock.addResponse("/dcl/pki/certificates/", {
            approvedCertificates: {
                ...reference,
                schemaVersion: 0,
                certs: [
                    {
                        ...reference,
                        pemCert: Pem.encode(paaDer),
                        serialNumber: "01",
                        subjectAsText: "CN=Matter PQC Test PAA",
                        isRoot: true,
                        owner: "cosmos1...",
                        approvals: [],
                        rejects: [],
                        vid: 0xfff1,
                        schemaVersion: 0,
                    },
                ],
            },
        });
    }
    fetchMock.install();
}

type Algorithm = CertificatePublicKey["algorithm"];

const VENDOR_ID = VendorId(0xfff1);
const PRODUCT_ID = 0x8000;

type AnyKey = MlDsa.PrivateKey | PrivateKey;

interface Chain {
    paaDer: Bytes;
    paiDer: Bytes;
    dacDer: Bytes;
    paaKey: AnyKey;
    paiKey: AnyKey;
    dacKey: PrivateKey;
}

async function keyFor(algorithm: Algorithm): Promise<AnyKey> {
    return algorithm === "ECDSA-P256" ? crypto.createKeyPair() : crypto.createMlDsaKeyPair(algorithm);
}

/** The public key fields of a {@link Certificate} for a key. */
function keyFields(key: AnyKey) {
    return MlDsa.isPrivateKey(key)
        ? {
              publicKeyAlgorithm: 0,
              ellipticCurveIdentifier: 0,
              ellipticCurvePublicKey: new Uint8Array(),
              mlDsaPublicKey: { parameterSet: key.parameterSet, key: key.publicKey },
          }
        : { publicKeyAlgorithm: 1, ellipticCurveIdentifier: 1, ellipticCurvePublicKey: key.publicKey };
}

function signatureFields(issuerKey: AnyKey) {
    return MlDsa.isPrivateKey(issuerKey)
        ? { signatureAlgorithm: 0, mlDsaSignature: issuerKey.parameterSet }
        : { signatureAlgorithm: 1 };
}

async function keyIdentifier(key: AnyKey) {
    return Bytes.of(await crypto.computeHash(key.publicKey, "SHA-1"));
}

/**
 * Create a PAA, PAI and DAC.  With `paaPublicKey` the PAA is recreated around that public key, so its SKI matches a
 * PAA whose private key signed nothing here.
 */
async function buildChain(layout: { paa: Algorithm; pai: Algorithm }, paaPublicKey?: Bytes): Promise<Chain> {
    const now = Time.now;
    const paaKey = await keyFor(layout.paa);
    const paiKey = await keyFor(layout.pai);
    const dacKey = await crypto.createKeyPair();
    const paaSki = await keyIdentifier(paaPublicKey === undefined ? paaKey : { ...paaKey, publicKey: paaPublicKey });
    const paiSki = await keyIdentifier(paiKey);
    const paaName = { commonName: "Matter PQC Test PAA", vendorId: VENDOR_ID };
    const paiName = { commonName: "Matter PQC Test PAI", vendorId: VENDOR_ID };

    const paa = new Paa({
        serialNumber: Bytes.fromHex("01"),
        ...signatureFields(paaKey),
        ...keyFields(paaKey),
        issuer: paaName,
        subject: paaName,
        notBefore: jsToMatterDate(now, -1),
        notAfter: jsToMatterDate(now, 10),
        extensions: {
            basicConstraints: { isCa: true, pathLen: 1 },
            keyUsage: { keyCertSign: true, cRLSign: true },
            subjectKeyIdentifier: paaSki,
            authorityKeyIdentifier: paaSki,
        },
    });
    await paa.sign(crypto, paaKey);

    const pai = new Pai({
        serialNumber: Bytes.fromHex("02"),
        ...signatureFields(paaKey),
        ...keyFields(paiKey),
        issuer: paaName,
        subject: paiName,
        notBefore: jsToMatterDate(now, -1),
        notAfter: jsToMatterDate(now, 10),
        extensions: {
            basicConstraints: { isCa: true, pathLen: 0 },
            keyUsage: { keyCertSign: true, cRLSign: true },
            subjectKeyIdentifier: paiSki,
            authorityKeyIdentifier: paaSki,
        },
    });
    await pai.sign(crypto, paaKey);

    const dac = new Dac({
        serialNumber: Bytes.fromHex("03"),
        ...signatureFields(paiKey),
        ...keyFields(dacKey),
        issuer: paiName,
        subject: { commonName: "Matter PQC Test DAC", vendorId: VENDOR_ID, productId: PRODUCT_ID },
        notBefore: jsToMatterDate(now, -1),
        notAfter: jsToMatterDate(now, 10),
        extensions: {
            basicConstraints: { isCa: false },
            keyUsage: { digitalSignature: true },
            subjectKeyIdentifier: await keyIdentifier(dacKey),
            authorityKeyIdentifier: paiSki,
        },
    });
    await dac.sign(crypto, paiKey);

    return { paaDer: paa.asSignedDer(), paiDer: pai.asSignedDer(), dacDer: dac.asSignedDer(), paaKey, paiKey, dacKey };
}

function unsignedPai(mlDsaSignature: MlDsa.ParameterSet | undefined, key: { algorithm: "ECDSA-P256"; key: Bytes }) {
    return new Pai({
        serialNumber: Bytes.fromHex("02"),
        signatureAlgorithm: mlDsaSignature === undefined ? 1 : 0,
        ...(mlDsaSignature === undefined ? {} : { mlDsaSignature }),
        publicKeyAlgorithm: 1,
        ellipticCurveIdentifier: 1,
        ellipticCurvePublicKey: key.key,
        issuer: { commonName: "PAA" },
        subject: { commonName: "PAI", vendorId: VENDOR_ID },
        notBefore: jsToMatterDate(Time.now, -1),
        notAfter: jsToMatterDate(Time.now, 10),
        extensions: {
            basicConstraints: { isCa: true, pathLen: 0 },
            keyUsage: { keyCertSign: true, cRLSign: true },
            subjectKeyIdentifier: new Uint8Array(20),
            authorityKeyIdentifier: new Uint8Array(20),
        },
    });
}

/** The X.509 structure of a parsed PAI, for re-encoding it with altered parts. */
function x509Of(pai: Pai): X509.UnsignedCertificate & { signature: Bytes } {
    const { cert, signature } = pai;
    return {
        serialNumber: cert.serialNumber,
        signatureAlgorithm:
            cert.mlDsaSignature === undefined ? X962.EcdsaWithSHA256 : MlDsa.AlgorithmIdentifier(cert.mlDsaSignature),
        issuer: { commonName: X520.CommonName(cert.issuer.commonName) },
        validity: { notBefore: matterToJsDate(cert.notBefore), notAfter: matterToJsDate(cert.notAfter) },
        subject: { commonName: X520.CommonName(cert.subject.commonName) },
        publicKey:
            cert.mlDsaPublicKey === undefined
                ? X962.PublicKeyEcPrime256v1(cert.ellipticCurvePublicKey)
                : MlDsa.SubjectPublicKeyInfo(cert.mlDsaPublicKey.parameterSet, cert.mlDsaPublicKey.key),
        extensions: cert.extensions,
        signature: signature instanceof MlDsaSignature ? signature.bytes : signature.der,
    };
}

/** Whether this runtime's OpenSSL parses and verifies ML-DSA certificates. */
function opensslParses(der: Bytes) {
    if (nodeCrypto === undefined) {
        return false;
    }
    try {
        const cert = new nodeCrypto.X509Certificate(Bytes.of(der));
        return cert.verify(cert.publicKey);
    } catch {
        return false;
    }
}
