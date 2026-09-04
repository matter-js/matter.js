/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#aspects/index.js";
import { FieldValue } from "#common/index.js";
import { DatatypeElement, FieldElement } from "#elements/index.js";
import { EncodedConstraint } from "#logic/EncodedConstraint.js";
import { DatatypeModel, FieldModel, MatterModel } from "#models/index.js";

function field(type: string) {
    return new FieldModel(FieldElement({ name: "Test", type }));
}

const percent100ths = field("percent100ths");
const temperature = field("UnsignedTemperature");

/** A numeric type the unit conversion knows no scale for */
const unscaled = field("uint16");

/** The bounds without the model each belongs to, for the cases that do not turn on it */
function valuesOf(constraint: Constraint, model: FieldModel) {
    const bounds = EncodedConstraint.bounds(constraint, model);
    return {
        encoded: bounds.encoded.map(bound => bound.value),
        unscaled: bounds.unscaled.map(bound => bound.value),
    };
}

/** A field of an enumerated type, in a scope where that type resolves */
function enumField(constraint: string) {
    const operation = new FieldModel(FieldElement({ name: "Operation", type: "OperationEnum", constraint }));

    const matter = new MatterModel(
        {},
        new DatatypeModel(
            DatatypeElement({ name: "OperationEnum", type: "enum8" }),
            FieldElement({ name: "Add", id: 0 }),
            FieldElement({ name: "Clear", id: 1 }),
            FieldElement({ name: "Modify", id: 2 }),
        ),
        new DatatypeModel(DatatypeElement({ name: "Holder", type: "struct" }), operation),
    );
    matter.finalize();

    return operation;
}

describe("EncodedConstraint", () => {
    describe("a bound naming a value of the type", () => {
        it("states the value each name denotes", () => {
            const model = enumField("add, modify");

            expect(EncodedConstraint(model.constraint, model).toString()).equals("0, 2");
        });

        it("admits the values named and no others", () => {
            const model = enumField("add, modify");
            const constraint = EncodedConstraint(model.constraint, model);

            expect(constraint.test(0)).true;
            expect(constraint.test(2)).true;
            expect(constraint.test(1)).false;
            expect(constraint.test(99)).false;
        });

        it("states a name the type does not define as it stands", () => {
            const model = enumField("add, nonexistent");

            expect(EncodedConstraint(model.constraint, model).toString()).equals("0, nonexistent");
        });

        // Only an enumerated type names its values in a bound; a member of any other type is a value of the record,
        // which a bound names through the surrounding scope rather than through the type
        it("leaves a bound naming a member of a type that is not an enumeration", () => {
            const bounded = new FieldModel(
                FieldElement({ name: "Bounded", type: "LimitsStruct", constraint: "max low" }),
            );

            const matter = new MatterModel(
                {},
                new DatatypeModel(
                    DatatypeElement({ name: "LimitsStruct", type: "struct" }),
                    FieldElement({ name: "Low", id: 0, type: "uint8" }),
                ),
                new DatatypeModel(DatatypeElement({ name: "Holder", type: "struct" }), bounded),
            );
            matter.finalize();

            expect(EncodedConstraint(bounded.constraint, bounded).toString()).equals("max low");
        });
    });

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
        expect(valuesOf(new Constraint("0°C to 25.5°C"), temperature)).deep.equal({ encoded: [0, 255], unscaled: [] });
        expect(valuesOf(new Constraint("max 100%"), percent100ths)).deep.equal({ encoded: [10000], unscaled: [] });
    });

    it("reports every bound the type gives no scale for", () => {
        expect(valuesOf(new Constraint("0°C to 25.5°C"), unscaled)).deep.equal({
            encoded: [],
            unscaled: [FieldValue.Celsius(0), FieldValue.Celsius(25.5)],
        });
    });

    it("reports a bound of each alternative", () => {
        expect(valuesOf(new Constraint("12.7°C, 25.5°C"), unscaled).unscaled).deep.equal([
            FieldValue.Celsius(12.7),
            FieldValue.Celsius(25.5),
        ]);
    });

    // A membership set states one bound per member, which only programmatic construction produces today
    it("states each member of a membership set", () => {
        expect(
            EncodedConstraint.bounds(new Constraint({ in: [-1, 1] }), unscaled).encoded.map(b => b.value),
        ).deep.equal([-1, 1]);
    });

    it("reports the numbers a bound with no unit states", () => {
        expect(valuesOf(new Constraint("1 to 254"), unscaled).encoded).deep.equal([1, 254]);
    });

    // The entry constraint of a list bounds the entries, so its bounds belong to the entry
    it("states an entry bound against the type of the entry", () => {
        const list = new FieldModel(
            FieldElement({
                name: "Test",
                type: "list",
                children: [FieldElement({ name: "entry", type: "percent100ths" })],
            }),
        );

        const bounds = EncodedConstraint.bounds(new Constraint("max 4[max 100%]"), list);
        expect(bounds.encoded.map(bound => [bound.value, bound.model.name])).deep.equal([
            [4, "Test"],
            [10000, "entry"],
        ]);
    });
});
