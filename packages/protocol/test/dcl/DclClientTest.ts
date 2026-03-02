/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclClient, MatterDclError, MatterDclResponseError } from "#dcl/DclClient.js";
import { DclConfig } from "#dcl/DclConfig.js";
import { MockFetch } from "#general";

describe("DclClient", () => {
    let fetchMock: MockFetch;

    beforeEach(() => {
        fetchMock = new MockFetch();
    });

    afterEach(() => {
        fetchMock.uninstall();
    });

    describe("constructor", () => {
        it("defaults to production URL when no config provided", async () => {
            fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();

            const client = new DclClient();
            await client.fetchRootCertificateList();

            const callLog = fetchMock.getCallLog();
            expect(callLog.length).to.equal(1);
            expect(callLog[0].url).to.include("on.dcl.csa-iot.org");
        });

        it("uses production config explicitly", async () => {
            fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();

            const client = new DclClient(DclConfig.production);
            await client.fetchRootCertificateList();

            const callLog = fetchMock.getCallLog();
            expect(callLog[0].url).to.include("on.dcl.csa-iot.org");
        });

        it("uses test config", async () => {
            fetchMock.addResponse("on.test-net.dcl.csa-iot.org/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();

            const client = new DclClient(DclConfig.test);
            await client.fetchRootCertificateList();

            const callLog = fetchMock.getCallLog();
            expect(callLog[0].url).to.include("on.test-net.dcl.csa-iot.org");
        });

        it("uses custom URL", async () => {
            fetchMock.addResponse("custom.dcl.local/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();

            const client = new DclClient({ url: "https://custom.dcl.local" });
            await client.fetchRootCertificateList();

            const callLog = fetchMock.getCallLog();
            expect(callLog[0].url).to.include("custom.dcl.local");
        });
    });

    describe("fetchRootCertificateList", () => {
        it("fetches and parses root certificate list", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", {
                approvedRootCertificates: {
                    schemaVersion: 0,
                    certs: [
                        { subject: "subjectA", subjectKeyId: "keyA" },
                        { subject: "subjectB", subjectKeyId: "keyB" },
                    ],
                },
            });
            fetchMock.install();

            const client = new DclClient();
            const certs = await client.fetchRootCertificateList();

            expect(certs).to.be.an("array");
            expect(certs.length).to.equal(2);
            expect(certs[0].subject).to.equal("subjectA");
            expect(certs[1].subjectKeyId).to.equal("keyB");
        });

        it("throws on unsupported schema version", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 99, certs: [] },
            });
            fetchMock.install();

            const client = new DclClient();
            await expect(client.fetchRootCertificateList()).to.be.rejectedWith(
                MatterDclError,
                "Unsupported DCL Root Certificate schema version: 99",
            );
        });

        it("throws on HTTP error", async () => {
            fetchMock.addResponse(
                "/dcl/pki/root-certificates",
                { code: 500, message: "Internal Server Error", details: [] },
                { status: 500 },
            );
            fetchMock.install();

            const client = new DclClient();
            await expect(client.fetchRootCertificateList()).to.be.rejectedWith(MatterDclResponseError);
        });
    });

    describe("fetchRootCertificateBySubject", () => {
        it("fetches certificate by subject reference", async () => {
            const subject = "testSubject";
            const subjectKeyId = "testKeyId";
            fetchMock.addResponse(
                `/dcl/pki/certificates/${encodeURIComponent(subject)}/${encodeURIComponent(subjectKeyId)}`,
                {
                    approvedCertificates: {
                        subject,
                        subjectKeyId,
                        schemaVersion: 0,
                        certs: [{ pemCert: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----" }],
                    },
                },
            );
            fetchMock.install();

            const client = new DclClient();
            const certs = await client.fetchRootCertificateBySubject({ subject, subjectKeyId });

            expect(certs).to.be.an("array");
            expect(certs.length).to.equal(1);
        });

        it("throws when subject mismatch", async () => {
            fetchMock.addResponse(/\/dcl\/pki\/certificates\//, {
                approvedCertificates: {
                    subject: "wrongSubject",
                    subjectKeyId: "testKeyId",
                    schemaVersion: 0,
                    certs: [],
                },
            });
            fetchMock.install();

            const client = new DclClient();
            await expect(
                client.fetchRootCertificateBySubject({ subject: "testSubject", subjectKeyId: "testKeyId" }),
            ).to.be.rejectedWith(MatterDclError, "Root certificate not found");
        });

        it("throws when subjectKeyId mismatch", async () => {
            fetchMock.addResponse(/\/dcl\/pki\/certificates\//, {
                approvedCertificates: {
                    subject: "testSubject",
                    subjectKeyId: "wrongKeyId",
                    schemaVersion: 0,
                    certs: [],
                },
            });
            fetchMock.install();

            const client = new DclClient();
            await expect(
                client.fetchRootCertificateBySubject({ subject: "testSubject", subjectKeyId: "testKeyId" }),
            ).to.be.rejectedWith(MatterDclError, "Root certificate not found");
        });
    });

    describe("fetchModelByVidPid", () => {
        it("fetches model info", async () => {
            fetchMock.addResponse("/dcl/model/models/65521/32768", {
                model: {
                    vid: 0xfff1,
                    pid: 0x8000,
                    schemaVersion: 0,
                    deviceTypeId: 22,
                    productName: "Test Product",
                },
            });
            fetchMock.install();

            const client = new DclClient();
            const model = await client.fetchModelByVidPid(0xfff1, 0x8000);

            expect(model.vid).to.equal(0xfff1);
            expect(model.pid).to.equal(0x8000);
        });

        it("throws on VID/PID mismatch", async () => {
            fetchMock.addResponse("/dcl/model/models/65521/32768", {
                model: {
                    vid: 0xfff2,
                    pid: 0x8000,
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const client = new DclClient();
            await expect(client.fetchModelByVidPid(0xfff1, 0x8000)).to.be.rejectedWith(
                MatterDclError,
                "Model not found",
            );
        });
    });

    describe("fetchAllVendors", () => {
        it("handles pagination correctly", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", {
                vendorInfo: [
                    { vendorID: 1, vendorName: "Vendor1" },
                    { vendorID: 2, vendorName: "Vendor2" },
                ],
                pagination: { next_key: "page2" },
            });
            fetchMock.addResponse("pagination.key=page2", {
                vendorInfo: [{ vendorID: 3, vendorName: "Vendor3" }],
                pagination: {},
            });
            fetchMock.install();

            const client = new DclClient();
            const vendors = await client.fetchAllVendors();

            expect(vendors.length).to.equal(3);
            expect(vendors[0].vendorID).to.equal(1);
            expect(vendors[2].vendorID).to.equal(3);
        });
    });
});
