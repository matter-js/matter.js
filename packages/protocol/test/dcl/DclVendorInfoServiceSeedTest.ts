/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclVendorInfoService } from "#dcl/DclVendorInfoService.js";
import type { SeedSource, VendorEntry } from "#dcl/SeedTypes.js";
import { Environment, MockFetch, MockStorageService } from "@matter/general";

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

function makeSeedSource<T>(items: T[], expectedCount = items.length): SeedSource<T> {
    return { builtAt: "2026-05-13T02:00:00Z", expectedCount, entries: makeAsyncIterable(items) };
}

const VENDOR_1: VendorEntry = {
    vendorId: 0x1234,
    vendorName: "Acme Corp",
    companyLegalName: "Acme Corporation Ltd.",
    companyPreferredName: "Acme",
    vendorLandingPageURL: "https://acme.example.com",
    creator: "System",
    kind: "production",
};

// DCL response format for vendor 0x1234 (survives update() full-replace)
const DCL_WITH_VENDOR_1 = {
    vendorInfo: [
        {
            vendorID: 0x1234,
            vendorName: "Acme Corp",
            companyLegalName: "Acme Corporation Ltd.",
            companyPreferredName: "Acme",
            vendorLandingPageURL: "https://acme.example.com",
            creator: "System",
            schemaVersion: 0,
        },
    ],
    pagination: {},
};

const DCL_EMPTY = { vendorInfo: [], pagination: {} };

describe("DclVendorInfoService seed", () => {
    let fetchMock: MockFetch;
    let environment: Environment;

    beforeEach(() => {
        fetchMock = new MockFetch();
        environment = new Environment("test");
        new MockStorageService(environment);
    });

    afterEach(async () => {
        fetchMock.uninstall();
    });

    it("applies seed when storage is smaller than expectedCount", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/vendorinfo/vendors", DCL_WITH_VENDOR_1);
        fetchMock.install();

        const service = new DclVendorInfoService(environment, {
            seed: { vendors: makeSeedSource([VENDOR_1], 2) },
            updateInterval: null,
        });
        await service.construction;

        const v = service.infoFor(0x1234);
        expect(v).to.not.be.undefined;
        expect(v!.vendorName).to.equal("Acme Corp");
        expect(v!.companyLegalName).to.equal("Acme Corporation Ltd.");
        expect(v!.vendorLandingPageUrl).to.equal("https://acme.example.com"); // camel-case url

        await service.close();
    });

    it("skips seed when storage has more vendors than expectedCount", async () => {
        // Pre-populate storage via first service (gets 5 hardcoded + vendor 0xaaaa)
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/vendorinfo/vendors", {
            vendorInfo: [
                {
                    vendorID: 0xaaaa,
                    vendorName: "Existing Vendor",
                    companyLegalName: "Existing Corp",
                    companyPreferredName: "Existing",
                    vendorLandingPageURL: "https://existing.example.com",
                    creator: "System",
                    schemaVersion: 0,
                },
            ],
            pagination: {},
        });
        fetchMock.install();

        const svc1 = new DclVendorInfoService(environment, { updateInterval: null });
        await svc1.construction;
        const storedCount = svc1.vendors.size; // 6 (5 hardcoded + 0xaaaa)
        await svc1.close();

        // Second service: seed expectedCount < storedCount → skip seed
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/vendorinfo/vendors", DCL_EMPTY);
        const vendorBbbEntry: VendorEntry = {
            vendorId: 0xbbbb,
            vendorName: "Seed Vendor",
            companyLegalName: "Seed Corp",
            kind: "production",
        };
        const svc2 = new DclVendorInfoService(environment, {
            seed: { vendors: makeSeedSource([vendorBbbEntry], storedCount - 1) }, // expectedCount < storedCount
            updateInterval: null,
        });
        await svc2.construction;

        // Seed was skipped — vendor 0xbbbb not in storage or DCL
        expect(svc2.infoFor(0xbbbb)).to.be.undefined;

        await svc2.close();
    });

    it("aborts stream on malformed vendor entry", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/vendorinfo/vendors", DCL_EMPTY);
        fetchMock.install();

        const malformed = { kind: "production" } as unknown as VendorEntry;
        const seed: SeedSource<VendorEntry> = {
            builtAt: "2026-05-13T02:00:00Z",
            expectedCount: 5,
            entries: makeAsyncIterable([malformed, VENDOR_1]),
        };

        const service = new DclVendorInfoService(environment, {
            seed: { vendors: seed },
            updateInterval: null,
        });
        await service.construction;

        // Stream aborted on first malformed entry — VENDOR_1 (0x1234) was never inserted
        // DCL also returned empty, so 0x1234 not present
        expect(service.infoFor(0x1234)).to.be.undefined;

        await service.close();
    });

    it("no-seed: existing behavior unchanged", async () => {
        fetchMock.addResponse("on.dcl.csa-iot.org/dcl/vendorinfo/vendors", DCL_WITH_VENDOR_1);
        fetchMock.install();

        const service = new DclVendorInfoService(environment, { updateInterval: null });
        await service.construction;

        expect(service.infoFor(0x1234)).to.not.be.undefined;

        await service.close();
    });
});
