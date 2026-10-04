/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclClient, MatterDclError, MatterDclResponseError } from "#dcl/DclClient.js";
import { DclConfig } from "#dcl/DclConfig.js";
import { DclDeviceSoftwareVersionModelRaw } from "#dcl/DclRestApiTypes.js";
import { MockFetch } from "@matter/general";
import { VendorId } from "@matter/types";

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
                        certs: [
                            {
                                pemCert: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
                                schemaVersion: 0,
                            },
                        ],
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

    describe("fetchModelVersionByVidPidSoftwareVersion", () => {
        function modelVersion(overrides: Partial<DclDeviceSoftwareVersionModelRaw>): {
            modelVersion: DclDeviceSoftwareVersionModelRaw;
        } {
            return {
                modelVersion: {
                    vid: VendorId(0xfff1),
                    pid: 0x8000,
                    softwareVersion: 6,
                    softwareVersionString: "6.0",
                    cdVersionNumber: 1,
                    creator: "cosmos1test",
                    firmwareInformation: "",
                    softwareVersionValid: true,
                    otaUrl: "",
                    otaFileSize: "0",
                    otaChecksum: "",
                    otaChecksumType: 0,
                    minApplicableSoftwareVersion: 0,
                    maxApplicableSoftwareVersion: 5,
                    releaseNotesUrl: "",
                    specificationVersion: 0,
                    schemaVersion: 0,
                    ...overrides,
                },
            };
        }

        it("converts the file size and keeps set OTA fields", async () => {
            fetchMock.addResponse(
                "/dcl/model/versions/65521/32768/6",
                modelVersion({
                    otaUrl: "https://example.com/ota.bin",
                    otaFileSize: "100",
                    otaChecksum: "abc=",
                    otaChecksumType: 1,
                    releaseNotesUrl: "https://example.com/notes",
                    specificationVersion: 0x01040200,
                }),
            );
            fetchMock.install();

            const version = await new DclClient().fetchModelVersionByVidPidSoftwareVersion(0xfff1, 0x8000, 6);

            expect(version.otaFileSize).to.equal(100n);
            expect(version.otaUrl).to.equal("https://example.com/ota.bin");
            expect(version.otaChecksum).to.equal("abc=");
            expect(version.otaChecksumType).to.equal(1);
            expect(version.releaseNotesUrl).to.equal("https://example.com/notes");
            expect(version.specificationVersion).to.equal(0x01040200);
        });

        it("returns fields the DCL sends empty as undefined", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768/6", modelVersion({}));
            fetchMock.install();

            const version = await new DclClient().fetchModelVersionByVidPidSoftwareVersion(0xfff1, 0x8000, 6);

            expect(version.otaFileSize).to.be.undefined;
            expect(version.otaUrl).to.be.undefined;
            expect(version.otaChecksum).to.be.undefined;
            expect(version.otaChecksumType).to.be.undefined;
            expect(version.releaseNotesUrl).to.be.undefined;
            expect(version.firmwareInformation).to.be.undefined;
            expect(version.specificationVersion).to.be.undefined;
        });

        it("ignores a file size that is not a decimal number", async () => {
            fetchMock.addResponse("/dcl/model/versions/65521/32768/6", modelVersion({ otaFileSize: "12ab" }));
            fetchMock.install();

            const version = await new DclClient().fetchModelVersionByVidPidSoftwareVersion(0xfff1, 0x8000, 6);

            expect(version.otaFileSize).to.be.undefined;
        });
    });

    describe("fetchComplianceInfo", () => {
        const record = {
            vid: 0xfff1,
            pid: 0x8000,
            softwareVersion: 6,
            certificationType: "matter",
            specificationVersion: 0x01040200,
            history: [],
            schemaVersion: 1,
        };

        it("returns the compliance record", async () => {
            fetchMock.addResponse("/dcl/compliance/compliance-info/65521/32768/6/matter", { complianceInfo: record });
            fetchMock.install();

            const info = await new DclClient().fetchComplianceInfo(0xfff1, 0x8000, 6, "matter");

            expect(info.specificationVersion).to.equal(0x01040200);
        });

        const mismatches: Array<[keyof typeof record, number | string]> = [
            ["vid", 0xfff2],
            ["pid", 0x8001],
            ["softwareVersion", 7],
            ["certificationType", "zigbee"],
        ];
        for (const [field, value] of mismatches) {
            it(`rejects a record with a different ${field}`, async () => {
                fetchMock.addResponse("/dcl/compliance/compliance-info/65521/32768/6/matter", {
                    complianceInfo: { ...record, [field]: value },
                });
                fetchMock.install();

                await expect(new DclClient().fetchComplianceInfo(0xfff1, 0x8000, 6, "matter")).to.be.rejectedWith(
                    MatterDclError,
                    "Compliance info not found",
                );
            });
        }

        it("rejects a record with an unsupported schema version", async () => {
            fetchMock.addResponse("/dcl/compliance/compliance-info/65521/32768/6/matter", {
                complianceInfo: { ...record, schemaVersion: 2 },
            });
            fetchMock.install();

            await expect(new DclClient().fetchComplianceInfo(0xfff1, 0x8000, 6, "matter")).to.be.rejectedWith(
                MatterDclError,
                "Unsupported DCL compliance info schema version 2",
            );
        });
    });

    describe("records with unset optional fields", () => {
        it("returns empty vendor fields as undefined and skips unsupported schema versions", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", {
                vendorInfo: [
                    {
                        vendorID: 1,
                        vendorName: "Vendor1",
                        companyLegalName: "Vendor One Inc.",
                        companyPreferredName: "",
                        vendorLandingPageURL: "",
                        creator: "cosmos1test",
                        schemaVersion: 0,
                    },
                    { vendorID: 2, vendorName: "Vendor2", schemaVersion: 1 },
                ],
                pagination: {},
            });
            fetchMock.install();

            const vendors = await new DclClient().fetchAllVendors();

            expect(vendors.map(({ vendorID }) => vendorID)).to.deep.equal([1]);
            expect(vendors[0].companyPreferredName).to.be.undefined;
            expect(vendors[0].vendorLandingPageURL).to.be.undefined;
        });

        it("returns empty certificate fields as undefined and skips unsupported schema versions", async () => {
            const cert = {
                pemCert: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
                serialNumber: "1",
                issuer: "",
                authorityKeyId: "",
                rootSubject: "",
                rootSubjectKeyId: "",
                isRoot: true,
                owner: "cosmos1test",
                subject: "MB8x",
                subjectAsText: "CN=Test PAA",
                subjectKeyId: "AA:BB",
                approvals: [],
                rejects: [],
                vid: 0xfff1,
                certificateType: "DeviceAttestationPKI",
                schemaVersion: 0,
            };
            fetchMock.addResponse("/dcl/pki/all-certificates?subjectKeyId=AA%3ABB", {
                certificates: [
                    {
                        subject: "MB8x",
                        subjectKeyId: "AA:BB",
                        certs: [cert, { ...cert, schemaVersion: 1 }],
                        schemaVersion: 0,
                    },
                    { subject: "MB8y", subjectKeyId: "AA:BB", certs: [cert], schemaVersion: 1 },
                ],
            });
            fetchMock.install();

            const certs = await new DclClient().fetchCertificatesBySubjectKeyId("AABB");

            expect(certs).to.have.length(1);
            expect(certs[0].issuer).to.be.undefined;
            expect(certs[0].authorityKeyId).to.be.undefined;
            expect(certs[0].rootSubject).to.be.undefined;
            expect(certs[0].rootSubjectKeyId).to.be.undefined;
        });

        it("skips root certificates with an unsupported schema version", async () => {
            fetchMock.addResponse("/dcl/pki/certificates/MB8x/AA%3ABB", {
                approvedCertificates: {
                    subject: "MB8x",
                    subjectKeyId: "AA:BB",
                    certs: [
                        { pemCert: "cert0", issuer: "", schemaVersion: 0 },
                        { pemCert: "cert1", issuer: "", schemaVersion: 1 },
                    ],
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const certs = await new DclClient().fetchRootCertificateBySubject({
                subject: "MB8x",
                subjectKeyId: "AA:BB",
            });

            expect(certs.map(({ pemCert }) => pemCert)).to.deep.equal(["cert0"]);
            expect(certs[0].issuer).to.be.undefined;
        });

        it("returns empty model fields as undefined and keeps revisions only with their URL", async () => {
            fetchMock.addResponse("/dcl/model/models/65521/32768", {
                model: {
                    vid: 0xfff1,
                    pid: 0x8000,
                    deviceTypeId: 22,
                    productName: "Test Product",
                    productLabel: "Label",
                    partNumber: "P1",
                    commissioningCustomFlow: 0,
                    commissioningCustomFlowUrl: "",
                    commissioningModeInitialStepsHint: 1,
                    commissioningModeInitialStepsInstruction: "",
                    commissioningModeSecondaryStepsHint: 4,
                    commissioningModeSecondaryStepsInstruction: "",
                    commissioningFallbackUrl: "",
                    discoveryCapabilitiesBitmask: 4,
                    userManualUrl: "",
                    supportUrl: "https://example.com/support",
                    productUrl: "",
                    lsfUrl: "https://example.com/lsf.json",
                    lsfRevision: 2,
                    enhancedSetupFlowOptions: 0,
                    enhancedSetupFlowTCUrl: "",
                    enhancedSetupFlowTCRevision: 3,
                    enhancedSetupFlowTCDigest: "",
                    enhancedSetupFlowTCFileSize: 10,
                    maintenanceUrl: "",
                    icdUserActiveModeTriggerHint: 0,
                    icdUserActiveModeTriggerInstruction: "",
                    factoryResetStepsHint: 0,
                    factoryResetStepsInstruction: "",
                    creator: "cosmos1test",
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const model = await new DclClient().fetchModelByVidPid(0xfff1, 0x8000);

            expect(model.supportUrl).to.equal("https://example.com/support");
            expect(model.lsfUrl).to.equal("https://example.com/lsf.json");
            expect(model.lsfRevision).to.equal(2);
            expect(model.userManualUrl).to.be.undefined;
            expect(model.commissioningCustomFlowUrl).to.be.undefined;
            expect(model.commissioningModeInitialStepsInstruction).to.be.undefined;
            expect(model.maintenanceUrl).to.be.undefined;
            expect(model.enhancedSetupFlowTCUrl).to.be.undefined;
            expect(model.enhancedSetupFlowTCRevision).to.be.undefined;
            expect(model.enhancedSetupFlowTCFileSize).to.be.undefined;
            expect(model.discoveryCapabilitiesBitmask).to.equal(4);
        });

        it("keeps Terms and Conditions details when their URL is set", async () => {
            fetchMock.addResponse("/dcl/model/models/65521/32768", {
                model: {
                    vid: 0xfff1,
                    pid: 0x8000,
                    deviceTypeId: 22,
                    productName: "Test Product",
                    productLabel: "Label",
                    partNumber: "P1",
                    commissioningCustomFlow: 0,
                    commissioningCustomFlowUrl: "",
                    commissioningModeInitialStepsHint: 1,
                    commissioningModeInitialStepsInstruction: "",
                    commissioningModeSecondaryStepsHint: 4,
                    commissioningModeSecondaryStepsInstruction: "",
                    commissioningFallbackUrl: "",
                    discoveryCapabilitiesBitmask: 4,
                    userManualUrl: "",
                    supportUrl: "",
                    productUrl: "",
                    lsfUrl: "",
                    lsfRevision: 0,
                    enhancedSetupFlowOptions: 1,
                    enhancedSetupFlowTCUrl: "https://example.com/tc.json",
                    enhancedSetupFlowTCRevision: 3,
                    enhancedSetupFlowTCDigest: "abc=",
                    enhancedSetupFlowTCFileSize: 10,
                    maintenanceUrl: "https://example.com/maintenance",
                    icdUserActiveModeTriggerHint: 0,
                    icdUserActiveModeTriggerInstruction: "",
                    factoryResetStepsHint: 0,
                    factoryResetStepsInstruction: "",
                    creator: "cosmos1test",
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const model = await new DclClient().fetchModelByVidPid(0xfff1, 0x8000);

            expect(model.enhancedSetupFlowTCUrl).to.equal("https://example.com/tc.json");
            expect(model.enhancedSetupFlowTCRevision).to.equal(3);
            expect(model.enhancedSetupFlowTCDigest).to.equal("abc=");
            expect(model.enhancedSetupFlowTCFileSize).to.equal(10);
            expect(model.lsfRevision).to.be.undefined;
            expect(model.icdUserActiveModeTriggerInstruction).to.be.undefined;
            expect(model.factoryResetStepsInstruction).to.be.undefined;
        });

        it("returns empty compliance fields as undefined", async () => {
            fetchMock.addResponse("/dcl/compliance/compliance-info/65521/32768/6/matter", {
                complianceInfo: {
                    vid: 0xfff1,
                    pid: 0x8000,
                    softwareVersion: 6,
                    certificationType: "matter",
                    certificationRoute: "",
                    reason: "",
                    transport: "",
                    compliantPlatformUsed: "",
                    compliantPlatformVersion: "",
                    certificationIdOfSoftwareComponent: "",
                    OSVersion: "",
                    familyId: "",
                    programType: "endProduct",
                    programTypeVersion: "",
                    parentChild: "",
                    supportedClusters: "",
                    history: [
                        {
                            softwareVersionCertificationStatus: 2,
                            date: "2025-01-01T00:00:00Z",
                            reason: "",
                            cDVersionNumber: 1,
                            schemaVersion: 0,
                        },
                    ],
                    specificationVersion: 0,
                    schemaVersion: 0,
                },
            });
            fetchMock.install();

            const info = await new DclClient().fetchComplianceInfo(0xfff1, 0x8000, 6, "matter");

            expect(info.transport).to.be.undefined;
            expect(info.specificationVersion).to.be.undefined;
            expect(info.supportedClusters).to.be.undefined;
            expect(info.programTypeVersion).to.be.undefined;
            expect(info.parentChild).to.be.undefined;
            for (const deprecated of [
                "compliantPlatformUsed",
                "compliantPlatformVersion",
                "certificationIdOfSoftwareComponent",
                "OSVersion",
            ]) {
                expect(info).to.not.have.property(deprecated);
            }
            expect(info.programType).to.equal("endProduct");
            expect(info.reason).to.be.undefined;
            expect(info.certificationRoute).to.be.undefined;
            expect(info.familyId).to.be.undefined;
            expect(info.history[0].reason).to.be.undefined;
        });
    });

    describe("fetchAllVendors", () => {
        it("handles pagination correctly", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", {
                vendorInfo: [
                    { vendorID: 1, vendorName: "Vendor1", schemaVersion: 0 },
                    { vendorID: 2, vendorName: "Vendor2", schemaVersion: 0 },
                ],
                pagination: { next_key: "page2" },
            });
            fetchMock.addResponse("pagination.key=page2", {
                vendorInfo: [{ vendorID: 3, vendorName: "Vendor3", schemaVersion: 0 }],
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
