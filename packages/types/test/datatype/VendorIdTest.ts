/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "#datatype/VendorId.js";

describe("VendorId", () => {
    describe("isOperational", () => {
        it("refuses the Matter Standard vendor ID", () => {
            expect(VendorId.isOperational(0)).equals(false);
        });

        it("accepts the lowest and highest assignable vendor IDs", () => {
            expect(VendorId.isOperational(1)).equals(true);
            expect(VendorId.isOperational(0xfff4)).equals(true);
        });

        it("refuses vendor IDs above 0xFFF4", () => {
            expect(VendorId.isOperational(0xfff5)).equals(false);
            expect(VendorId.isOperational(0xffff)).equals(false);
        });

        it("refuses a vendor ID that is not an integer", () => {
            expect(VendorId.isOperational(1.5)).equals(false);
        });
    });
});
