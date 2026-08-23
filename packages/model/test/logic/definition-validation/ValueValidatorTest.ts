/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement as Attribute, uint8, uint16, ValidateModel } from "#index.js";
import { ClusterModel, DatatypeModel, MatterModel } from "#models/index.js";

/** A constraint stated on the datatype that names the scale, rather than on a value of that type */
function validateDatatype(constraint: string) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        new ClusterModel(
            { name: "Test", id: 0xfff1 },
            new DatatypeModel({ name: "UnsignedTemperature", type: "uint8", constraint }),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => e.code === "CONSTRAINT_UNIT_WITHOUT_SCALE");
}

function validateConstraint(type: string, constraint: string) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),

        // The scale of a unit comes from the type name, so the test needs a type the conversion knows
        new DatatypeModel({ name: "UnsignedTemperature", type: "uint8" }),

        // A type the conversion has never heard of, deriving from one it knows
        new DatatypeModel({ name: "RoomTemperature", type: "UnsignedTemperature" }),
        new ClusterModel({ name: "Test", id: 0xfff1 }, Attribute({ name: "Bounded", id: 1, type, constraint })),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => e.code === "CONSTRAINT_UNIT_WITHOUT_SCALE");
}

describe("ValueValidator", () => {
    describe("constraint bounds stated in a unit", () => {
        it("accepts a bound the type gives a scale for", () => {
            expect(validateConstraint("UnsignedTemperature", "0°C to 25.5°C")).deep.equals([]);
        });

        it("accepts a bound whose scale comes from the type it derives from", () => {
            expect(validateConstraint("RoomTemperature", "0°C to 25.5°C")).deep.equals([]);
        });

        // The name of a datatype is a type name, so it states a scale for a bound the datatype itself carries
        it("accepts a bound on the datatype that names the scale", () => {
            expect(validateDatatype("0°C to 25.5°C")).deep.equals([]);
        });

        it("accepts a bound with no unit", () => {
            expect(validateConstraint("uint16", "0 to 255")).deep.equals([]);
        });

        // Left in place the bound admits every value as a range, and none as an exact value
        it("reports one error for a constraint whose unit has no scale", () => {
            const errors = validateConstraint("uint16", "0°C to 25.5°C");

            expect(errors.length).equals(1);
            expect(errors[0].message).match(/states 0°C and 25.5°C in a unit that type uint16 gives no scale for/);
        });
    });
});
