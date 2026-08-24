/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#aspects/index.js";
import { FieldValue } from "#common/index.js";
import { FieldElement } from "#elements/index.js";
import { EncodedConstraint } from "#logic/EncodedConstraint.js";
import { FieldModel } from "#models/index.js";

function field(type: string) {
    return new FieldModel(FieldElement({ name: "Test", type }));
}

const percent100ths = field("percent100ths");
const temperature = field("UnsignedTemperature");

/** A numeric type the unit conversion knows no scale for */
const unscaled = field("uint16");

describe("EncodedConstraint", () => {
    it("counts the units of the type", () => {
        expect(`${EncodedConstraint(new Constraint("0% to 100%"), percent100ths)}`).equal("0 to 10000");
        expect(`${EncodedConstraint(new Constraint("0°C to 25.5°C"), temperature)}`).equal("0 to 255");
    });

    it("converts an entry bound with the type of the entry", () => {
        const list = new FieldModel(
            FieldElement({
                name: "Test",
                type: "list",
                children: [FieldElement({ name: "entry", type: "percent100ths" })],
            }),
        );

        expect(`${EncodedConstraint(new Constraint("max 4[max 100%]"), list)}`).equal("max 4[max 10000]");
    });

    it("leaves a bound the type gives no scale for", () => {
        expect(`${EncodedConstraint(new Constraint("0°C to 25.5°C"), unscaled)}`).equal("0°C to 25.5°C");
    });
});

describe("EncodedConstraint.bounds", () => {
    it("states nothing unscaled where every bound converts", () => {
        expect(EncodedConstraint.bounds(new Constraint("0°C to 25.5°C"), temperature)).deep.equal({
            encoded: [0, 255],
            unscaled: [],
        });
        expect(EncodedConstraint.bounds(new Constraint("max 100%"), percent100ths)).deep.equal({
            encoded: [10000],
            unscaled: [],
        });
    });

    it("reports every bound the type gives no scale for", () => {
        expect(EncodedConstraint.bounds(new Constraint("0°C to 25.5°C"), unscaled)).deep.equal({
            encoded: [],
            unscaled: [FieldValue.Celsius(0), FieldValue.Celsius(25.5)],
        });
    });

    it("reports a bound of each alternative", () => {
        expect(EncodedConstraint.bounds(new Constraint("12.7°C, 25.5°C"), unscaled).unscaled).deep.equal([
            FieldValue.Celsius(12.7),
            FieldValue.Celsius(25.5),
        ]);
    });

    it("reports the numbers a bound with no unit states", () => {
        expect(EncodedConstraint.bounds(new Constraint("1 to 254"), unscaled).encoded).deep.equal([1, 254]);
    });
});
