/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReedSolomon } from "#math/ReedSolomon.js";
import { Bytes } from "#util/Bytes.js";

describe("ReedSolomon", () => {
    describe("computeErrorCorrection", () => {
        it("computes the correct error correction bytes", () => {
            const result = new ReedSolomon().computeErrorCorrection(
                Bytes.of(Bytes.fromHex("40d2754776173206272696c6c69670ec")),
                10,
            );

            expect(Bytes.toHex(result)).equal("bc2a90136bafeffd4be0");
        });
    });
});
