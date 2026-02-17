/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestCert_PAA_FFF1_Cert, TestCert_PAA_NoVID_Cert } from "#certificate/ChipPAAuthorities.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    Bytes,
    Days,
    DerCodec,
    DerType,
    Environment,
    Minutes,
    MockFetch,
    ObjectId,
    StorageBackendMemory,
    StorageManager,
    StorageService,
} from "#general";

// Mock DCL responses - using colon format as returned by real DCL API
const mockDclRootCertificateList = {
    approvedRootCertificates: {
        schemaVersion: 0,
        certs: [
            {
                subject: "MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ==",
                subjectKeyId: "78:5C:E7:05:B8:6B:8F:4E:6F:C7:93:AA:60:CB:43:EA:69:68:82:D5",
            },
            {
                subject: "MDAEFjAUBgorBgEEAYKefAIBDARGRkYx",
                subjectKeyId: "6A:FD:22:77:1F:51:1F:EC:BF:16:41:97:67:10:DC:DC:31:A1:71:7E",
            },
        ],
    },
};

const mockDclCertificateNoVID = {
    approvedCertificates: {
        subject: "MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ==",
        subjectKeyId: "78:5C:E7:05:B8:6B:8F:4E:6F:C7:93:AA:60:CB:43:EA:69:68:82:D5",
        schemaVersion: 0,
        certs: [
            {
                pemCert: pemEncode(TestCert_PAA_NoVID_Cert),
                serialNumber: "0B8FBAA8DD86EE",
                subject: "MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ==",
                subjectAsText: "CN=Matter Test PAA",
                subjectKeyId: "78:5C:E7:05:B8:6B:8F:4E:6F:C7:93:AA:60:CB:43:EA:69:68:82:D5",
                isRoot: true,
                owner: "cosmos1...",
                approvals: {} as any,
                rejects: {} as any,
                vid: 0,
                schemaVersion: 0,
            },
        ],
    },
};

const mockDclCertificateFFF1 = {
    approvedCertificates: {
        subject: "MDAEFjAUBgorBgEEAYKefAIBDARGRkYx",
        subjectKeyId: "6A:FD:22:77:1F:51:1F:EC:BF:16:41:97:67:10:DC:DC:31:A1:71:7E",
        schemaVersion: 0,
        certs: [
            {
                pemCert: pemEncode(TestCert_PAA_FFF1_Cert),
                serialNumber: "4EA8E83182D41C1C",
                subject: "MDAEFjAUBgorBgEEAYKefAIBDARGRkYx",
                subjectAsText: "CN=Matter Test PAA, VID=FFF1",
                subjectKeyId: "6A:FD:22:77:1F:51:1F:EC:BF:16:41:97:67:10:DC:DC:31:A1:71:7E",
                isRoot: true,
                owner: "cosmos1...",
                approvals: {} as any,
                rejects: {} as any,
                vid: 0xfff1,
                schemaVersion: 0,
            },
        ],
    },
};

// Mock GitHub responses
const mockGitHubFileList = [
    { name: "Chip-Test-PAA-NoVID-Cert.der", type: "file" },
    { name: "Chip-Test-PAA-FFF1-Cert.der", type: "file" },
    { name: "dcld_mirror_test.der", type: "file" }, // Should be filtered out
    { name: "README.md", type: "file" },
];

// Helper function to encode DER as PEM
function pemEncode(der: Bytes): string {
    const base64 = Bytes.toBase64(der);
    const lines: string[] = ["-----BEGIN CERTIFICATE-----"];
    for (let i = 0; i < base64.length; i += 64) {
        lines.push(base64.slice(i, i + 64));
    }
    lines.push("-----END CERTIFICATE-----");
    return lines.join("\n");
}

describe("DclCertificateService", () => {
    let fetchMock: MockFetch;
    let environment: Environment;
    let storage: StorageBackendMemory;
    let storageManager: StorageManager;

    beforeEach(async () => {
        fetchMock = new MockFetch();
        environment = new Environment("test");

        // Set up storage
        storage = new StorageBackendMemory();
        storageManager = new StorageManager(storage);
        await storageManager.initialize();

        // Create StorageService with a factory that returns the storage backend
        new StorageService(environment, (_namespace: string) => storage);

        // Default empty revocation response for all tests
        fetchMock.addResponse("/dcl/pki/revocation-points", {
            PkiRevocationDistributionPoint: [],
        });

        MockTime.reset();
    });

    afterEach(async () => {
        fetchMock.uninstall();
        await storageManager.close();
    });

    describe("initialization", () => {
        it("fetches production certificates from DCL", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const certs = service.certificates;
            expect(certs.length).to.equal(2);

            const cert1 = service.getCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");
            expect(cert1).to.not.be.undefined;
            expect(cert1?.subjectAsText).to.equal("CN=Matter Test PAA");
            expect(cert1?.isProduction).to.be.true;

            const cert2 = service.getCertificate("6AFD22771F511FECBF1641976710DCDC31A1717E");
            expect(cert2).to.not.be.undefined;
            expect(cert2?.vid).to.equal(0xfff1);
            expect(cert2?.isProduction).to.be.true;

            await service.close();
        });

        it("fetches test certificates when option is enabled", async () => {
            // MockFetch uses includes() and checks in reverse order, so be specific with hostnames

            // Production DCL (on.dcl.csa-iot.org)
            fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "on.dcl.csa-iot.org/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "on.dcl.csa-iot.org/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );

            // Test DCL (on.test-net.dcl.csa-iot.org) - empty list
            fetchMock.addResponse("on.test-net.dcl.csa-iot.org/dcl/pki/root-certificates", {
                approvedRootCertificates: {
                    schemaVersion: 0,
                    certs: [],
                },
            });

            // GitHub
            fetchMock.addResponse(
                "api.github.com/repos/project-chip/connectedhomeip/contents/credentials/development/paa-root-certs",
                mockGitHubFileList,
            );
            fetchMock.addResponse(
                "raw.githubusercontent.com/project-chip/connectedhomeip/master/credentials/development/paa-root-certs/Chip-Test-PAA-NoVID-Cert.der",
                TestCert_PAA_NoVID_Cert,
                { binary: true },
            );
            fetchMock.addResponse(
                "raw.githubusercontent.com/project-chip/connectedhomeip/master/credentials/development/paa-root-certs/Chip-Test-PAA-FFF1-Cert.der",
                TestCert_PAA_FFF1_Cert,
                { binary: true },
            );

            fetchMock.install();

            const service = new DclCertificateService(environment, { fetchTestCertificates: true });
            await service.construction;

            const certs = service.certificates;
            // Should have 2 from production DCL + 2 from GitHub
            expect(certs.length).to.be.greaterThan(0);

            await service.close();
        });

        it("skips test certificates when option is disabled", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const callLog = fetchMock.getCallLog();
            expect(callLog.some(call => call.url.includes("test-net.dcl"))).to.be.false;
            expect(callLog.some(call => call.url.includes("github"))).to.be.false;

            await service.close();
        });

        it("persists certificates to storage", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service1 = new DclCertificateService(environment);
            await service1.construction;
            await service1.close();

            // Create new service - mocks are still active so DCL fetching will work
            // but the certificates should already be in storage
            const service2 = new DclCertificateService(environment);
            await service2.construction;

            const certs = service2.certificates;
            expect(certs.length).to.equal(2);

            await service2.close();
        });

        it("doesn't duplicate certificates on re-initialization", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const initialCount = service.certificates.length;
            expect(initialCount).to.equal(2);

            // Trigger update by advancing time (timer will call #update)
            await MockTime.advance(24 * 60 * 60 * 1000); // Advance 1 day

            const afterUpdateCount = service.certificates.length;
            expect(afterUpdateCount).to.equal(2); // Should still be 2, not 4

            await service.close();
        });
    });

    describe("periodic updates", () => {
        it("starts periodic update timer with default interval", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const initialCallCount = fetchMock.getCallLog().length;

            // Advance time by 1 day
            await MockTime.advance(24 * 60 * 60 * 1000);

            // Should have made additional calls
            const afterTimerCallCount = fetchMock.getCallLog().length;
            expect(afterTimerCallCount).to.be.greaterThan(initialCallCount);

            await service.close();
        });

        it("uses custom update interval when provided", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment, { updateInterval: Minutes(5) });
            await service.construction;

            const initialCallCount = fetchMock.getCallLog().length;

            // Advance time by 5 minutes
            await MockTime.advance(5 * 60 * 1000);

            const afterTimerCallCount = fetchMock.getCallLog().length;
            expect(afterTimerCallCount).to.be.greaterThan(initialCallCount);

            await service.close();
        });

        it("stops updates after close()", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment, { updateInterval: Minutes.one });
            await service.construction;

            await service.close();
            const callCountAfterClose = fetchMock.getCallLog().length;

            // Advance time and verify no additional calls
            await MockTime.advance(60 * 1000);

            const finalCallCount = fetchMock.getCallLog().length;
            expect(finalCallCount).to.equal(callCountAfterClose);
        });
    });

    describe("error handling", () => {
        it("handles DCL fetch errors gracefully", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList, { status: 500 });
            fetchMock.install();

            const service = new DclCertificateService(environment);

            // Service should complete construction even if initial fetch fails (resilient design)
            await service.construction;

            // Should have 0 certificates due to fetch failure
            const certs = service.certificates;
            expect(certs.length).to.equal(0);

            await service.close();
        });

        it("continues processing after individual certificate fetch failure", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            // First cert fails
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                { error: "Not found" },
                { status: 404 },
            );
            // Second cert succeeds
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const certs = service.certificates;
            expect(certs.length).to.equal(1); // Only one cert should have been stored

            await service.close();
        });

        it("handles GitHub fetch errors gracefully when test certs enabled", async () => {
            // Production DCL (on.dcl.csa-iot.org)
            fetchMock.addResponse("on.dcl.csa-iot.org/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "on.dcl.csa-iot.org/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "on.dcl.csa-iot.org/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );

            // Test DCL (on.test-net.dcl.csa-iot.org) - empty
            fetchMock.addResponse("on.test-net.dcl.csa-iot.org/dcl/pki/root-certificates", {
                approvedRootCertificates: {
                    schemaVersion: 0,
                    certs: [],
                },
            });

            // GitHub - error
            fetchMock.addResponse(
                "api.github.com/repos/project-chip/connectedhomeip/contents/credentials/development/paa-root-certs",
                { error: "Rate limit exceeded" },
                { status: 429 },
            );
            fetchMock.install();

            const service = new DclCertificateService(environment, { fetchTestCertificates: true });
            await service.construction;

            // Should still have production certs despite GitHub failure
            const certs = service.certificates;
            expect(certs.length).to.equal(2);

            await service.close();
        });
    });

    describe("certificate retrieval", () => {
        beforeEach(async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();
        });

        it("retrieves certificate by subject key ID", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            const cert = service.getCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");
            expect(cert).to.not.be.undefined;
            expect(cert?.subjectKeyId).to.equal("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            await service.close();
        });

        it("returns undefined for non-existent certificate", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            const cert = service.getCertificate("NONEXISTENT");
            expect(cert).to.be.undefined;

            await service.close();
        });

        it("retrieves all certificates", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            const certs = service.certificates;
            expect(certs.length).to.equal(2);
            expect(certs.every(c => c.subjectKeyId && c.serialNumber)).to.be.true;

            await service.close();
        });

        it("retrieves certificate as PEM", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            const pem = await service.getCertificateAsPem("785CE705B86B8F4E6FC793AA60CB43EA696882D5");
            expect(pem).to.be.a("string");
            expect(pem).to.include("-----BEGIN CERTIFICATE-----");
            expect(pem).to.include("-----END CERTIFICATE-----");

            // Verify PEM format - should have base64 content between headers
            const lines = pem.split("\n");
            expect(lines.length).to.be.greaterThan(2);
            expect(lines[0]).to.equal("-----BEGIN CERTIFICATE-----");
            expect(lines[lines.length - 1]).to.equal("-----END CERTIFICATE-----");

            await service.close();
        });

        it("throws error for non-existent certificate when getting PEM", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            await expect(service.getCertificateAsPem("NONEXISTENT")).to.be.rejected;

            await service.close();
        });
    });

    describe("certificate deletion", () => {
        beforeEach(async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();
        });

        it("deletes certificate successfully", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            const countBefore = service.certificates.length;
            expect(countBefore).to.equal(2);

            await service.deleteCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            const countAfter = service.certificates.length;
            expect(countAfter).to.equal(1);

            // Verify the certificate is no longer retrievable
            const cert = service.getCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");
            expect(cert).to.be.undefined;

            await service.close();
        });

        it("throws error when deleting non-existent certificate", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            await expect(service.deleteCertificate("NONEXISTENT")).to.be.not.rejected;

            await service.close();
        });

        it("updates index after deletion", async () => {
            const service = new DclCertificateService(environment);
            await service.construction;

            await service.deleteCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");
            await service.close();

            // Reset and set up mocks for second service instance
            fetchMock.uninstall();
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [],
            });
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            // Create new service - should load updated index from storage first
            const service2 = new DclCertificateService(environment);
            await service2.construction;

            // After update, should have both certificates again (deleted one was re-fetched from DCL)
            const certs = service2.certificates;
            expect(certs.length).to.equal(2);

            await service2.close();
        });
    });

    describe("manual certificate update", () => {
        it("triggers certificate update manually", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const initialCallCount = fetchMock.getCallLog().length;

            // Manually trigger update
            await service.update();

            // Should have made additional DCL calls
            const afterUpdateCallCount = fetchMock.getCallLog().length;
            expect(afterUpdateCallCount).to.be.greaterThan(initialCallCount);

            await service.close();
        });

        it("force mode re-downloads and overwrites existing certificates", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const initialCallCount = fetchMock.getCallLog().length;
            const initialCertCount = service.certificates.length;
            expect(initialCertCount).to.equal(2);

            // Manually trigger update WITHOUT force - should check list but not re-fetch existing cert details
            await service.update(false);

            const afterNormalUpdateCallCount = fetchMock.getCallLog().length;
            // Should fetch root certificate list (1 call) + revocation points (1 call), not individual certificates
            expect(afterNormalUpdateCallCount).to.equal(initialCallCount + 2);

            // Now trigger update WITH force - should re-fetch everything including cert details
            await service.update(true);

            const afterForceUpdateCallCount = fetchMock.getCallLog().length;
            // Should have made 4 more calls: 1 for root list + 2 for certificate details + 1 for revocation points
            expect(afterForceUpdateCallCount).to.equal(afterNormalUpdateCallCount + 4);

            // Should still have same number of certificates (they were overwritten, not duplicated)
            const finalCertCount = service.certificates.length;
            expect(finalCertCount).to.equal(2);

            await service.close();
        });
    });

    describe("getOrFetchCertificate", () => {
        it("returns existing certificate from index", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Get existing certificate (should not make additional DCL calls)
            const initialCallCount = fetchMock.getCallLog().length;
            const cert = await service.getOrFetchCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            expect(cert).to.not.be.undefined;
            expect(cert?.subjectKeyId).to.equal("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            // Should not have made additional calls
            const afterCallCount = fetchMock.getCallLog().length;
            expect(afterCallCount).to.equal(initialCallCount);

            await service.close();
        });

        it("accepts subject key ID with colons", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Get certificate with colon format
            const cert = await service.getOrFetchCertificate(
                "78:5C:E7:05:B8:6B:8F:4E:6F:C7:93:AA:60:CB:43:EA:69:68:82:D5",
            );

            expect(cert).to.not.be.undefined;
            expect(cert?.subjectKeyId).to.equal("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            await service.close();
        });

        it("fetches certificate from DCL if not in index", async () => {
            // Set up mock for fetching new certificate
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment, { updateInterval: Days(365) }); // Disable auto-updates
            await service.construction;

            // Clear the index to simulate the certificate not being present
            const storage = await environment.get(StorageService).open("certificates");
            const approvedStorage = storage.createContext("approved");
            await approvedStorage.clear();

            // Reset mocks and install again for the fetch
            fetchMock.uninstall();
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [],
            });
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.install();

            // Fetch a certificate not in the index
            const cert = await service.getOrFetchCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            expect(cert).to.not.be.undefined;
            expect(cert?.subjectKeyId).to.equal("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            // Verify it's now in the index
            const certFromIndex = service.getCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");
            expect(certFromIndex).to.not.be.undefined;

            await service.close();
            await storage.close();
        });

        it("returns undefined for non-existent certificate", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", {
                approvedRootCertificates: {
                    schemaVersion: 0,
                    certs: [],
                },
            });
            fetchMock.install();

            const service = new DclCertificateService(environment, { updateInterval: Days(365) });
            await service.construction;

            const cert = await service.getOrFetchCertificate("NONEXISTENTCERTIFICATE");

            expect(cert).to.be.undefined;

            await service.close();
        });

        it("returns undefined on DCL error", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", { error: "Server error" }, { status: 500 });
            fetchMock.install();

            const service = new DclCertificateService(environment, { updateInterval: Days(365) });
            await service.construction;

            const cert = await service.getOrFetchCertificate("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            expect(cert).to.be.undefined;

            await service.close();
        });
    });

    describe("Bytes support for subject key IDs", () => {
        it("getCertificate accepts Bytes", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Convert hex string to Bytes
            const subjectKeyIdBytes = Bytes.fromHex("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            const cert = service.getCertificate(subjectKeyIdBytes);
            expect(cert).to.not.be.undefined;
            expect(cert?.subjectKeyId).to.equal("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            await service.close();
        });

        it("getCertificateAsPem accepts Bytes", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Convert hex string to Bytes
            const subjectKeyIdBytes = Bytes.fromHex("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            const pem = await service.getCertificateAsPem(subjectKeyIdBytes);
            expect(pem).to.be.a("string");
            expect(pem).to.include("-----BEGIN CERTIFICATE-----");
            expect(pem).to.include("-----END CERTIFICATE-----");

            await service.close();
        });

        it("getOrFetchCertificate accepts Bytes", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Convert hex string to Bytes
            const subjectKeyIdBytes = Bytes.fromHex("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            const cert = await service.getOrFetchCertificate(subjectKeyIdBytes);
            expect(cert).to.not.be.undefined;
            expect(cert?.subjectKeyId).to.equal("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            await service.close();
        });

        it("deleteCertificate accepts Bytes", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const countBefore = service.certificates.length;
            expect(countBefore).to.equal(2);

            // Convert hex string to Bytes
            const subjectKeyIdBytes = Bytes.fromHex("785CE705B86B8F4E6FC793AA60CB43EA696882D5");

            await service.deleteCertificate(subjectKeyIdBytes);

            const countAfter = service.certificates.length;
            expect(countAfter).to.equal(1);

            await service.close();
        });
    });

    describe("revocation support", () => {
        /**
         * Build a minimal DER-encoded CRL containing specified revoked serial numbers.
         * This creates a valid-enough CRL structure for the parser to extract serial numbers from.
         */
        function buildTestCrl(revokedSerialHexes: string[]): Uint8Array {
            // Build revokedCertificates entries: each is SEQUENCE { INTEGER serial, UTCTime date }
            const revokedEntries: Record<string, any> = {};
            for (let i = 0; i < revokedSerialHexes.length; i++) {
                revokedEntries[`entry${i}`] = {
                    serial: {
                        _tag: DerType.Integer,
                        _bytes: Bytes.fromHex(revokedSerialHexes[i]),
                    },
                    revocationDate: {
                        _tag: DerType.UtcDate,
                        _bytes: Bytes.fromString("250101000000Z"),
                    },
                } as any;
            }

            // ecdsaWithSHA256 OID as a sequence containing OID
            const signatureAlgorithm = {
                _objectId: ObjectId("2a8648ce3d040302"), // ecdsaWithSHA256
            };

            // Build tbsCertList
            const tbsCertList: Record<string, any> = {
                version: {
                    _tag: DerType.Integer,
                    _bytes: Uint8Array.of(1), // v2
                },
                signature: signatureAlgorithm,
                issuer: {
                    cn: ["Test Issuer"],
                },
                thisUpdate: {
                    _tag: DerType.UtcDate,
                    _bytes: Bytes.fromString("250101000000Z"),
                },
                nextUpdate: {
                    _tag: DerType.UtcDate,
                    _bytes: Bytes.fromString("260101000000Z"),
                },
            };

            // Only add revokedCertificates if there are entries
            if (revokedSerialHexes.length > 0) {
                tbsCertList.revokedCertificates = revokedEntries;
            }

            // Build CertificateList
            const certificateList: any = {
                tbsCertList,
                signatureAlgorithm,
                signatureValue: {
                    _tag: DerType.BitString,
                    _bytes: new Uint8Array(32), // dummy signature
                    _padding: 0,
                },
            };

            return Bytes.of(DerCodec.encode(certificateList));
        }

        it("parseCrlRevokedSerials extracts serial numbers from CRL", () => {
            const crl = buildTestCrl(["01AB", "02CD", "FF00FF"]);
            const serials = DclCertificateService.parseCrlRevokedSerials(crl);

            expect(serials.size).to.equal(3);
            expect(serials.has("01AB")).to.be.true;
            expect(serials.has("02CD")).to.be.true;
            expect(serials.has("FF00FF")).to.be.true;
        });

        it("parseCrlRevokedSerials returns empty set for CRL with no revoked entries", () => {
            const crl = buildTestCrl([]);
            const serials = DclCertificateService.parseCrlRevokedSerials(crl);

            expect(serials.size).to.equal(0);
        });

        it("isRevoked returns false when no revocation data exists", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // No revocation data has been fetched for this issuer, should return false
            const result = service.isRevoked("AABBCCDD", "01AB");
            expect(result).to.be.false;

            await service.close();
        });

        it("isRevoked returns false for non-revoked serial when data exists", async () => {
            // Mock revocation distribution points with a CRL
            const testCrl = buildTestCrl(["0123456789ABCDEF"]);
            const issuerSkid = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01";

            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: true,
                        label: "test-label",
                        crlSignerDelegator: "",
                        crlSignerCertificate: "test-cert",
                        issuerSubjectKeyID: issuerSkid,
                        dataURL: "https://example.com/test.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
            });
            fetchMock.addResponse("https://example.com/test.crl", testCrl, { binary: true });
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            const normalizedSkid = issuerSkid.replace(/:/g, "").toUpperCase();

            // This serial IS revoked
            expect(service.isRevoked(normalizedSkid, "0123456789ABCDEF")).to.be.true;

            // This serial is NOT revoked
            expect(service.isRevoked(normalizedSkid, "FEDCBA9876543210")).to.be.false;

            await service.close();
        });

        it("revocation data persists and loads on restart", async () => {
            const testCrl = buildTestCrl(["AABB"]);
            const issuerSkid = "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44";

            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: true,
                        label: "test-label",
                        crlSignerDelegator: "",
                        crlSignerCertificate: "test-cert",
                        issuerSubjectKeyID: issuerSkid,
                        dataURL: "https://example.com/persist-test.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
            });
            fetchMock.addResponse("https://example.com/persist-test.crl", testCrl, { binary: true });
            fetchMock.install();

            const normalizedSkid = issuerSkid.replace(/:/g, "").toUpperCase();

            // First instance: fetch and store revocation data
            const service1 = new DclCertificateService(environment);
            await service1.construction;

            expect(service1.isRevoked(normalizedSkid, "AABB")).to.be.true;
            await service1.close();

            // Second instance: should load revocation data from storage
            const service2 = new DclCertificateService(environment);
            await service2.construction;

            // Revocation data should persist across restarts
            expect(service2.isRevoked(normalizedSkid, "AABB")).to.be.true;
            expect(service2.isRevoked(normalizedSkid, "CCDD")).to.be.false;

            await service2.close();
        });

        it("isRevoked accepts Bytes for authority key identifier and serial number", async () => {
            const testCrl = buildTestCrl(["01AB"]);
            const issuerSkid = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD";

            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: true,
                        label: "test-label",
                        crlSignerDelegator: "",
                        crlSignerCertificate: "test-cert",
                        issuerSubjectKeyID: issuerSkid,
                        dataURL: "https://example.com/bytes-test.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
            });
            fetchMock.addResponse("https://example.com/bytes-test.crl", testCrl, { binary: true });
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Use Bytes for both arguments
            const akidBytes = Bytes.fromHex("AABBCCDDEEFF00112233445566778899AABBCCDD");
            const serialBytes = Bytes.fromHex("01AB");

            expect(service.isRevoked(akidBytes, serialBytes)).to.be.true;
            expect(service.isRevoked(akidBytes, Bytes.fromHex("FFFF"))).to.be.false;

            await service.close();
        });

        it("skips non-CRL revocation types", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            // Revocation point with revocationType !== 1 (not CRL)
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: true,
                        label: "test-label",
                        crlSignerDelegator: "",
                        crlSignerCertificate: "test-cert",
                        issuerSubjectKeyID: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD",
                        dataURL: "https://example.com/should-not-be-fetched.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 2, // Not CRL
                        schemaVersion: 0,
                    },
                ],
            });
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Should not have fetched the CRL (non-CRL type was skipped)
            const callLog = fetchMock.getCallLog();
            expect(callLog.some(call => call.url.includes("should-not-be-fetched"))).to.be.false;

            // No revocation data should exist
            expect(service.isRevoked("AABBCCDDEEFF00112233445566778899AABBCCDD", "01AB")).to.be.false;

            await service.close();
        });

        it("handles CRL fetch failure gracefully", async () => {
            fetchMock.addResponse("/dcl/pki/root-certificates", mockDclRootCertificateList);
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAxGDAWBgNVBAMMD01hdHRlciBUZXN0IFBBQQ%3D%3D/78%3A5C%3AE7%3A05%3AB8%3A6B%3A8F%3A4E%3A6F%3AC7%3A93%3AAA%3A60%3ACB%3A43%3AEA%3A69%3A68%3A82%3AD5",
                mockDclCertificateNoVID,
            );
            fetchMock.addResponse(
                "/dcl/pki/certificates/MDAEFjAUBgorBgEEAYKefAIBDARGRkYx/6A%3AFD%3A22%3A77%3A1F%3A51%3A1F%3AEC%3ABF%3A16%3A41%3A97%3A67%3A10%3ADC%3ADC%3A31%3AA1%3A71%3A7E",
                mockDclCertificateFFF1,
            );
            // Revocation point with a CRL URL that returns 404
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: true,
                        label: "test-label",
                        crlSignerDelegator: "",
                        crlSignerCertificate: "test-cert",
                        issuerSubjectKeyID: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD",
                        dataURL: "https://example.com/broken.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
            });
            fetchMock.addResponse("https://example.com/broken.crl", { error: "Not found" }, { status: 404 });
            fetchMock.install();

            const service = new DclCertificateService(environment);
            await service.construction;

            // Service should still work despite CRL fetch failure
            expect(service.certificates.length).to.equal(2);
            expect(service.isRevoked("AABBCCDDEEFF00112233445566778899AABBCCDD", "01AB")).to.be.false;

            await service.close();
        });
    });
});
