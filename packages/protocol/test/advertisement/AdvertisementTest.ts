/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Advertisement } from "#advertisement/Advertisement.js";
import { Advertiser } from "#advertisement/Advertiser.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { Minutes } from "@matter/general";
import { VendorId } from "@matter/types";

const DESCRIPTION = ServiceDescription.Commissionable({
    name: "Test",
    deviceType: 1,
    vendorId: VendorId(1),
    productId: 1,
    mode: 1,
    discriminator: 0xf00,
});

class TestAdvertiser extends Advertiser {
    protected getAdvertisement() {
        return undefined;
    }
}

class TestAdvertisement extends Advertisement<ServiceDescription.Commissionable> {
    constructor(advertiser: Advertiser, options?: Advertisement.Options) {
        super(advertiser, "test", DESCRIPTION, options);
    }

    get extendedAnnouncement() {
        return this.isExtendedAnnouncement;
    }

    get privacyMasked() {
        return this.isPrivacyMasked;
    }

    protected async run() {}

    isDuplicate() {
        return false;
    }
}

describe("Advertisement", () => {
    before(() => {
        MockTime.enable();
    });

    describe("privacy masking", () => {
        it("masks nothing before the extended-announcement period", async () => {
            const ad = new TestAdvertisement(new TestAdvertiser());
            try {
                expect(ad.privacyMasked).false;
                expect(ad.extendedAnnouncement).false;
            } finally {
                await ad.close();
            }
        });

        it("masks private details but does not signal extended announcement when forced via omitPrivateDetails", async () => {
            const ad = new TestAdvertisement(new TestAdvertiser(), { omitPrivateDetails: true });
            try {
                expect(ad.privacyMasked).true;
                expect(ad.extendedAnnouncement).false;
            } finally {
                await ad.close();
            }
        });

        it("masks and signals extended announcement once the extended-announcement period begins", async () => {
            const ad = new TestAdvertisement(new TestAdvertiser());
            try {
                await MockTime.advance(Minutes(15));
                expect(ad.privacyMasked).true;
                expect(ad.extendedAnnouncement).true;
            } finally {
                await ad.close();
            }
        });

        it("signals extended announcement in the extended-announcement period even with omitPrivateDetails set", async () => {
            const ad = new TestAdvertisement(new TestAdvertiser(), { omitPrivateDetails: true });
            try {
                await MockTime.advance(Minutes(15));
                expect(ad.privacyMasked).true;
                expect(ad.extendedAnnouncement).true;
            } finally {
                await ad.close();
            }
        });
    });
});
