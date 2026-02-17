/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclClient } from "#dcl/DclClient.js";
import { MockFetch } from "#general";

// Mock DCL revocation distribution point responses using raw DCL API field names
const mockRevocationPointsPage1 = {
    PkiRevocationDistributionPoint: [
        {
            vid: 0xfff1,
            pid: 0x8000,
            isPAA: false,
            label: "label1",
            crlSignerDelegator: "",
            crlSignerCertificate: "-----BEGIN CERTIFICATE-----\nMIIBvTCCAWOgA\n-----END CERTIFICATE-----",
            issuerSubjectKeyID: "A303136D54A84BE24C4887B341066DC270962F99",
            dataURL: "https://example.com/crl1.der",
            dataFileSize: "0",
            dataDigest: "",
            dataDigestType: 0,
            revocationType: 1,
            schemaVersion: 0,
        },
        {
            vid: 4701,
            pid: 22,
            isPAA: false,
            label: "label2",
            crlSignerDelegator: "",
            crlSignerCertificate: "-----BEGIN CERTIFICATE-----\nMIIBxTCCAW2gA\n-----END CERTIFICATE-----",
            issuerSubjectKeyID: "E43183AE7B375D84EAB325F45F9E6D037D43DD00",
            dataURL: "https://example.com/crl2.der",
            dataFileSize: "0",
            dataDigest: "",
            dataDigestType: 0,
            revocationType: 1,
            schemaVersion: 0,
        },
    ],
    pagination: {
        next_key: null,
        total: "2",
    },
};

const mockRevocationPointsPaginated1 = {
    PkiRevocationDistributionPoint: [
        {
            vid: 0xfff1,
            pid: 0x8000,
            isPAA: false,
            label: "page1-label",
            crlSignerDelegator: "",
            crlSignerCertificate: "-----BEGIN CERTIFICATE-----\npage1cert\n-----END CERTIFICATE-----",
            issuerSubjectKeyID: "A303136D54A84BE24C4887B341066DC270962F99",
            dataURL: "https://example.com/crl-page1.der",
            dataFileSize: "0",
            dataDigest: "",
            dataDigestType: 0,
            revocationType: 1,
            schemaVersion: 0,
        },
    ],
    pagination: {
        next_key: "page2key",
        total: "2",
    },
};

const mockRevocationPointsPaginated2 = {
    PkiRevocationDistributionPoint: [
        {
            vid: 4701,
            pid: 22,
            isPAA: false,
            label: "page2-label",
            crlSignerDelegator: "",
            crlSignerCertificate: "-----BEGIN CERTIFICATE-----\npage2cert\n-----END CERTIFICATE-----",
            issuerSubjectKeyID: "E43183AE7B375D84EAB325F45F9E6D037D43DD00",
            dataURL: "https://example.com/crl-page2.der",
            dataFileSize: "0",
            dataDigest: "",
            dataDigestType: 0,
            revocationType: 1,
            schemaVersion: 0,
        },
    ],
    pagination: {},
};

const mockRevocationPointsByIssuer = {
    pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
        issuerSubjectKeyID: "A303136D54A84BE24C4887B341066DC270962F99",
        points: [
            {
                vid: 0xfff1,
                pid: 0x8000,
                isPAA: false,
                label: "label1",
                crlSignerDelegator: "",
                crlSignerCertificate:
                    "-----BEGIN CERTIFICATE-----\nMIIBvTCCAWOgA\n-----END CERTIFICATE-----",
                issuerSubjectKeyID: "A303136D54A84BE24C4887B341066DC270962F99",
                dataURL: "https://example.com/crl1.der",
                dataFileSize: "0",
                dataDigest: "",
                dataDigestType: 0,
                revocationType: 1,
                schemaVersion: 0,
            },
            {
                vid: 0xfff1,
                pid: 0x8001,
                isPAA: false,
                label: "label2",
                crlSignerDelegator:
                    "-----BEGIN CERTIFICATE-----\ndelegator\n-----END CERTIFICATE-----",
                crlSignerCertificate:
                    "-----BEGIN CERTIFICATE-----\nMIIBxTCCAW2gA\n-----END CERTIFICATE-----",
                issuerSubjectKeyID: "A303136D54A84BE24C4887B341066DC270962F99",
                dataURL: "https://example.com/crl2.der",
                dataFileSize: "1234",
                dataDigest: "abc123==",
                dataDigestType: 1,
                revocationType: 1,
                schemaVersion: 0,
            },
        ],
        schemaVersion: 0,
    },
};

describe("DclClient revocation distribution points", () => {
    let fetchMock: MockFetch;

    beforeEach(() => {
        fetchMock = new MockFetch();
    });

    afterEach(() => {
        fetchMock.uninstall();
    });

    describe("fetchRevocationDistributionPoints", () => {
        it("fetches all revocation points", async () => {
            fetchMock.addResponse("/dcl/pki/revocation-points", mockRevocationPointsPage1);
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPoints();

            expect(points).to.have.length(2);
            expect(points[0].issuerSubjectKeyId).to.equal(
                "A303136D54A84BE24C4887B341066DC270962F99",
            );
            expect(points[0].dataUrl).to.equal("https://example.com/crl1.der");
            expect(points[0].vid).to.equal(0xfff1);
            expect(points[0].pid).to.equal(0x8000);
            expect(points[0].isPAA).to.be.false;
            expect(points[0].label).to.equal("label1");
            expect(points[0].revocationType).to.equal(1);
            expect(points[0].schemaVersion).to.equal(0);

            expect(points[1].issuerSubjectKeyId).to.equal(
                "E43183AE7B375D84EAB325F45F9E6D037D43DD00",
            );
            expect(points[1].vid).to.equal(4701);
        });

        it("maps DCL field names correctly (issuerSubjectKeyID -> issuerSubjectKeyId, dataURL -> dataUrl)", async () => {
            fetchMock.addResponse("/dcl/pki/revocation-points", mockRevocationPointsPage1);
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPoints();

            // Verify the field name mapping from DCL API to our TypeScript types
            const point = points[0];
            expect(point).to.have.property("issuerSubjectKeyId");
            expect(point).to.have.property("dataUrl");
            // Ensure the raw DCL field names are not present
            expect(point).to.not.have.property("issuerSubjectKeyID");
            expect(point).to.not.have.property("dataURL");
        });

        it("handles paginated responses", async () => {
            // Add page1 mock first, then page2 mock. MockFetch checks in reverse order
            // (most recently added first), so page2 is checked first. The page2 pattern
            // "pagination.key=page2key" is specific enough to only match the second request.
            fetchMock.addResponse("/dcl/pki/revocation-points", mockRevocationPointsPaginated1);
            fetchMock.addResponse(
                "pagination.key=page2key",
                mockRevocationPointsPaginated2,
            );
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPoints();

            expect(points).to.have.length(2);
            expect(points[0].label).to.equal("page1-label");
            expect(points[1].label).to.equal("page2-label");
        });

        it("returns empty array when no revocation points exist", async () => {
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [],
                pagination: {},
            });
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPoints();

            expect(points).to.have.length(0);
        });

        it("maps optional fields correctly", async () => {
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0, // pid of 0 means no product ID
                        isPAA: true,
                        label: "paa-label",
                        crlSignerDelegator: "", // empty means not present
                        crlSignerCertificate: "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----",
                        issuerSubjectKeyID: "AABBCCDD",
                        dataURL: "https://example.com/crl.der",
                        dataFileSize: "5678",
                        dataDigest: "digest==",
                        dataDigestType: 1,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
                pagination: {},
            });
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPoints();

            expect(points).to.have.length(1);
            const point = points[0];
            expect(point.isPAA).to.be.true;
            expect(point.pid).to.be.undefined; // pid 0 mapped to undefined
            expect(point.crlSignerDelegator).to.be.undefined; // empty string mapped to undefined
            expect(point.dataFileSize).to.equal(5678);
            expect(point.dataDigest).to.equal("digest==");
            expect(point.dataDigestType).to.equal(1);
        });
    });

    describe("fetchRevocationDistributionPointsByIssuer", () => {
        it("fetches revocation points for a specific issuer", async () => {
            fetchMock.addResponse(
                "/dcl/pki/revocation-points/A303136D54A84BE24C4887B341066DC270962F99",
                mockRevocationPointsByIssuer,
            );
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPointsByIssuer(
                "A303136D54A84BE24C4887B341066DC270962F99",
            );

            expect(points).to.have.length(2);
            expect(points[0].issuerSubjectKeyId).to.equal(
                "A303136D54A84BE24C4887B341066DC270962F99",
            );
            expect(points[0].vid).to.equal(0xfff1);
            expect(points[0].pid).to.equal(0x8000);
            expect(points[1].pid).to.equal(0x8001);
        });

        it("maps crlSignerDelegator and dataFileSize from by-issuer response", async () => {
            fetchMock.addResponse(
                "/dcl/pki/revocation-points/A303136D54A84BE24C4887B341066DC270962F99",
                mockRevocationPointsByIssuer,
            );
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points = await dclClient.fetchRevocationDistributionPointsByIssuer(
                "A303136D54A84BE24C4887B341066DC270962F99",
            );

            // First point has no delegator, second does
            expect(points[0].crlSignerDelegator).to.be.undefined;
            expect(points[1].crlSignerDelegator).to.equal(
                "-----BEGIN CERTIFICATE-----\ndelegator\n-----END CERTIFICATE-----",
            );

            // Second point has a non-zero dataFileSize
            expect(points[1].dataFileSize).to.equal(1234);
        });

        it("returns empty array when issuer has no revocation points", async () => {
            fetchMock.addResponse("/dcl/pki/revocation-points/NONEXISTENT", {
                pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
                    issuerSubjectKeyID: "NONEXISTENT",
                    points: [],
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points =
                await dclClient.fetchRevocationDistributionPointsByIssuer("NONEXISTENT");

            expect(points).to.have.length(0);
        });

        it("encodes issuer subject key ID in URL path", async () => {
            fetchMock.addResponse("/dcl/pki/revocation-points/AA%3ABB%3ACC", {
                pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
                    issuerSubjectKeyID: "AA:BB:CC",
                    points: [],
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const dclClient = new DclClient(true);
            const points =
                await dclClient.fetchRevocationDistributionPointsByIssuer("AA:BB:CC");

            expect(points).to.have.length(0);

            // Verify the URL was properly encoded
            const callLog = fetchMock.getCallLog();
            expect(callLog.length).to.equal(1);
            expect(callLog[0].url).to.include("AA%3ABB%3ACC");
        });

        it("uses test-net URL when production is false", async () => {
            fetchMock.addResponse("test-net.dcl.csa-iot.org/dcl/pki/revocation-points/AABB", {
                pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
                    issuerSubjectKeyID: "AABB",
                    points: [],
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const dclClient = new DclClient(false);
            const points =
                await dclClient.fetchRevocationDistributionPointsByIssuer("AABB");

            expect(points).to.have.length(0);

            const callLog = fetchMock.getCallLog();
            expect(callLog[0].url).to.include("test-net.dcl.csa-iot.org");
        });
    });
});
