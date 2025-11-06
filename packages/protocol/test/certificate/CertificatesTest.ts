/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateError } from "#certificate/kinds/common.js";
import { Icac } from "#certificate/kinds/Icac.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Rcac } from "#certificate/kinds/Rcac.js";
import { X509Base } from "#certificate/kinds/X509Base.js";
import { Bytes, DerCodec, DerKey, DerNode, PrivateKey, PublicKey, StandardCrypto, X962 } from "#general";
import { CaseAuthenticatedTag, FabricId, NodeId, ValidationOutOfBoundsError } from "#types";
import {
    CERTIFICATE_SETS,
    EXTERNAL_TEST_CERTIFICATES,
    TEST_CSR_REQUEST_ASN1,
    TEST_NOC_CERT_CAT_ASN1,
    TEST_PRIVATE_KEY,
    TEST_PUBLIC_KEY,
} from "./TestCertificates.js";

describe("Certificates", () => {
    const crypto = new StandardCrypto();

    before(() => {
        MockTime.reset(767158951000);
    });

    /**
     * These tests make sure that the TLV can be recoded to the same bytes. This mainly verifies that the order
     * of Lists are correctly preserved.
     */
    describe("Recode Tlv", () => {
        Object.entries(CERTIFICATE_SETS).forEach(([key, certs]) => {
            describe(`recodes Tlv for ${key}`, () => {
                it("recode root certificate", () => {
                    const root = Rcac.fromTlv(certs.ROOT.TLV);
                    expect(Bytes.toHex(root.asSignedTlv())).equal(Bytes.toHex(certs.ROOT.TLV));
                });

                if ("ICAC" in certs) {
                    it("recode intermediate certificate", () => {
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        expect(Bytes.toHex(icac.asSignedTlv())).equal(Bytes.toHex(certs.ICAC.TLV));
                    });
                }

                it("recode operational certificate", () => {
                    const noc = Noc.fromTlv(certs.NOC.TLV);
                    expect(Bytes.toHex(noc.asSignedTlv())).equal(Bytes.toHex(certs.NOC.TLV));
                });
            });
        });
    });

    /**
     * For all Root certs and some ICAC/NOC we verified ASN1 encoding. This test verifies that the encoding manually,
     * so we can also verify that. For the others the certificate validation below serves the same purpose.
     */
    describe("generates the correct ASN1 bytes", () => {
        Object.entries(CERTIFICATE_SETS).forEach(([key, certs]) => {
            describe(`generates the correct ASN1 bytes for ${key}`, () => {
                if ("ASN1" in certs.ROOT) {
                    it("encode root certificate", () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        expect(Bytes.toHex(root.asUnsignedAsn1())).equal(
                            // @ts-expect-error ASN1 might be absent, but checked above
                            Bytes.toHex(certs.ROOT.ASN1),
                        );
                    });
                }

                if ("ICAC" in certs && "ASN1" in certs.ICAC) {
                    it("encode intermediate certificate", () => {
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        expect(Bytes.toHex(icac.asUnsignedAsn1())).equal(
                            // @ts-expect-error ASN1 might not be in OperationalCertificate.TlvIcac
                            Bytes.toHex(certs.ICAC.ASN1),
                        );
                    });
                }

                if ("ASN1" in certs.NOC) {
                    it("encode operational certificate", () => {
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        expect(Bytes.toHex(noc.asUnsignedAsn1())).equal(
                            // @ts-expect-error ASN1 might not be in OperationalCertificate.TlvNoc
                            Bytes.toHex(certs.NOC.ASN1),
                        );
                    });
                }
            });
        });
    });

    /**
     * We verify all certificates which also verifies them cryptographically.
     */
    /**
     * Parse ASN.1 certificates, convert to TLV, and verify they match the expected TLV.
     * This tests the round-trip: TLV → ASN.1 → TLV
     */
    describe("parses ASN.1 certificates to TLV", () => {
        Object.entries(CERTIFICATE_SETS).forEach(([key, certs]) => {
            describe(`parses ASN.1 for ${key}`, () => {
                it("parse root certificate from ASN.1", async () => {
                    // Load from TLV, convert to ASN.1, parse back, and verify
                    const rootFromTlv = Rcac.fromTlv(certs.ROOT.TLV);
                    const rootFromAsn1 = Rcac.fromAsn1(rootFromTlv.asSignedAsn1());
                    expect(rootFromAsn1.cert).to.deep.equal(rootFromTlv.cert);
                    if ("ASN1" in certs.ROOT) {
                        expect(Bytes.toHex(rootFromTlv.asUnsignedAsn1())).to.equal(Bytes.toHex(certs.ROOT.ASN1));
                    }
                    const tlvEncoded = rootFromAsn1.asSignedTlv();
                    expect(Bytes.toHex(tlvEncoded)).equal(Bytes.toHex(certs.ROOT.TLV));

                    await rootFromTlv.verify(crypto);
                });

                if ("ICAC" in certs) {
                    it("parse intermediate certificate from ASN.1", async () => {
                        const icacFromTlv = Icac.fromTlv(certs.ICAC.TLV);
                        const icacFromAsn1 = Icac.fromAsn1(icacFromTlv.asSignedAsn1());
                        expect(icacFromAsn1.cert).to.deep.equal(icacFromTlv.cert);
                        const tlvEncoded = icacFromAsn1.asSignedTlv();
                        expect(Bytes.toHex(tlvEncoded)).equal(Bytes.toHex(certs.ICAC.TLV));

                        const rootFromTlv = Rcac.fromTlv(certs.ROOT.TLV);
                        await icacFromAsn1.verify(crypto, rootFromTlv);
                    });
                }

                it("parse operational certificate from ASN.1", async () => {
                    const nocFromTlv = Noc.fromTlv(certs.NOC.TLV);
                    const nocFromAsn1 = Noc.fromAsn1(nocFromTlv.asSignedAsn1());
                    expect(nocFromAsn1.cert).to.deep.equal(nocFromTlv.cert);
                    if ("ASN1" in certs.NOC) {
                        expect(Bytes.toHex(nocFromTlv.asUnsignedAsn1())).to.equal(Bytes.toHex(certs.NOC.ASN1));
                    }
                    const tlvEncoded = nocFromAsn1.asSignedTlv();
                    expect(Bytes.toHex(tlvEncoded)).equal(Bytes.toHex(certs.NOC.TLV));

                    const rootFromTlv = Rcac.fromTlv(certs.ROOT.TLV);
                    const icaFromTlv = "ICAC" in certs ? Icac.fromTlv(certs.ICAC.TLV) : undefined;
                    await nocFromAsn1.verify(crypto, rootFromTlv, icaFromTlv);
                });
            });
        });
    });

    /**
     * Parse external ASN.1 certificates provided by the user.
     * These are real-world certificates to validate ASN.1 parsing works with externally generated certs.
     */
    describe("parses external ASN.1 certificates", () => {
        it("parse and regenerate external RCAC certificate", () => {
            const rcac = Rcac.fromAsn1(EXTERNAL_TEST_CERTIFICATES.RCAC_ASN1);

            // Verify we got valid data
            expect(rcac.cert.subject.rcacId).to.not.be.undefined;
            expect(rcac.cert.extensions.basicConstraints.isCa).to.be.true;
            expect(rcac.isSigned).to.be.true;

            const asn1 = rcac.asSignedAsn1();

            expect(Bytes.toHex(asn1)).to.equal(Bytes.toHex(EXTERNAL_TEST_CERTIFICATES.RCAC_ASN1));
        });

        it("parse and regenerate external ICAC certificate", () => {
            const icac = Icac.fromAsn1(EXTERNAL_TEST_CERTIFICATES.ICAC_ASN1);

            // Verify we got valid data
            expect(icac.cert.subject.icacId).to.not.be.undefined;
            expect(icac.cert.extensions.basicConstraints.isCa).to.be.true;
            expect(icac.isSigned).to.be.true;

            const asn1 = icac.asSignedAsn1();
            expect(Bytes.toHex(asn1)).to.equal(Bytes.toHex(EXTERNAL_TEST_CERTIFICATES.ICAC_ASN1));
        });

        it("parse and regenerate  external NOC certificate", () => {
            const noc = Noc.fromAsn1(EXTERNAL_TEST_CERTIFICATES.NOC_ASN1);

            // Verify we got valid data
            expect(noc.cert.subject.nodeId).to.not.be.undefined;
            expect(noc.cert.subject.fabricId).to.not.be.undefined;
            expect(noc.cert.extensions.basicConstraints.isCa).to.be.false;
            expect(noc.isSigned).to.be.true;

            const asn1 = noc.asSignedAsn1();
            expect(Bytes.toHex(asn1)).to.equal(Bytes.toHex(EXTERNAL_TEST_CERTIFICATES.NOC_ASN1));
        });

        it("external certificates form a valid chain", async () => {
            const rcac = Rcac.fromAsn1(EXTERNAL_TEST_CERTIFICATES.RCAC_ASN1);
            const icac = Icac.fromAsn1(EXTERNAL_TEST_CERTIFICATES.ICAC_ASN1);
            const noc = Noc.fromAsn1(EXTERNAL_TEST_CERTIFICATES.NOC_ASN1);

            // Verify the chain references are correct
            expect(icac.cert.issuer.rcacId).to.equal(rcac.cert.subject.rcacId);
            expect(noc.cert.issuer.icacId).to.equal(icac.cert.subject.icacId);

            expect(rcac.cert.extensions.authorityKeyIdentifier).to.deep.equal(
                rcac.cert.extensions.subjectKeyIdentifier,
            );
            expect(icac.cert.extensions.authorityKeyIdentifier).to.deep.equal(
                rcac.cert.extensions.subjectKeyIdentifier,
            );
            expect(noc.cert.extensions.authorityKeyIdentifier).to.deep.equal(icac.cert.extensions.subjectKeyIdentifier);
        });
    });

    /**
     * We verify all certificates which also verifies them cryptographically.
     */
    describe("verifies certificates", () => {
        Object.entries(CERTIFICATE_SETS).forEach(([key, certs]) => {
            describe(`verify certificates for ${key}`, () => {
                it("verify root certificate", async () => {
                    const root = Rcac.fromTlv(certs.ROOT.TLV);
                    await root.verify(crypto);
                });

                if ("ICAC" in certs) {
                    it("verify intermediate certificate via ROOT", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        await icac.verify(crypto, root);
                    });

                    it("verify operational certificate via ICAC and ROOT", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        await noc.verify(crypto, root, icac);
                    });

                    it("verify operational certificate via ICAC and ROOT with fabricId in root matching", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        root.cert.subject.fabricId = noc.cert.subject.fabricId;
                        icac.cert.subject.fabricId = undefined;
                        await noc.verify(crypto, root, icac);
                    });

                    it("verify operational certificate via ICAC and ROOT with fabricId in ica matching", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        root.cert.subject.fabricId = undefined;
                        icac.cert.subject.fabricId = noc.cert.subject.fabricId;
                        await noc.verify(crypto, root, icac);
                    });

                    it("verify operational certificate via ICAC and ROOT with fabricId in all matching", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        root.cert.subject.fabricId = noc.cert.subject.fabricId;
                        icac.cert.subject.fabricId = noc.cert.subject.fabricId;
                        await noc.verify(crypto, root, icac);
                    });

                    it("verify operational certificate via ICAC and ROOT with fabricId in root not matching", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        root.cert.subject.fabricId = FabricId(noc.cert.subject.fabricId + 1n);
                        icac.cert.subject.fabricId = undefined;
                        await expect(noc.verify(crypto, root, icac)).to.be.rejectedWith(
                            CertificateError,
                            `FabricId in NoC certificate does not match the fabricId in the parent certificate. "${root.cert.subject.fabricId.toString()}" !== "${noc.cert.subject.fabricId.toString()}"`,
                        );
                    });

                    it("verify operational certificate via ICAC and ROOT with fabricId in ica not matching", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const icac = Icac.fromTlv(certs.ICAC.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        root.cert.subject.fabricId = undefined;
                        icac.cert.subject.fabricId = FabricId(noc.cert.subject.fabricId + 1n);
                        await expect(noc.verify(crypto, root, icac)).to.be.rejectedWith(
                            CertificateError,
                            `FabricId in NoC certificate does not match the fabricId in the parent certificate. "${icac.cert.subject.fabricId.toString()}" !== "${noc.cert.subject.fabricId.toString()}"`,
                        );
                    });
                } else {
                    it("verify operational certificate via ROOT only", async () => {
                        const root = Rcac.fromTlv(certs.ROOT.TLV);
                        const noc = Noc.fromTlv(certs.NOC.TLV);
                        await noc.verify(crypto, root);
                    });
                }
            });
        });
    });

    describe("special Noc encoding cases", () => {
        it("validates TLV order preserve", () => {
            const NOC_JSON = {
                serialNumber: Bytes.fromHex("01"),
                signatureAlgorithm: 1,
                issuer: { rcacId: 0 },
                notBefore: 734738627,
                notAfter: 1081634627,
                subject: {
                    caseAuthenticatedTags: [CaseAuthenticatedTag(305419896), CaseAuthenticatedTag(1450709556)],
                    fabricId: FabricId(1),
                    nodeId: NodeId(BigInt("9544138254462263483")),
                },
                publicKeyAlgorithm: 1,
                ellipticCurveIdentifier: 1,
                ellipticCurvePublicKey: Bytes.fromHex(
                    "047a13da11a960c91abdbe002c6f969f03b88f7f5c58f36f6755c6dce7e1ddd460ab4b2df33f8ed1da1ff5ebf21c3a293c3251241c445b208a22bea0abec369740",
                ),
                extensions: {
                    basicConstraints: { isCa: false },
                    keyUsage: {
                        digitalSignature: true,
                        nonRepudiation: false,
                        keyEncipherment: false,
                        dataEncipherment: false,
                        keyAgreement: false,
                        keyCertSign: false,
                        cRLSign: false,
                        encipherOnly: false,
                        decipherOnly: false,
                    },
                    extendedKeyUsage: [2, 1],
                    subjectKeyIdentifier: Bytes.fromHex("50a7b210085872f47492e9442ccb2bfec82097da"),
                    authorityKeyIdentifier: Bytes.fromHex("9f833bc968b9c7ce347b1d10f046ebda0aeb0b3e"),
                },
                signature: Bytes.fromHex(
                    "3fcd56cf81d769100934b32f6a8b07afddfbf6c32f01e97385f251b8c71bc631a876c56fac76dd3c81449b71a0a450d28d9eaf314ccd3a166b61cddd965829f1",
                ),
            };
            const NOC_ASN1 = new Noc(NOC_JSON).asUnsignedAsn1();
            const NOC_TLV = new Noc(NOC_JSON).asSignedTlv();

            const unTlv = Noc.fromTlv(NOC_TLV);
            const unAsn1 = unTlv.asUnsignedAsn1();

            expect(unTlv.cert).to.deep.equal(NOC_JSON);
            expect(Object.keys(unTlv.cert.subject)).to.deep.equal(Object.keys(NOC_JSON.subject));
            expect(Bytes.toHex(unAsn1)).to.deep.equal(Bytes.toHex(NOC_ASN1));
        });

        it("generates the correct ASN1 bytes with three different CASE Authenticated Tags", () => {
            const TEST_NOC_CERT_TLV = Noc.fromTlv(CERTIFICATE_SETS["General Test Certificates"].NOC.TLV).cert;
            const nocWithCat = {
                ...TEST_NOC_CERT_TLV,
                subject: {
                    ...TEST_NOC_CERT_TLV.subject,
                    caseAuthenticatedTags: [
                        CaseAuthenticatedTag(0x12345678),
                        CaseAuthenticatedTag(0x56789012),
                        CaseAuthenticatedTag(0x90123456),
                    ],
                },
            };
            const result = new Noc(nocWithCat).asUnsignedAsn1();

            expect(Bytes.toHex(result)).equal(Bytes.toHex(TEST_NOC_CERT_CAT_ASN1));
        });

        it("throws error if more then 3 tags are provided", () => {
            const TEST_NOC_CERT_TLV = Noc.fromTlv(CERTIFICATE_SETS["General Test Certificates"].NOC.TLV).cert;
            const nocWithCat = {
                ...TEST_NOC_CERT_TLV,
                subject: {
                    ...TEST_NOC_CERT_TLV.subject,
                    caseAuthenticatedTags: [
                        CaseAuthenticatedTag(0x12345678),
                        CaseAuthenticatedTag(0x56789012),
                        CaseAuthenticatedTag(0x90123456),
                        CaseAuthenticatedTag(0x12345678),
                    ],
                },
            };
            expect(() => new Noc(nocWithCat).asUnsignedAsn1()).to.throw(
                ValidationOutOfBoundsError,
                "Too many CaseAuthenticatedTags (4).",
            );
        });

        it("throws error if tags contain duplicate identifier values", () => {
            const TEST_NOC_CERT_TLV = Noc.fromTlv(CERTIFICATE_SETS["General Test Certificates"].NOC.TLV).cert;
            const nocWithCat = {
                ...TEST_NOC_CERT_TLV,
                subject: {
                    ...TEST_NOC_CERT_TLV.subject,
                    caseAuthenticatedTags: [
                        CaseAuthenticatedTag(0x12345678),
                        CaseAuthenticatedTag(0x56789012),
                        CaseAuthenticatedTag(0x12341234),
                    ],
                },
            };
            expect(() => new Noc(nocWithCat).asUnsignedAsn1()).to.throw(
                ValidationOutOfBoundsError,
                "CASEAuthenticatedTags field contains duplicate identifier values.",
            );
        });
    });

    describe("decodeicacificate", () => {
        it("decodes a correct ICAC cert", () => {
            const specsicacTlv = Icac.fromTlv(CERTIFICATE_SETS["Matter 1.2 Specification Certificates"].ICAC.TLV).cert;
            expect(specsicacTlv).deep.equal({
                serialNumber: new Uint8Array([45, 180, 68, 133, 86, 65, 174, 223]),
                signatureAlgorithm: 1,
                issuer: { rcacId: BigInt("14612714909889200129") },
                notBefore: 656087023,
                notAfter: 1287239022,
                subject: { icacId: BigInt("14612714909889200131") },
                publicKeyAlgorithm: 1,
                ellipticCurveIdentifier: 1,
                ellipticCurvePublicKey: new Uint8Array([
                    4, 197, 208, 134, 27, 184, 249, 12, 64, 92, 18, 49, 78, 76, 94, 190, 234, 147, 159, 114, 119, 75,
                    204, 51, 35, 158, 47, 89, 246, 244, 106, 248, 220, 125, 70, 130, 160, 227, 204, 198, 70, 230, 223,
                    41, 234, 134, 191, 86, 42, 231, 32, 168, 152, 51, 125, 56, 63, 50, 192, 160, 158, 65, 96, 25, 234,
                ]),
                extensions: {
                    basicConstraints: { isCa: true },
                    keyUsage: {
                        cRLSign: true,
                        dataEncipherment: false,
                        decipherOnly: false,
                        digitalSignature: false,
                        encipherOnly: false,
                        keyAgreement: false,
                        keyCertSign: true,
                        keyEncipherment: false,
                        nonRepudiation: false,
                    },
                    subjectKeyIdentifier: new Uint8Array([
                        83, 82, 215, 5, 158, 156, 21, 165, 8, 144, 104, 98, 134, 72, 1, 162, 159, 31, 65, 211,
                    ]),
                    authorityKeyIdentifier: new Uint8Array([
                        19, 175, 129, 171, 55, 55, 75, 46, 210, 169, 100, 155, 18, 183, 163, 164, 40, 126, 21, 29,
                    ]),
                },
                signature: new Uint8Array([
                    132, 26, 6, 212, 59, 94, 159, 236, 210, 78, 135, 177, 36, 78, 181, 28, 106, 44, 242, 13, 155, 94,
                    107, 160, 127, 17, 230, 0, 47, 126, 12, 163, 78, 50, 166, 2, 195, 96, 157, 0, 146, 211, 72, 189,
                    189, 25, 138, 17, 70, 70, 189, 65, 207, 16, 55, 131, 100, 26, 226, 94, 63, 35, 253, 38,
                ]),
            });
        });
    });

    describe("createCertificateSigningRequest", () => {
        it("generates a valid CSR", async () => {
            const result = await X509Base.createCertificateSigningRequest(
                crypto,
                PrivateKey(TEST_PRIVATE_KEY, { publicKey: TEST_PUBLIC_KEY }),
            );

            const derNode = DerCodec.decode(result);
            expect(derNode[DerKey.Elements]?.length).equal(3);
            const [requestNode, signatureAlgorithmNode, signatureNode] = derNode[DerKey.Elements] as DerNode[];
            expect(DerCodec.encode(signatureAlgorithmNode)).deep.equal(DerCodec.encode(X962.EcdsaWithSHA256));
            const requestBytes = DerCodec.encode(requestNode);
            expect(requestBytes).deep.equal(TEST_CSR_REQUEST_ASN1);
            await crypto.verifyEcdsa(
                PublicKey(TEST_PUBLIC_KEY),
                DerCodec.encode(requestNode),
                signatureNode[DerKey.Bytes],
                "der",
            );
        });
    });

    describe("getPublicKeyFromCsr", () => {
        it("get the public key from the CSR", async () => {
            const csr = await X509Base.createCertificateSigningRequest(
                crypto,
                PrivateKey(TEST_PRIVATE_KEY, { publicKey: TEST_PUBLIC_KEY }),
            );

            const result = await X509Base.getPublicKeyFromCsr(crypto, csr);

            expect(result).deep.equal(TEST_PUBLIC_KEY);
        });
    });
});
