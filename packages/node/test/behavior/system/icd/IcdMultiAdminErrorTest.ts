/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdMultiAdminError } from "#behavior/system/icd/IcdMultiAdminError.js";
import { ImplementationError } from "@matter/general";
import { VendorId } from "@matter/types";

const { assertSingleAdmin, TRUSTED_ECOSYSTEM_VENDORS } = IcdMultiAdminError;

const v = (id: number) => VendorId(id);

describe("IcdMultiAdminError.assertSingleAdmin", () => {
    it("passes with a single fabric", () => {
        assertSingleAdmin([v(0xfff1)], TRUSTED_ECOSYSTEM_VENDORS, false);
    });

    it("throws IcdMultiAdminError with two admin fabrics from different vendors", () => {
        expect(() => assertSingleAdmin([v(0xfff1), v(0xfff2)], TRUSTED_ECOSYSTEM_VENDORS, false)).throws(
            IcdMultiAdminError,
        );
    });

    it("the thrown error is also an ImplementationError", () => {
        let caught: unknown;
        try {
            assertSingleAdmin([v(0xfff1), v(0xfff2)], TRUSTED_ECOSYSTEM_VENDORS, false);
        } catch (error) {
            caught = error;
        }
        expect(caught).instanceOf(IcdMultiAdminError);
        expect(caught).instanceOf(ImplementationError);
    });

    it("exposes the offending vendor ids on the error", () => {
        let caught: IcdMultiAdminError | undefined;
        try {
            assertSingleAdmin([v(0xfff1), v(0xfff2)], TRUSTED_ECOSYSTEM_VENDORS, false);
        } catch (error) {
            caught = error as IcdMultiAdminError;
        }
        expect(caught?.adminVendorIds.map(Number)).deep.equals([0xfff1, 0xfff2]);
    });

    it("deduplicates vendor ids on the error", () => {
        let caught: IcdMultiAdminError | undefined;
        try {
            assertSingleAdmin([v(0xfff1), v(0xfff1)], TRUSTED_ECOSYSTEM_VENDORS, false);
        } catch (error) {
            caught = error as IcdMultiAdminError;
        }
        expect(caught?.adminVendorIds.map(Number)).deep.equals([0xfff1]);
    });

    it("ignores a trusted ecosystem vendor", () => {
        assertSingleAdmin([v(0xfff1), v(0x1384)], TRUSTED_ECOSYSTEM_VENDORS, false);
    });

    it("allowMultiAdmin overrides the throw", () => {
        assertSingleAdmin([v(0xfff1), v(0xfff2)], TRUSTED_ECOSYSTEM_VENDORS, true);
    });

    it("defaults include Apple and Samsung SmartThings", () => {
        expect(TRUSTED_ECOSYSTEM_VENDORS.map(Number)).contains(0x1384); // Apple
        expect(TRUSTED_ECOSYSTEM_VENDORS.map(Number)).contains(0x110a); // Samsung SmartThings
    });
});
