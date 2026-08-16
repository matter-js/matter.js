/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningDiscovery } from "#behavior/system/controller/discovery/CommissioningDiscovery.js";

const { identityMismatch } = CommissioningDiscovery;

describe("CommissioningDiscovery.identityMismatch", () => {
    it("accepts a device advertising what the payload names", () => {
        expect(
            identityMismatch({ vendorId: 0xfff1, productId: 0x8001 }, { vendorId: 0xfff1, productId: 0x8001 }),
        ).equal(undefined);
    });

    it("refuses a device advertising another vendor", () => {
        expect(identityMismatch({ vendorId: 0xfff1 }, { vendorId: 0xfff2 })).match(
            /advertises vendor 65522 where the onboarding payload names 65521/,
        );
    });

    it("refuses a device advertising another product", () => {
        expect(
            identityMismatch({ vendorId: 0xfff1, productId: 0x8001 }, { vendorId: 0xfff1, productId: 0x8002 }),
        ).match(/advertises product 32770 where the onboarding payload names 32769/);
    });

    it("accepts when the payload names no identity", () => {
        // An 11-digit manual pairing code carries neither
        expect(identityMismatch({}, { vendorId: 0xfff1, productId: 0x8001 })).equal(undefined);
    });

    it("accepts when the advertisement states no identity", () => {
        // The VP record is optional, so its absence cannot be read as disagreement
        expect(identityMismatch({ vendorId: 0xfff1, productId: 0x8001 }, {})).equal(undefined);
    });

    it("judges each half on its own presence", () => {
        expect(identityMismatch({ vendorId: 0xfff1, productId: 0x8001 }, { vendorId: 0xfff1 }), "product absent").equal(
            undefined,
        );
        expect(identityMismatch({ productId: 0x8001 }, { vendorId: 0xfff2, productId: 0x8001 }), "vendor absent").equal(
            undefined,
        );
        expect(identityMismatch({ vendorId: 0xfff1 }, { vendorId: 0xfff2, productId: 0x8001 }), "vendor differs").match(
            /advertises vendor/,
        );
    });

    it("reads 0 as unstated on either side", () => {
        // A QR payload always carries both fields and says nothing by zeroing them, so matching on 0
        // would refuse every device that does name a vendor
        expect(identityMismatch({ vendorId: 0, productId: 0 }, { vendorId: 0xfff1, productId: 0x8001 })).equal(
            undefined,
        );
        expect(identityMismatch({ vendorId: 0xfff1, productId: 0x8001 }, { vendorId: 0, productId: 0 })).equal(
            undefined,
        );
    });
});
