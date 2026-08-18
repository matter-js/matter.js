/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "#common/index.js";
import { FieldElement } from "#elements/index.js";
import { EncodedValue } from "#logic/EncodedValue.js";
import { FieldModel } from "#models/index.js";

const percent = new FieldModel(FieldElement({ name: "Test", type: "percent100ths" }));
const temperature = new FieldModel(FieldElement({ name: "Test", type: "UnsignedTemperature" }));

describe("EncodedValue", () => {
    it("counts the units of the type", () => {
        expect(EncodedValue(percent, FieldValue.Percent(100))).equal(10000);
        expect(EncodedValue(temperature, FieldValue.Celsius(25.5))).equal(255);
    });

    it("lands on the unit a binary fraction misses", () => {
        // 0.07 * 100 is 7.000000000000001
        expect(EncodedValue(percent, FieldValue.Percent(0.07))).equal(7);
        expect(EncodedValue(percent, FieldValue.Percent(0.29))).equal(29);
    });

    it("states nothing for a value with no numeric form", () => {
        expect(EncodedValue(percent, FieldValue.Reference("Other"))).equal(undefined);
    });
});
