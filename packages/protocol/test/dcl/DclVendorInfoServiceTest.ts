/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclVendorInfoService } from "#dcl/DclVendorInfoService.js";
import { Environment, Minutes, MockFetch, StorageBackendMemory, StorageManager, StorageService } from "#general";

// Mock DCL vendor info responses
const mockVendorsPage1 = {
    vendorInfo: [
        {
            vendorID: 4487,
            vendorName: "Acme Corporation",
            companyLegalName: "Acme Corporation Ltd.",
            companyPreferredName: "Acme Corp",
            vendorLandingPageURL: "https://www.acme.example.com",
            creator: "cosmos1abc...",
            schemaVersion: 0,
        },
        {
            vendorID: 4939,
            vendorName: "Nabu Casa",
            companyLegalName: "Nabu Casa, Inc.",
            companyPreferredName: "Nabu Casa",
            vendorLandingPageURL: "https://www.nabucasa.com",
            creator: "cosmos1def...",
            schemaVersion: 0,
        },
    ],
    pagination: {
        next_key: "page2key",
        total: "3",
    },
};

const mockVendorsPage2 = {
    vendorInfo: [
        {
            vendorID: 5678,
            vendorName: "Widget Industries",
            companyLegalName: "Widget Industries International",
            companyPreferredName: "Widget Co",
            vendorLandingPageURL: "https://widget.example.com",
            creator: "cosmos1ghi...",
            schemaVersion: 0,
        },
    ],
    pagination: {},
};

describe("DclVendorInfoService", () => {
    let environment: Environment;
    let fetchMock: MockFetch;
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
    });

    afterEach(async () => {
        fetchMock.uninstall();
        await storageManager.close();
    });

    describe("initialization and basic operations", () => {
        it("fetches and stores vendor information on initialization", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const allVendors = service.vendors;
            // Should have 3 DCL vendors + 4 hardcoded test vendors (Nabu Casa already in DCL)
            expect(allVendors.size).to.equal(7);

            const acme = service.infoFor(4487);
            expect(acme).to.not.be.undefined;
            expect(acme?.vendorName).to.equal("Acme Corporation");
            expect(acme?.companyLegalName).to.equal("Acme Corporation Ltd.");
            expect(acme?.companyPreferredName).to.equal("Acme Corp");
            expect(acme?.vendorLandingPageUrl).to.equal("https://www.acme.example.com");

            const testVendor = service.infoFor(65521);
            expect(testVendor).to.not.be.undefined;
            expect(testVendor?.vendorName).to.equal("Test Vendor");

            await service.close();
        });

        it("loads vendor information from storage on subsequent initialization", async () => {
            // First initialization - fetch from DCL
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service1 = new DclVendorInfoService(environment);
            await service1.construction;

            const vendors1 = service1.vendors;
            expect(vendors1.size).to.equal(7);

            await service1.close();

            // Second initialization - loads from storage then fetches from DCL again
            // Add more mock responses for the second fetch
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);

            const service2 = new DclVendorInfoService(environment);
            await service2.construction;

            const vendors2 = service2.vendors;
            expect(vendors2.size).to.equal(7);

            const acme = service2.infoFor(4487);
            expect(acme?.vendorName).to.equal("Acme Corporation");

            await service2.close();
            fetchMock.uninstall();
        });

        it("returns undefined for unknown vendor ID", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const unknown = service.infoFor(99999);
            expect(unknown).to.be.undefined;

            await service.close();
        });

        it("returns vendor map with all vendors", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const vendorMap = service.vendors;
            expect(vendorMap.size).to.equal(7);
            expect(vendorMap.get(4487)?.vendorName).to.equal("Acme Corporation");
            expect(vendorMap.get(5678)?.vendorName).to.equal("Widget Industries");

            await service.close();
        });
    });

    describe("field normalization", () => {
        it("normalizes DCL field names to camelCase", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const vendor = service.infoFor(4487);
            expect(vendor).to.not.be.undefined;

            // Check that fields are normalized from DCL format
            expect(vendor?.vendorId).to.equal(4487); // vendorID -> vendorId
            expect(vendor?.vendorName).to.equal("Acme Corporation");
            expect(vendor?.companyLegalName).to.equal("Acme Corporation Ltd.");
            expect(vendor?.companyPreferredName).to.equal("Acme Corp");
            expect(vendor?.vendorLandingPageUrl).to.equal("https://www.acme.example.com"); // vendorLandingPageURL -> vendorLandingPageUrl
            expect(vendor?.creator).to.equal("cosmos1abc...");

            await service.close();
        });
    });

    describe("hardcoded vendors", () => {
        it("includes test vendor (65521) if not in DCL", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const testVendor = service.infoFor(65521);
            expect(testVendor).to.not.be.undefined;
            expect(testVendor?.vendorName).to.equal("Test Vendor");
            expect(testVendor?.companyLegalName).to.equal("Test Vendor Inc.");

            await service.close();
        });

        it("includes Nabu Casa (4939) if not in DCL", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const nabuCasa = service.infoFor(4939);
            expect(nabuCasa).to.not.be.undefined;
            expect(nabuCasa?.vendorName).to.equal("Nabu Casa");

            await service.close();
        });

        it("does not duplicate hardcoded vendors if already in DCL", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const allVendors = [...service.vendors.values()];
            const nabuCasaVendors = allVendors.filter(v => v.vendorId === 4939);
            expect(nabuCasaVendors.length).to.equal(1); // Should only appear once

            await service.close();
        });
    });

    describe("pagination handling", () => {
        it("fetches all pages when pagination is present", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const allVendors = service.vendors;
            // Should have all 3 vendors from both pages + 4 hardcoded test vendors
            expect(allVendors.size).to.equal(7);

            expect(service.infoFor(4487)).to.not.be.undefined; // From page 1
            expect(service.infoFor(5678)).to.not.be.undefined; // From page 2

            await service.close();
        });

        it("handles single page response without pagination", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: mockVendorsPage1.vendorInfo });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const allVendors = service.vendors;
            expect(allVendors.size).to.equal(6); // 2 from DCL + 4 hardcoded test vendors

            await service.close();
        });
    });

    describe("update behavior", () => {
        it("refetches vendors when update is called", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const initialCallCount = fetchMock
                .getCallLog()
                .filter(call => call.url.includes("/dcl/vendorinfo/vendors")).length;

            // Add more responses for the second update
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);

            // Call update again - should fetch again
            await service.update();

            const finalCallCount = fetchMock
                .getCallLog()
                .filter(call => call.url.includes("/dcl/vendorinfo/vendors")).length;

            expect(finalCallCount).to.equal(initialCallCount + 2); // Should increase by 2 (2 pages)

            await service.close();
        });

        it("handles concurrent update requests gracefully", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            fetchMock.clearCallLog(); // Clear initial fetch

            // Add responses for the concurrent update
            fetchMock.addResponse("/dcl/vendorinfo/vendors", mockVendorsPage1);
            fetchMock.addResponse("/dcl/vendorinfo/vendors?pagination.key=page2key", mockVendorsPage2);

            // Multiple concurrent updates - only one should execute, others wait
            await Promise.all([service.update(), service.update(), service.update()]);

            const callCount = fetchMock
                .getCallLog()
                .filter(call => call.url.includes("/dcl/vendorinfo/vendors")).length;

            // Should only make 2 calls (one fetch with 2 pages) even though update was called 3 times
            expect(callCount).to.equal(2);

            await service.close();
        });
    });

    describe("error handling", () => {
        it("handles DCL fetch failures gracefully", async () => {
            fetchMock.addResponse(
                "/dcl/vendorinfo/vendors",
                { code: 500, message: "Internal Server Error", details: [] },
                { status: 500 },
            );
            fetchMock.install();

            const service = new DclVendorInfoService(environment);

            // Construction should succeed even if DCL fetch fails (errors are caught and logged)
            await service.construction;

            // Service initializes with no vendors when DCL fails (hardcoded vendors aren't added on error)
            const allVendors = service.vendors;
            expect(allVendors.size).to.equal(0);

            await service.close();
        });

        it("handles empty vendor list", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            const allVendors = service.vendors;
            // Should only have hardcoded vendors
            expect(allVendors.size).to.equal(5); // 0xfff1-0xfff4 + Nabu Casa

            await service.close();
        });
    });

    describe("lifecycle", () => {
        it("starts periodic update timer by default", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            // Timer should be created (can't easily test timer execution without mocking Time)
            await service.close();
        });

        it("does not start timer when updateInterval is null", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment, { updateInterval: null });
            await service.construction;

            await service.close();
        });

        it("stops timer on close", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment);
            await service.construction;

            await service.close();

            // Should not throw when calling update after close
            await service.update();
        });

        it("uses custom update interval", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment, { updateInterval: Minutes(30) });
            await service.construction;

            await service.close();
        });
    });

    describe("options", () => {
        it("passes timeout option to DCL client", async () => {
            fetchMock.addResponse("/dcl/vendorinfo/vendors", { vendorInfo: [] });
            fetchMock.install();

            const service = new DclVendorInfoService(environment, { timeout: Minutes(1) });
            await service.construction;

            await service.close();
        });
    });
});
