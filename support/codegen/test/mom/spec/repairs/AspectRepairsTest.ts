/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { repairConstraint } from "#mom/spec/repairs/aspect-repairs.js";

function repaired(constraint: string) {
    const record = { constraint };
    repairConstraint(record);
    return record.constraint;
}

describe("repair of a scraped constraint", () => {
    it("removes a unit from a bound", () => {
        expect(repaired("max 32 octets")).equal("max 32");
        expect(repaired("max 8 entries")).equal("max 8");
        expect(repaired("max 900 bytes")).equal("max 900");
        expect(repaired("max 5 per node")).equal("max 5");
    });

    it("removes a word the constraint language does not define", () => {
        for (const constraint of ["any", "Any", "ms", "MS"]) {
            expect(repaired(constraint), constraint).undefined;
        }
    });

    it("keeps a name that merely begins with one", () => {
        expect(repaired("anyValue")).equal("anyValue");
    });
});
