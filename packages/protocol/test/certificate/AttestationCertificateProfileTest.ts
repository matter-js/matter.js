/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DeviceAttestationCheck,
    DeviceAttestationError,
    DeviceAttestationValidator,
} from "#certificate/DeviceAttestationValidator.js";
import { CertificateProfileError, Dac, Paa, Pai } from "#certificate/kinds/AttestationCertificates.js";
import { Certificate } from "#certificate/kinds/Certificate.js";
import { Bytes, CertificateError, DerCodec, DerNode, DerType, StandardCrypto } from "@matter/general";
import { VendorId } from "@matter/types";
import { AcceptedAttestationVectors, RefusedDacVectors, RefusedPaiVectors } from "./ChipAttestationProfileVectors.js";

/** A refusal the profile reports, as the CertificateProfileError message names the rule. */
const profile = (rule: RegExp) => ({ error: CertificateProfileError, rule });

/** A refusal of a certificate that is unusable without the extension, so it fails parsing. */
const parse = (rule: RegExp) => ({ error: CertificateError, rule });

const DAC_REFUSALS: Record<keyof typeof RefusedDacVectors, { error: typeof CertificateError; rule: RegExp }> = {
    struct_dac_cert_version_v2: profile(/DAC version field must be 2/),
    struct_dac_ext_basic_ca_missing: profile(/DAC basic constraints must not have a pathLen/),
    struct_dac_ext_basic_ca_wrong: profile(/DAC basic constraints must have cA set to FALSE/),
    struct_dac_ext_basic_critical_missing: profile(/DAC basic constraints extension must be marked critical/),
    struct_dac_ext_basic_critical_wrong: profile(/DAC basic constraints extension must be marked critical/),
    struct_dac_ext_basic_missing: profile(/DAC must carry the basic constraints extension/),
    struct_dac_ext_basic_pathlen0: profile(/DAC basic constraints must not have a pathLen, found 0/),
    struct_dac_ext_basic_pathlen1: profile(/DAC basic constraints must not have a pathLen, found 1/),
    struct_dac_ext_basic_pathlen2: profile(/DAC basic constraints must not have a pathLen, found 2/),
    struct_dac_ext_basic_pathlen_presence_wrong: profile(/DAC basic constraints must not have a pathLen/),
    struct_dac_ext_key_usage_critical_missing: profile(/DAC key usage extension must be marked critical/),
    struct_dac_ext_key_usage_critical_wrong: profile(/DAC key usage extension must be marked critical/),
    struct_dac_ext_key_usage_crl_sign_wrong: profile(/DAC key usage must have only digitalSignature set/),
    struct_dac_ext_key_usage_dig_sig_wrong: profile(/DAC key usage must have only digitalSignature set/),
    struct_dac_ext_key_usage_key_cert_sign_wrong: profile(/DAC key usage must have only digitalSignature set/),
    struct_dac_ext_key_usage_missing: parse(/Missing required extensions in certificate: keyUsage/),
    struct_dac_ext_akid_missing: parse(/Missing required extensions in certificate: authorityKeyIdentifier/),
    struct_dac_ext_skid_missing: parse(/Missing required extensions in certificate: subjectKeyIdentifier/),
};

const PAI_REFUSALS: Record<keyof typeof RefusedPaiVectors, { error: typeof CertificateError; rule: RegExp }> = {
    struct_pai_cert_version_v2: profile(/PAI version field must be 2/),
    struct_pai_ext_basic_ca_missing: profile(/PAI basic constraints must have cA set to TRUE/),
    struct_pai_ext_basic_ca_wrong: profile(/PAI basic constraints must have cA set to TRUE/),
    struct_pai_ext_basic_critical_missing: profile(/PAI basic constraints extension must be marked critical/),
    struct_pai_ext_basic_critical_wrong: profile(/PAI basic constraints extension must be marked critical/),
    struct_pai_ext_basic_missing: profile(/PAI must carry the basic constraints extension/),
    struct_pai_ext_basic_pathlen1: profile(/PAI basic constraints must have pathLen 0, not 1/),
    struct_pai_ext_basic_pathlen2: profile(/PAI basic constraints must have pathLen 0, not 2/),
    struct_pai_ext_basic_pathlen_presence_wrong: profile(/PAI basic constraints must have pathLen 0, not undefined/),
    struct_pai_ext_key_usage_critical_missing: profile(/PAI key usage extension must be marked critical/),
    struct_pai_ext_key_usage_critical_wrong: profile(/PAI key usage extension must be marked critical/),
    struct_pai_ext_key_usage_crl_sign_wrong: profile(/PAI key usage must have keyCertSign and cRLSign set/),
    struct_pai_ext_key_usage_key_cert_sign_wrong: profile(/PAI key usage must have keyCertSign and cRLSign set/),
    struct_pai_ext_key_usage_missing: parse(/Missing required extensions in certificate: keyUsage/),
    struct_pai_ext_akid_missing: parse(/Missing required extensions in certificate: authorityKeyIdentifier/),
    struct_pai_ext_skid_missing: parse(/Missing required extensions in certificate: subjectKeyIdentifier/),
};

function vectorOf<T>(vectors: Record<string, T>, name: string) {
    return new Map(Object.entries(vectors)).get(name) ?? expect.fail(`No test vector ${name}`);
}

function expectRefusal(parse: () => unknown, { error, rule }: { error: typeof CertificateError; rule: RegExp }) {
    expect(parse).throws(error, rule);
    if (error !== CertificateProfileError) {
        expect(parse).not.throws(CertificateProfileError);
    }
}

const BASIC_CONSTRAINTS_OID = "551d13";
const KEY_USAGE_OID = "551d0f";

/** Re-encode a decoded node tree, so edited nodes get correct container lengths. */
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

/** Let `edit` change the TBSCertificate elements of a certificate.  The signature no longer matches the result. */
function editTbs(hex: string, edit: (elements: DerNode[]) => void) {
    const cert = DerCodec.decode(Bytes.fromHex(hex));
    edit(cert._elements?.[0]._elements ?? expect.fail("Certificate has no TBSCertificate"));
    return reencode(cert);
}

/** Let `edit` change the extension list of a certificate.  The signature no longer matches the result. */
function editExtensions(hex: string, edit: (extensions: DerNode[]) => void) {
    return editTbs(hex, elements =>
        edit(
            elements.find(element => element._tag === 0xa3)?._elements?.[0]._elements ??
                expect.fail("Certificate has no extensions"),
        ),
    );
}

function extensionNamed(extensions: DerNode[], oidHex: string) {
    return (
        extensions.find(({ _elements }) => _elements !== undefined && Bytes.toHex(_elements[0]._bytes) === oidHex) ??
        expect.fail(`Certificate has no extension ${oidHex}`)
    );
}

function lastElementOf(node: DerNode) {
    return node._elements?.[node._elements.length - 1] ?? expect.fail("Node has no elements");
}

/** Replace the value of an extension with DER given as hex. */
function withExtensionValue(hex: string, oidHex: string, valueHex: string) {
    return editExtensions(hex, extensions => {
        lastElementOf(extensionNamed(extensions, oidHex))._bytes = Bytes.fromHex(valueHex);
    });
}

const VALID_DAC = AcceptedAttestationVectors.struct_dac_cert_version_v3.dac;
const VALID_PAI = AcceptedAttestationVectors.struct_dac_cert_version_v3.pai;

describe("Attestation certificate profile", () => {
    describe("refuses a DAC that violates the DAC profile", () => {
        for (const [name, refusal] of Object.entries(DAC_REFUSALS)) {
            it(name, () => {
                const { dac } = vectorOf(RefusedDacVectors, name);
                expectRefusal(() => Dac.fromAsn1(Bytes.fromHex(dac)), refusal);
            });
        }

        it("with a key usage bit beyond decipherOnly", () => {
            // BIT STRING with 6 unused bits: digitalSignature and bit 9
            const dac = withExtensionValue(VALID_DAC, KEY_USAGE_OID, "0303068040");
            expectRefusal(() => Dac.fromAsn1(dac), profile(/DAC key usage must have only digitalSignature set/));
        });

        it("without a version field", () => {
            const v1 = editTbs(VALID_DAC, elements => {
                expect(elements.shift()?._tag).equals(0xa0);
            });
            expectRefusal(() => Dac.fromAsn1(v1), profile(/DAC version field must be 2 \(v3\), not 0/));
        });

        it("with a basic constraints extension it carries twice", () => {
            const dac = editExtensions(VALID_DAC, extensions => {
                extensions.push(extensionNamed(extensions, BASIC_CONSTRAINTS_OID));
            });
            expectRefusal(() => Dac.fromAsn1(dac), profile(/DAC carries more than one basicConstraints extension/));
        });
    });

    describe("refuses a PAI that violates the PAI profile", () => {
        for (const [name, refusal] of Object.entries(PAI_REFUSALS)) {
            it(name, () => {
                const { pai } = vectorOf(RefusedPaiVectors, name);
                expectRefusal(() => Pai.fromAsn1(Bytes.fromHex(pai)), refusal);
            });
        }

        it("with a key usage bit besides keyCertSign, cRLSign and digitalSignature", () => {
            // BIT STRING with 1 unused bit: keyEncipherment, keyCertSign and cRLSign
            const pai = withExtensionValue(VALID_PAI, KEY_USAGE_OID, "03020126");
            expectRefusal(() => Pai.fromAsn1(pai), profile(/PAI key usage must have keyCertSign and cRLSign set/));
        });

        it("with a key usage extension it carries twice", () => {
            const pai = editExtensions(VALID_PAI, extensions => {
                const keyUsage = extensionNamed(extensions, KEY_USAGE_OID);
                const oid = keyUsage._elements?.[0] ?? expect.fail("Extension has no OID");
                // A second copy without the critical flag
                extensions.push({
                    _tag: keyUsage._tag,
                    _bytes: new Uint8Array(),
                    _elements: [oid, lastElementOf(keyUsage)],
                });
            });
            expectRefusal(() => Pai.fromAsn1(pai), profile(/PAI carries more than one keyUsage extension/));
        });
    });

    describe("accepts the DAC and PAI of each TC-DA-1.8 success vector", () => {
        for (const [name, { dac, pai }] of Object.entries(AcceptedAttestationVectors)) {
            it(name, () => {
                Dac.fromAsn1(Bytes.fromHex(dac));
                Pai.fromAsn1(Bytes.fromHex(pai));
            });
        }
    });

    describe("when accepting a profile violation", () => {
        it("parses a DAC and a PAI that violate their profile", () => {
            const dac = Dac.fromAsn1(Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_ca_wrong.dac), {
                acceptProfileViolation: true,
            });
            expect(dac.cert.extensions.basicConstraints.isCa).true;

            const pai = Pai.fromAsn1(Bytes.fromHex(RefusedPaiVectors.struct_pai_ext_basic_ca_wrong.pai), {
                acceptProfileViolation: true,
            });
            expect(pai.cert.extensions.basicConstraints.isCa).false;
        });

        it("reads an absent basic constraints extension as not a CA", () => {
            const dac = Dac.fromAsn1(Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_missing.dac), {
                acceptProfileViolation: true,
            });
            expect(dac.cert.extensions.basicConstraints).deep.equals({ isCa: false });

            const pai = Pai.fromAsn1(Bytes.fromHex(RefusedPaiVectors.struct_pai_ext_basic_missing.pai), {
                acceptProfileViolation: true,
            });
            expect(pai.cert.extensions.basicConstraints).deep.equals({ isCa: false });
        });

        it("still refuses a certificate without key usage", () => {
            expect(() =>
                Dac.fromAsn1(Bytes.fromHex(RefusedDacVectors.struct_dac_ext_key_usage_missing.dac), {
                    acceptProfileViolation: true,
                }),
            ).throws(CertificateError, /Missing required extensions in certificate: keyUsage/);
        });
    });

    describe("PAA", () => {
        // A PAI without basic constraints stands in for a PAA without them; the PAA profile is not checked
        const withoutBasicConstraints = Bytes.fromHex(RefusedPaiVectors.struct_pai_ext_basic_missing.pai);

        it("requires the basic constraints extension", () => {
            expect(() => Paa.fromAsn1(withoutBasicConstraints)).throws(
                CertificateError,
                /Missing required extensions in certificate: basicConstraints/,
            );
        });

        it("reads an absent basic constraints extension as not a CA when accepting a profile violation", () => {
            const paa = Paa.fromAsn1(withoutBasicConstraints, { acceptProfileViolation: true });
            expect(paa.cert.extensions.basicConstraints).deep.equals({ isCa: false });
        });
    });

    describe("parser", () => {
        it("keeps the version field", () => {
            const v2 = Bytes.fromHex(RefusedDacVectors.struct_dac_cert_version_v2.dac);
            expect(Certificate.parseAsn1Certificate(Bytes.fromHex(VALID_DAC)).encoding?.version).equals(2);
            expect(Certificate.parseAsn1Certificate(v2).encoding?.version).equals(1);
        });

        it("keeps which interpreted extensions are present and critical", () => {
            const valid = Certificate.parseAsn1Certificate(Bytes.fromHex(VALID_DAC));
            expect(valid.encoding?.extensions).deep.equals([
                { name: "basicConstraints", critical: true },
                { name: "keyUsage", critical: true },
                { name: "subjectKeyIdentifier", critical: false },
                { name: "authorityKeyIdentifier", critical: false },
            ]);

            const omitted = Certificate.parseAsn1Certificate(
                Bytes.fromHex(RefusedDacVectors.struct_dac_ext_key_usage_critical_wrong.dac),
            );
            expect(omitted.encoding?.extensions.find(({ name }) => name === "keyUsage")?.critical).false;
        });

        it("reads an explicit critical FALSE as not critical", () => {
            // keyUsage (2.5.29.15) with critical TRUE, rewritten in place to an explicit FALSE
            const criticalKeyUsage = "0603551d0f0101ff";
            expect(VALID_DAC.split(criticalKeyUsage)).length(2);
            const explicitFalse = Certificate.parseAsn1Certificate(
                Bytes.fromHex(VALID_DAC.replace(criticalKeyUsage, "0603551d0f010100")),
            );
            expect(explicitFalse.encoding?.extensions.find(({ name }) => name === "keyUsage")?.critical).false;
        });

        it("refuses an empty critical flag", () => {
            const cert = editExtensions(VALID_DAC, extensions => {
                const keyUsage = extensionNamed(extensions, KEY_USAGE_OID);
                (keyUsage._elements ?? expect.fail("Extension has no elements"))[1]._bytes = new Uint8Array();
            });
            expect(() => Certificate.parseAsn1Certificate(cert)).throws(CertificateError, /BOOLEAN of 0 bytes/);
        });

        it("refuses an empty cA flag", () => {
            const cert = withExtensionValue(VALID_PAI, BASIC_CONSTRAINTS_OID, "30050100020100");
            expect(() => Certificate.parseAsn1Certificate(cert)).throws(
                CertificateError,
                /Basic constraints cA is a BOOLEAN of 0 bytes/,
            );
        });

        it("refuses a pathLen without content", () => {
            const cert = withExtensionValue(VALID_PAI, BASIC_CONSTRAINTS_OID, "30050101ff0200");
            expect(() => Certificate.parseAsn1Certificate(cert)).throws(
                CertificateError,
                /pathLenConstraint is an INTEGER without content/,
            );
        });

        it("reads pathLen when cA is omitted", () => {
            const cert = Certificate.parseAsn1Certificate(
                Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_ca_missing.dac),
            );
            expect(cert.extensions.basicConstraints).deep.equals({ isCa: false, pathLen: 0 });
        });

        it("reads an absent basic constraints extension as not a CA and records it as absent", () => {
            const cert = Certificate.parseAsn1Certificate(
                Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_missing.dac),
                ["keyUsage"],
            );
            expect(cert.extensions.basicConstraints).deep.equals({ isCa: false });
            expect(cert.encoding?.extensions.map(({ name }) => name)).not.include("basicConstraints");
            expect(() =>
                Certificate.parseAsn1Certificate(Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_missing.dac)),
            ).throws(CertificateError, /Missing required extensions in certificate: basicConstraints/);
        });

        it("reads a pathLen that needs more than one byte", () => {
            // SEQUENCE { cA TRUE, pathLen 256 }, whose low byte alone would read as 0
            const pai = withExtensionValue(VALID_PAI, BASIC_CONSTRAINTS_OID, "30070101ff02020100");
            expect(Certificate.parseAsn1Certificate(pai).extensions.basicConstraints).deep.equals({
                isCa: true,
                pathLen: 256,
            });
            expectRefusal(() => Pai.fromAsn1(pai), profile(/pathLen 0, not 256/));
        });

        it("reads all key usage bits", () => {
            // digitalSignature, decipherOnly (bit 8) and bit 9
            const cert = Certificate.parseAsn1Certificate(withExtensionValue(VALID_DAC, KEY_USAGE_OID, "03030680c0"));
            expect(cert.encoding?.keyUsage).equals(0x0301);
            expect(cert.extensions.keyUsage.decipherOnly).true;
        });

        it("parses a certificate with an extension it carries twice", () => {
            const cert = editExtensions(VALID_DAC, extensions => {
                extensions.push(extensionNamed(extensions, KEY_USAGE_OID));
            });
            expect(
                Certificate.parseAsn1Certificate(cert).encoding?.extensions.filter(({ name }) => name === "keyUsage"),
            ).length(2);
        });
    });

    describe("device attestation findings", () => {
        async function validate(dac: string, pai: string) {
            try {
                await DeviceAttestationValidator.validate(
                    { crypto: new StandardCrypto(), attestationChallenge: new Uint8Array(16) },
                    {
                        dac: Bytes.fromHex(dac),
                        pai: Bytes.fromHex(pai),
                        attestationElements: new Uint8Array(),
                        attestationSignature: new Uint8Array(64),
                        attestationNonce: new Uint8Array(32),
                        vendorId: VendorId(0xfff1),
                        productId: 0x8000,
                    },
                );
            } catch (error) {
                return error;
            }
            expect.fail("Validation succeeded");
        }

        it("reports a DAC that violates the DAC profile as DacFormatInvalid", async () => {
            const error = await validate(RefusedDacVectors.struct_dac_ext_basic_ca_wrong.dac, VALID_PAI);
            expect(error)
                .instanceOf(DeviceAttestationError)
                .with.property("failure")
                .equals(DeviceAttestationCheck.DacFormatInvalid);
            expect(error)
                .with.property("message")
                .match(
                    /DAC certificate that violates the DAC profile: DAC basic constraints must have cA set to FALSE/,
                );
        });

        it("reports a PAI that violates the PAI profile as PaiFormatInvalid, before checking the DAC", async () => {
            const error = await validate(
                RefusedDacVectors.struct_dac_ext_basic_ca_wrong.dac,
                RefusedPaiVectors.struct_pai_ext_basic_ca_wrong.pai,
            );
            expect(error)
                .instanceOf(DeviceAttestationError)
                .with.property("failure")
                .equals(DeviceAttestationCheck.PaiFormatInvalid);
        });

        it("reports a DAC without key usage as unparseable", async () => {
            const error = await validate(RefusedDacVectors.struct_dac_ext_key_usage_missing.dac, VALID_PAI);
            expect(error)
                .instanceOf(DeviceAttestationError)
                .with.property("failure")
                .equals(DeviceAttestationCheck.CertificateUnparseable);
        });
    });
});
