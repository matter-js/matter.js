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
import { Dac, Pai } from "#certificate/kinds/AttestationCertificates.js";
import { Certificate } from "#certificate/kinds/Certificate.js";
import { Bytes, CertificateError, DerCodec, DerNode, DerType, StandardCrypto } from "@matter/general";
import { VendorId } from "@matter/types";
import { AcceptedAttestationVectors, RefusedDacVectors, RefusedPaiVectors } from "./ChipAttestationProfileVectors.js";

/** The rule each refused vector violates, as the CertificateError message names it. */
const DAC_REFUSALS: Record<keyof typeof RefusedDacVectors, RegExp> = {
    struct_dac_cert_version_v2: /DAC version field must be 2/,
    struct_dac_ext_basic_ca_missing: /DAC basic constraints must not have a pathLen/,
    struct_dac_ext_basic_ca_wrong: /DAC basic constraints must have cA set to FALSE/,
    struct_dac_ext_basic_critical_missing: /DAC basic constraints extension must be marked critical/,
    struct_dac_ext_basic_critical_wrong: /DAC basic constraints extension must be marked critical/,
    struct_dac_ext_basic_missing: /Missing required extensions in certificate: basicConstraints/,
    struct_dac_ext_basic_pathlen0: /DAC basic constraints must not have a pathLen, found 0/,
    struct_dac_ext_basic_pathlen1: /DAC basic constraints must not have a pathLen, found 1/,
    struct_dac_ext_basic_pathlen2: /DAC basic constraints must not have a pathLen, found 2/,
    struct_dac_ext_basic_pathlen_presence_wrong: /DAC basic constraints must not have a pathLen/,
    struct_dac_ext_key_usage_critical_missing: /DAC key usage extension must be marked critical/,
    struct_dac_ext_key_usage_critical_wrong: /DAC key usage extension must be marked critical/,
    struct_dac_ext_key_usage_crl_sign_wrong: /DAC key usage must have only digitalSignature set/,
    struct_dac_ext_key_usage_dig_sig_wrong: /DAC key usage must have only digitalSignature set/,
    struct_dac_ext_key_usage_key_cert_sign_wrong: /DAC key usage must have only digitalSignature set/,
};

const PAI_REFUSALS: Record<keyof typeof RefusedPaiVectors, RegExp> = {
    struct_pai_cert_version_v2: /PAI version field must be 2/,
    struct_pai_ext_basic_ca_missing: /PAI basic constraints must have cA set to TRUE/,
    struct_pai_ext_basic_ca_wrong: /PAI basic constraints must have cA set to TRUE/,
    struct_pai_ext_basic_critical_missing: /PAI basic constraints extension must be marked critical/,
    struct_pai_ext_basic_critical_wrong: /PAI basic constraints extension must be marked critical/,
    struct_pai_ext_basic_missing: /Missing required extensions in certificate: basicConstraints/,
    struct_pai_ext_basic_pathlen1: /PAI basic constraints must have pathLen 0, not 1/,
    struct_pai_ext_basic_pathlen2: /PAI basic constraints must have pathLen 0, not 2/,
    struct_pai_ext_basic_pathlen_presence_wrong: /PAI basic constraints must have pathLen 0, not undefined/,
    struct_pai_ext_key_usage_critical_missing: /PAI key usage extension must be marked critical/,
    struct_pai_ext_key_usage_critical_wrong: /PAI key usage extension must be marked critical/,
    struct_pai_ext_key_usage_crl_sign_wrong: /PAI key usage must have keyCertSign and cRLSign set/,
    struct_pai_ext_key_usage_key_cert_sign_wrong: /PAI key usage must have keyCertSign and cRLSign set/,
};

function vectorOf<T>(vectors: Record<string, T>, name: string) {
    return new Map(Object.entries(vectors)).get(name) ?? expect.fail(`No test vector ${name}`);
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

/** Let `edit` change the extension list of a certificate.  The signature no longer matches the result. */
function editExtensions(hex: string, edit: (extensions: DerNode[]) => void) {
    const cert = DerCodec.decode(Bytes.fromHex(hex));
    const extensions =
        cert._elements?.[0]._elements?.find(element => element._tag === 0xa3)?._elements?.[0]._elements ??
        expect.fail("Certificate has no extensions");
    edit(extensions);
    return reencode(cert);
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

describe("Attestation certificate profile", () => {
    describe("refuses a DAC that violates the DAC profile", () => {
        for (const [name, rule] of Object.entries(DAC_REFUSALS)) {
            it(name, () => {
                const { dac } = vectorOf(RefusedDacVectors, name);
                expect(() => Dac.fromAsn1(Bytes.fromHex(dac)))
                    .throws(CertificateError)
                    .with.property("message")
                    .match(rule);
            });
        }
    });

    describe("refuses a PAI that violates the PAI profile", () => {
        for (const [name, rule] of Object.entries(PAI_REFUSALS)) {
            it(name, () => {
                const { pai } = vectorOf(RefusedPaiVectors, name);
                expect(() => Pai.fromAsn1(Bytes.fromHex(pai)))
                    .throws(CertificateError)
                    .with.property("message")
                    .match(rule);
            });
        }
    });

    describe("accepts the DAC and PAI of each TC-DA-1.8 success vector", () => {
        for (const [name, { dac, pai }] of Object.entries(AcceptedAttestationVectors)) {
            it(name, () => {
                Dac.fromAsn1(Bytes.fromHex(dac));
                Pai.fromAsn1(Bytes.fromHex(pai));
            });
        }
    });

    it("accepts a profile violation when asked to", () => {
        const dac = Dac.fromAsn1(Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_ca_wrong.dac), {
            acceptProfileViolation: true,
        });
        expect(dac.cert.extensions.basicConstraints.isCa).true;

        const pai = Pai.fromAsn1(Bytes.fromHex(RefusedPaiVectors.struct_pai_ext_basic_ca_wrong.pai), {
            acceptProfileViolation: true,
        });
        expect(pai.cert.extensions.basicConstraints.isCa).false;
    });

    it("reads an absent basic constraints extension as not a CA when accepting a profile violation", () => {
        const dac = Dac.fromAsn1(Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_missing.dac), {
            acceptProfileViolation: true,
        });
        expect(dac.cert.extensions.basicConstraints).deep.equals({ isCa: false });

        const pai = Pai.fromAsn1(Bytes.fromHex(RefusedPaiVectors.struct_pai_ext_basic_missing.pai), {
            acceptProfileViolation: true,
        });
        expect(pai.cert.extensions.basicConstraints).deep.equals({ isCa: false });
    });

    describe("parser", () => {
        it("keeps the version field", () => {
            const v3 = Bytes.fromHex(AcceptedAttestationVectors.struct_dac_cert_version_v3.dac);
            const v2 = Bytes.fromHex(RefusedDacVectors.struct_dac_cert_version_v2.dac);
            expect(Certificate.parseAsn1Certificate(v3).version).equals(2);
            expect(Certificate.parseAsn1Certificate(v2).version).equals(1);
        });

        it("keeps which interpreted extensions are critical", () => {
            const valid = Certificate.parseAsn1Certificate(
                Bytes.fromHex(AcceptedAttestationVectors.struct_dac_cert_version_v3.dac),
            );
            expect(valid.criticalExtensions).deep.equals(["basicConstraints", "keyUsage"]);

            const omitted = Certificate.parseAsn1Certificate(
                Bytes.fromHex(RefusedDacVectors.struct_dac_ext_key_usage_critical_wrong.dac),
            );
            expect(omitted.criticalExtensions).deep.equals(["basicConstraints"]);
        });

        it("reads an explicit critical FALSE as not critical", () => {
            // keyUsage (2.5.29.15) with critical TRUE, rewritten in place to an explicit FALSE
            const valid = AcceptedAttestationVectors.struct_dac_cert_version_v3.dac;
            const criticalKeyUsage = "0603551d0f0101ff";
            expect(valid.split(criticalKeyUsage)).length(2);
            const explicitFalse = Certificate.parseAsn1Certificate(
                Bytes.fromHex(valid.replace(criticalKeyUsage, "0603551d0f010100")),
            );
            expect(explicitFalse.criticalExtensions).deep.equals(["basicConstraints"]);
        });

        it("reads pathLen when cA is omitted", () => {
            const cert = Certificate.parseAsn1Certificate(
                Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_ca_missing.dac),
            );
            expect(cert.extensions.basicConstraints).deep.equals({ isCa: false, pathLen: 0 });
        });

        it("leaves an absent basic constraints extension undefined", () => {
            const cert = Certificate.parseAsn1Certificate(
                Bytes.fromHex(RefusedDacVectors.struct_dac_ext_basic_missing.dac),
                ["keyUsage"],
            );
            expect(cert.extensions.basicConstraints).undefined;
        });

        it("reads a pathLen that needs more than one byte", () => {
            const pai = editExtensions(RefusedPaiVectors.struct_pai_ext_basic_pathlen1.pai, extensions => {
                const basicConstraints = extensionNamed(extensions, BASIC_CONSTRAINTS_OID);
                // SEQUENCE { cA TRUE, pathLen 128 }, where 128 encodes as 00 80
                lastElementOf(basicConstraints)._bytes = Bytes.fromHex("30070101ff02020080");
            });
            expect(Certificate.parseAsn1Certificate(pai).extensions.basicConstraints).deep.equals({
                isCa: true,
                pathLen: 128,
            });
            expect(() => Pai.fromAsn1(pai)).throws(CertificateError, /pathLen 0, not 128/);
        });

        it("refuses a certificate with an extension it carries twice", () => {
            const dac = editExtensions(AcceptedAttestationVectors.struct_dac_cert_version_v3.dac, extensions => {
                const keyUsage = extensionNamed(extensions, KEY_USAGE_OID);
                const oid = keyUsage._elements?.[0] ?? expect.fail("Extension has no OID");
                // A second copy without the critical flag
                extensions.push({
                    _tag: keyUsage._tag,
                    _bytes: new Uint8Array(),
                    _elements: [oid, lastElementOf(keyUsage)],
                });
            });
            expect(() => Certificate.parseAsn1Certificate(dac)).throws(
                CertificateError,
                /more than one keyUsage extension/,
            );
        });
    });

    it("reports a profile violation as an unparseable certificate during device attestation", async () => {
        const vector = RefusedDacVectors.struct_dac_ext_basic_ca_wrong;
        const accepted = AcceptedAttestationVectors.struct_dac_cert_version_v3;
        let error: unknown;
        try {
            await DeviceAttestationValidator.validate(
                { crypto: new StandardCrypto(), attestationChallenge: new Uint8Array(16) },
                {
                    dac: Bytes.fromHex(vector.dac),
                    pai: Bytes.fromHex(accepted.pai),
                    attestationElements: new Uint8Array(),
                    attestationSignature: new Uint8Array(64),
                    attestationNonce: new Uint8Array(32),
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                },
            );
        } catch (caught) {
            error = caught;
        }
        expect(error)
            .instanceOf(DeviceAttestationError)
            .with.property("failure")
            .equals(DeviceAttestationCheck.CertificateUnparseable);
        expect(error)
            .with.property("message")
            .match(/DAC certificate that cannot be parsed/);
    });
});
