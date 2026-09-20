/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    Bytes,
    Crypto,
    Environment,
    ImplementationError,
    MockFetch,
    MockStorageService,
    StandardCrypto,
} from "@matter/general";

/** The PAI that issued the revoked development DACs, and one serial the set names as revoked. */
const PAI_AKID = "63540E47F64B1C38D13884A462D16C195D8FFB3C";
const PAI_NAME = "MD0xJTAjBgNVBAMMHE1hdHRlciBEZXYgUEFJIDB4RkZGMSBubyBQSUQxFDASBgorBgEEAYKifAIBDARGRkYx";
const REVOKED_SERIAL = "19367D978EAC533A";
const OTHER_SERIAL = "0AB042494323FE54";
const OTHER_NAME = "MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQTEUMBIGCisGAQQBgqJ8AgEMBEZGRjE=";

const EMPTY_DCL_RESPONSE = { approvedRootCertificates: { schemaVersion: 0, certs: [] } };

function nameAsDerHex(base64: string) {
    return Bytes.toHex(Bytes.fromBase64(base64)).toUpperCase();
}

describe("DclCertificateService revocation outside the DCL", () => {
    let fetchMock: MockFetch;
    let environment: Environment;

    beforeEach(() => {
        fetchMock = new MockFetch();
        environment = new Environment("test");
        new MockStorageService(environment);
        environment.set(Crypto, new StandardCrypto());
        fetchMock.addResponse("/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        MockTime.reset();
    });

    afterEach(() => {
        fetchMock.uninstall();
    });

    async function service(options?: DclCertificateService.Options) {
        fetchMock.install();
        const service = new DclCertificateService(environment, { updateInterval: null, ...options });
        await service.construction;
        return service;
    }

    /** An authority the DCL says nothing about, so only installed information can answer. */
    function dclKnowsNothing(akid = PAI_AKID) {
        fetchMock.addResponse(
            `/dcl/pki/revocation-points/${akid}`,
            { code: 404, message: "not found" },
            { status: 404 },
        );
    }

    it("reports a serial an installed set names as revoked", async () => {
        dclKnowsNothing();
        const dcl = await service();

        dcl.installRevocations([
            { issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] },
        ]);

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(PAI_NAME))).equal(true);

        await dcl.close();
    });

    it("installs what the constructor was given", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [{ issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: [REVOKED_SERIAL] }],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL)).equal(true);

        await dcl.close();
    });

    it("passes a serial the set does not name to the DCL, which here knows nothing", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [{ issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: [REVOKED_SERIAL] }],
        });

        expect(await dcl.isRevoked(PAI_AKID, OTHER_SERIAL)).equal(false);
        expect(fetchMock.getCallLog().some(call => call.url.includes(`/revocation-points/${PAI_AKID}`))).equal(true);

        await dcl.close();
    });

    it("answers a serial the set does name without asking the DCL", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [{ issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: [REVOKED_SERIAL] }],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL)).equal(true);
        expect(fetchMock.getCallLog().some(call => call.url.includes("/revocation-points/"))).equal(false);

        await dcl.close();
    });

    it("holds an authority's entries apart by the issuer name they carry", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [
                { issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] },
            ],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(PAI_NAME))).equal(true);
        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(OTHER_NAME))).equal(false);

        await dcl.close();
    });

    it("keeps one authority's two issuers apart, each with its own serials", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [
                { issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] },
                { issuerSubjectKeyId: PAI_AKID, issuerName: OTHER_NAME, revokedSerialNumbers: [OTHER_SERIAL] },
            ],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(PAI_NAME))).equal(true);
        expect(await dcl.isRevoked(PAI_AKID, OTHER_SERIAL, nameAsDerHex(OTHER_NAME))).equal(true);
        expect(await dcl.isRevoked(PAI_AKID, OTHER_SERIAL, nameAsDerHex(PAI_NAME))).equal(false);
        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(OTHER_NAME))).equal(false);

        await dcl.close();
    });

    it("installs the same set twice without stacking it up", async () => {
        dclKnowsNothing();
        const set = [{ issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] }];
        const dcl = await service({ revocations: set });

        dcl.installRevocations(set);
        dcl.installRevocations(set);

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(PAI_NAME))).equal(true);
        expect(dcl.installedRevocations.get(PAI_AKID)).lengthOf(1);

        // A copy each time, so what a reader holds is never what the service checks against
        const first = dcl.installedRevocations.get(PAI_AKID)?.[0].serials;
        const second = dcl.installedRevocations.get(PAI_AKID)?.[0].serials;
        expect(first).not.equal(second);
        expect([...(first ?? [])]).deep.equal([REVOKED_SERIAL]);
        expect([...(second ?? [])]).deep.equal([REVOKED_SERIAL]);

        await dcl.close();
    });

    it("matches a serial whose top bit is set, which a certificate states with a leading zero", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [{ issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: ["E1234567"] }],
        });

        // What a certificate carries: the content octets of a DER INTEGER, zero-padded to stay positive
        expect(await dcl.isRevoked(PAI_AKID, Bytes.fromHex("00E1234567"))).equal(true);

        await dcl.close();
    });

    it("matches on the key identifier alone where an entry states an empty issuer name", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [{ issuerSubjectKeyId: PAI_AKID, issuerName: "", revokedSerialNumbers: [REVOKED_SERIAL] }],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(OTHER_NAME))).equal(true);

        await dcl.close();
    });

    it("installs nothing when an entry hands in a serial that is not hex", async () => {
        dclKnowsNothing();
        const dcl = await service();

        expect(() =>
            dcl.installRevocations([
                { issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: [REVOKED_SERIAL] },
                { issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: ["nonsense"] },
            ]),
        ).throws(ImplementationError, "revokedSerialNumbers[0]");

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL)).equal(false);

        await dcl.close();
    });

    it("installs nothing when an entry states an issuer name that is not base64", async () => {
        dclKnowsNothing();
        const dcl = await service();

        expect(() =>
            dcl.installRevocations([
                { issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] },
                { issuerSubjectKeyId: PAI_AKID, issuerName: "not base64!", revokedSerialNumbers: [OTHER_SERIAL] },
            ]),
        ).throws(ImplementationError, "entry 1");

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(PAI_NAME))).equal(false);

        await dcl.close();
    });

    it("matches on the key identifier alone where an entry names no issuer", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [{ issuerSubjectKeyId: PAI_AKID, revokedSerialNumbers: [REVOKED_SERIAL] }],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL, nameAsDerHex(OTHER_NAME))).equal(true);

        await dcl.close();
    });

    it("matches an entry that names an issuer even where the caller states none", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [
                { issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] },
            ],
        });

        expect(await dcl.isRevoked(PAI_AKID, REVOKED_SERIAL)).equal(true);

        await dcl.close();
    });

    it("reads a serial stated with separators, and one stated as bytes", async () => {
        dclKnowsNothing();
        const dcl = await service({
            revocations: [
                {
                    issuerSubjectKeyId: "63:54:0E:47:F6:4B:1C:38:D1:38:84:A4:62:D1:6C:19:5D:8F:FB:3C",
                    revokedSerialNumbers: ["19:36:7d:97:8e:ac:53:3a"],
                },
            ],
        });

        expect(await dcl.isRevoked(PAI_AKID, Bytes.fromHex(REVOKED_SERIAL))).equal(true);

        await dcl.close();
    });

    describe("parseRevocationSet()", () => {
        it("reads the set as the revocation-set tool writes it", () => {
            const entries = DclCertificateService.parseRevocationSet(
                JSON.stringify([
                    {
                        type: "revocation_set",
                        issuer_subject_key_id: PAI_AKID,
                        issuer_name: PAI_NAME,
                        revoked_serial_numbers: [REVOKED_SERIAL],
                        crl_signer_cert: "MIIB...",
                    },
                ]),
            );

            expect(entries).deep.equal([
                { issuerSubjectKeyId: PAI_AKID, issuerName: PAI_NAME, revokedSerialNumbers: [REVOKED_SERIAL] },
            ]);
        });

        it("refuses text that is not JSON", () => {
            expect(() => DclCertificateService.parseRevocationSet("not json")).throws(ImplementationError);
        });

        it("refuses a set that is not a list of entries", () => {
            expect(() => DclCertificateService.parseRevocationSet('{"issuer_subject_key_id":"AB"}')).throws(
                ImplementationError,
                "must be an array",
            );
        });

        it("refuses an entry that names no issuer key identifier", () => {
            expect(() => DclCertificateService.parseRevocationSet('[{"revoked_serial_numbers":["AB"]}]')).throws(
                ImplementationError,
                "issuer_subject_key_id",
            );
        });

        it("refuses an entry that is not an object at all", () => {
            expect(() => DclCertificateService.parseRevocationSet("[5]")).throws(
                ImplementationError,
                "entry 0 is not an object",
            );
        });

        it("refuses an entry whose key identifier is not hex, which would match nothing", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    '[{"issuer_subject_key_id":"not hex","revoked_serial_numbers":["AB"]}]',
                ),
            ).throws(ImplementationError, "issuer_subject_key_id");
        });

        it("refuses a serial that is not hex, which would match nothing", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"issuer_subject_key_id":"${PAI_AKID}","revoked_serial_numbers":["zz"]}]`,
                ),
            ).throws(ImplementationError, "revoked_serial_numbers[0]");
        });

        it("refuses hex that does not divide into bytes", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"issuer_subject_key_id":"${PAI_AKID}","revoked_serial_numbers":["ABC"]}]`,
                ),
            ).throws(ImplementationError, "even number of hex digits");
        });

        it("refuses an issuer name that is not base64", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"issuer_subject_key_id":"${PAI_AKID}","issuer_name":"not base64!","revoked_serial_numbers":["AB"]}]`,
                ),
            ).throws(ImplementationError, "issuer_name");
        });

        it("refuses an entry stating a type other than a revocation set", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"type":"certificate","issuer_subject_key_id":"${PAI_AKID}","revoked_serial_numbers":["AB"]}]`,
                ),
            ).throws(ImplementationError, "revocation_set");
        });

        it("refuses a list where an entry should be", () => {
            expect(() => DclCertificateService.parseRevocationSet('[["not","an","entry"]]')).throws(
                ImplementationError,
                "entry 0 is not an object",
            );
        });

        it("reads a set that revokes nothing", () => {
            expect(DclCertificateService.parseRevocationSet("[]")).deep.equal([]);
        });

        it("refuses an entry whose serial numbers are not a list", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"issuer_subject_key_id":"${PAI_AKID}","revoked_serial_numbers":"AB"}]`,
                ),
            ).throws(ImplementationError, "revoked_serial_numbers");
        });

        it("refuses an entry whose issuer name is not a string", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"issuer_subject_key_id":"${PAI_AKID}","issuer_name":123,"revoked_serial_numbers":["AB"]}]`,
                ),
            ).throws(ImplementationError, "issuer_name");
        });

        it("refuses an entry whose serial numbers are not a list of strings", () => {
            expect(() =>
                DclCertificateService.parseRevocationSet(
                    `[{"issuer_subject_key_id":"${PAI_AKID}","revoked_serial_numbers":[7]}]`,
                ),
            ).throws(ImplementationError, "revoked_serial_numbers");
        });
    });
});
