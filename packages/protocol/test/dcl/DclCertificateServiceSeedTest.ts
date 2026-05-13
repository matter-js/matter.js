/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestCert_PAA_FFF1_Cert, TestCert_PAA_NoVID_Cert } from "#certificate/ChipPAAuthorities.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import type { CdSignerEntry, PaaRootEntry, SeedSource } from "#dcl/SeedTypes.js";
import { Bytes, Crypto, Environment, MockFetch, MockStorageService, StandardCrypto } from "@matter/general";

const SKID_NO_VID = "785CE705B86B8F4E6FC793AA60CB43EA696882D5";
const SKID_FFF1 = "6AFD22771F511FECBF1641976710DCDC31A1717E";

const EMPTY_DCL_RESPONSE = { approvedRootCertificates: { schemaVersion: 0, certs: [] } };

function makePaaEntry(der: Bytes, skid: string, source: "dcl" | "github" = "dcl"): PaaRootEntry {
    return {
        role: "paa",
        subjectKeyId: skid.toLowerCase(),
        derHex: Bytes.toHex(der),
        source,
        kind: "production",
    };
}

function makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    return {
        [Symbol.asyncIterator]() {
            let i = 0;
            return {
                next() {
                    return Promise.resolve(
                        i < items.length ? { value: items[i++], done: false } : { value: undefined as any, done: true },
                    );
                },
            };
        },
    };
}

function makeSeedSource<T>(items: T[], builtAt = "2026-05-13T02:00:00Z"): SeedSource<T> {
    return { builtAt, expectedCount: items.length, entries: makeAsyncIterable(items) };
}

describe("DclCertificateService seed", () => {
    let fetchMock: MockFetch;
    let environment: Environment;

    beforeEach(() => {
        fetchMock = new MockFetch();
        environment = new Environment("test");
        new MockStorageService(environment);
        environment.set(Crypto, new StandardCrypto());
        MockTime.reset();
    });

    afterEach(async () => {
        fetchMock.uninstall();
    });

    it("inserts paaRoots from seed into storage", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const seed = makeSeedSource([
            makePaaEntry(TestCert_PAA_NoVID_Cert, SKID_NO_VID, "dcl"),
            makePaaEntry(TestCert_PAA_FFF1_Cert, SKID_FFF1, "dcl"),
        ]);

        const service = new DclCertificateService(environment, { seed: { paaRoots: seed }, updateInterval: null });
        await service.construction;

        const cert1 = service.getCertificate(SKID_NO_VID);
        expect(cert1).to.not.be.undefined;
        expect(cert1!.isProduction).to.be.true;

        const cert2 = service.getCertificate(SKID_FFF1);
        expect(cert2).to.not.be.undefined;
        expect(cert2!.isProduction).to.be.true;

        await service.close();
    });

    it("sets fetchedAt to snapshot builtAt for seeded certs", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const builtAt = "2026-05-13T02:00:00Z";
        const seed = makeSeedSource([makePaaEntry(TestCert_PAA_NoVID_Cert, SKID_NO_VID)], builtAt);

        const service = new DclCertificateService(environment, { seed: { paaRoots: seed }, updateInterval: null });
        await service.construction;

        const cert = service.getCertificate(SKID_NO_VID);
        expect(cert!.fetchedAt).to.equal(Date.parse(builtAt));

        await service.close();
    });

    it("maps source=dcl to isProduction=true", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const service = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([makePaaEntry(TestCert_PAA_NoVID_Cert, SKID_NO_VID, "dcl")]) },
            updateInterval: null,
        });
        await service.construction;

        expect(service.getCertificate(SKID_NO_VID)!.isProduction).to.be.true;
        await service.close();
    });

    it("maps source=github to isProduction=false", async () => {
        // With fetchTestCertificates:true, service also fetches test DCL
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.addResponse("on.test-net.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const service = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([makePaaEntry(TestCert_PAA_NoVID_Cert, SKID_NO_VID, "github")]) },
            updateInterval: null,
            fetchTestCertificates: true,
            fetchGithubCertificates: false,
        });
        await service.construction;

        expect(service.getCertificate(SKID_NO_VID)!.isProduction).to.be.false;
        await service.close();
    });

    it("skips test-kind entries when fetchTestCertificates is false", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const testEntry: PaaRootEntry = { ...makePaaEntry(TestCert_PAA_FFF1_Cert, SKID_FFF1), kind: "test" };
        const service = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([testEntry]) },
            updateInterval: null,
        });
        await service.construction;

        expect(service.getCertificate(SKID_FFF1)).to.be.undefined;
        await service.close();
    });

    it("includes test-kind entries when fetchTestCertificates is true", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.addResponse("on.test-net.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const testEntry: PaaRootEntry = { ...makePaaEntry(TestCert_PAA_FFF1_Cert, SKID_FFF1), kind: "test" };
        const service = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([testEntry]) },
            updateInterval: null,
            fetchTestCertificates: true,
            fetchGithubCertificates: false,
        });
        await service.construction;

        expect(service.getCertificate(SKID_FFF1)).to.not.be.undefined;
        await service.close();
    });

    it("skips expired certs (notAfter in the past)", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const expired: PaaRootEntry = {
            ...makePaaEntry(TestCert_PAA_NoVID_Cert, SKID_NO_VID),
            notAfter: "2000-01-01T00:00:00Z",
        };
        const service = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([expired]) },
            updateInterval: null,
        });
        await service.construction;

        expect(service.getCertificate(SKID_NO_VID)).to.be.undefined;
        await service.close();
    });

    it("warns and skips entry where subjectKeyId does not match DER-derived SKID", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        // FFF1 DER but claiming NoVID's SKID — mismatch should cause skip
        const mismatch: PaaRootEntry = {
            ...makePaaEntry(TestCert_PAA_FFF1_Cert, SKID_FFF1),
            subjectKeyId: SKID_NO_VID.toLowerCase(),
        };
        const service = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([mismatch]) },
            updateInterval: null,
        });
        await service.construction;

        expect(service.getCertificate(SKID_NO_VID)).to.be.undefined;
        expect(service.getCertificate(SKID_FFF1)).to.be.undefined;
        await service.close();
    });

    it("aborts paaRoots stream on malformed entry; cdSigners stream unaffected", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const malformed = { role: "paa" } as unknown as PaaRootEntry;
        const badPaaSource: SeedSource<PaaRootEntry> = {
            builtAt: "2026-05-13T02:00:00Z",
            expectedCount: 1,
            entries: makeAsyncIterable([malformed]),
        };

        const goodCdEntry: CdSignerEntry = {
            role: "cd-signer",
            subjectKeyId: SKID_NO_VID.toLowerCase(),
            derHex: Bytes.toHex(TestCert_PAA_NoVID_Cert),
            source: "dcl",
            kind: "production",
        };

        const service = new DclCertificateService(environment, {
            seed: { paaRoots: badPaaSource, cdSigners: makeSeedSource([goodCdEntry]) },
            updateInterval: null,
        });
        await service.construction;

        // cdSigners stream consumed — cert present with kind CDSigner
        const cd = service.getCertificate(SKID_NO_VID);
        expect(cd).to.not.be.undefined;
        expect(cd!.kind).to.equal("CDSigner");

        // paaRoots stream aborted — no PAA with SKID_FFF1
        expect(service.getCertificate(SKID_FFF1)).to.be.undefined;

        await service.close();
    });

    it("is idempotent: seeding twice produces same single cert", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const entry = makePaaEntry(TestCert_PAA_NoVID_Cert, SKID_NO_VID);
        const svc1 = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([entry]) },
            updateInterval: null,
        });
        await svc1.construction;
        await svc1.close();

        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        const svc2 = new DclCertificateService(environment, {
            seed: { paaRoots: makeSeedSource([entry]) },
            updateInterval: null,
        });
        await svc2.construction;

        expect(svc2.getCertificate(SKID_NO_VID)).to.not.be.undefined;
        expect(svc2.certificates.length).to.equal(1);

        await svc2.close();
    });

    it("no-seed: existing behavior unchanged", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", EMPTY_DCL_RESPONSE);
        fetchMock.install();

        const service = new DclCertificateService(environment, { updateInterval: null });
        await service.construction;

        expect(service.certificates.length).to.equal(0);
        await service.close();
    });
});
