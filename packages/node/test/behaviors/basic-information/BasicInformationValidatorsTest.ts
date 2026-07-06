/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateBasicInfoAttributes } from "#behaviors/basic-information";
import { ImplementationError, Logger } from "@matter/general";

const log = Logger.get("BasicInformationValidatorsTest");

describe("validateBasicInfoAttributes", () => {
    describe("VendorID/ProductID identity", () => {
        it("rejects VendorID 0x0000 (Matter Standard, not a device identity)", () => {
            expect(() => validateBasicInfoAttributes({ vendorId: 0x0000, productId: 0x8000 }, log)).throws(
                ImplementationError,
            );
        });

        it("rejects VendorID above the assignable range (> 0xFFF4)", () => {
            expect(() => validateBasicInfoAttributes({ vendorId: 0xfff5, productId: 0x8000 }, log)).throws(
                ImplementationError,
            );
        });

        it("rejects ProductID 0x0000 (reserved)", () => {
            expect(() => validateBasicInfoAttributes({ vendorId: 0xfff1, productId: 0x0000 }, log)).throws(
                ImplementationError,
            );
        });

        it("accepts a real device identity", () => {
            expect(() => validateBasicInfoAttributes({ vendorId: 0xfff1, productId: 0x8000 }, log)).not.throws();
        });

        it("accepts a manufacturer VendorID at the lower bound", () => {
            expect(() => validateBasicInfoAttributes({ vendorId: 0x0001, productId: 0x0001 }, log)).not.throws();
        });

        it("skips the check when VendorID/ProductID are absent (optional on bridged devices)", () => {
            expect(() => validateBasicInfoAttributes({ uniqueId: "abc", serialNumber: "def" }, log)).not.throws();
        });
    });
});
