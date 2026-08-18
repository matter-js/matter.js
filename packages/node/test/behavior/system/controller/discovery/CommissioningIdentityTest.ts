/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningDiscovery } from "#behavior/system/controller/discovery/CommissioningDiscovery.js";
import { VendorId } from "@matter/types";

const { identityMismatch } = CommissioningDiscovery;

const VENDOR = VendorId(0xfff1);
const OTHER_VENDOR = VendorId(0xfff2);
const PRODUCT = 0x8001;
const OTHER_PRODUCT = 0x8002;

describe("CommissioningDiscovery.identityMismatch", () => {
    it("accepts a device advertising what the payload names", () => {
        expect(
            identityMismatch({ vendorId: VENDOR, productId: PRODUCT }, { vendorId: VENDOR, productId: PRODUCT }),
        ).equal(undefined);
    });

    it("names the vendor a device advertises instead", () => {
        expect(identityMismatch({ vendorId: VENDOR }, { vendorId: OTHER_VENDOR })).deep.equal({
            facet: "vendor",
            payload: VENDOR,
            advertised: OTHER_VENDOR,
        });
    });

    it("names the product a device advertises instead", () => {
        expect(
            identityMismatch({ vendorId: VENDOR, productId: PRODUCT }, { vendorId: VENDOR, productId: OTHER_PRODUCT }),
        ).deep.equal({ facet: "product", payload: PRODUCT, advertised: OTHER_PRODUCT });
    });

    it("accepts when the payload names no identity", () => {
        // An 11-digit manual pairing code carries neither
        expect(identityMismatch({}, { vendorId: VENDOR, productId: PRODUCT })).equal(undefined);
    });

    it("accepts when the advertisement states no identity", () => {
        // The VP record is optional, so its absence cannot be read as disagreement
        expect(identityMismatch({ vendorId: VENDOR, productId: PRODUCT }, {})).equal(undefined);
    });

    it("judges each half on its own presence", () => {
        expect(
            identityMismatch({ vendorId: VENDOR, productId: PRODUCT }, { vendorId: VENDOR }),
            "product absent",
        ).equal(undefined);
        expect(
            identityMismatch({ productId: PRODUCT }, { vendorId: OTHER_VENDOR, productId: PRODUCT }),
            "vendor absent",
        ).equal(undefined);
        expect(
            identityMismatch({ vendorId: VENDOR }, { vendorId: OTHER_VENDOR, productId: PRODUCT }),
            "vendor differs",
        ).deep.equal({ facet: "vendor", payload: VENDOR, advertised: OTHER_VENDOR });
    });

    it("compares only what both sides state", () => {
        // § 2.5.2 / § 2.5.3's "unspecified" is 0 on the wire, and the payload codecs and the
        // advertisement parser both report it as absent, so it never arrives here as a value
        expect(identityMismatch({}, {})).equal(undefined);
        expect(identityMismatch({ productId: PRODUCT }, { productId: PRODUCT })).equal(undefined);
    });
});
