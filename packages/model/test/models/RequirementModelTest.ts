/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequirementElement } from "#elements/index.js";
import { RequirementModel } from "#models/index.js";

describe("RequirementModel", () => {
    describe("location", () => {
        it("survives a toElement round trip", () => {
            const model = new RequirementModel({
                name: "Heater",
                type: "TemperatureControlledCabinet.Heater",
                element: "condition",
                location: RequirementElement.Location.Descendant,
                constraint: "min 1",
            });

            const element = model.toElement();

            expect(element.location).equals("Descendant");
            expect(new RequirementModel(element).location).equals("Descendant");
        });

        it("is absent when unstated", () => {
            expect(new RequirementModel({ name: "PowerSource", element: "deviceType" }).location).undefined;
        });
    });

    describe("componentCountRange", () => {
        function rangeOf(constraint: string | undefined) {
            return new RequirementModel({ name: "PowerSource", element: "deviceType", constraint }).componentCountRange;
        }

        it("reads a minimum", () => {
            expect(rangeOf("min 2")).deep.equals({ min: 2, max: undefined });
        });

        it("reads a maximum", () => {
            expect(rangeOf("max 1")).deep.equals({ min: undefined, max: 1 });
        });

        it("reads an exact count", () => {
            expect(rangeOf("1")).deep.equals({ min: 1, max: 1 });
        });

        it("reads a span", () => {
            expect(rangeOf("1 to 4")).deep.equals({ min: 1, max: 4 });
        });

        it("states no count for an empty constraint", () => {
            expect(rangeOf(undefined)).undefined;
        });

        it("states no count for a constraint that bounds no number", () => {
            expect(rangeOf("all")).undefined;
            expect(rangeOf("desc")).undefined;
        });

        it("states no count for a constraint of several parts", () => {
            expect(rangeOf("1 to 2, 4")).undefined;
        });

        it("reads the constraint of a requirement that is not a component requirement", () => {
            expect(
                new RequirementModel({ name: "OnTime", element: "attribute", constraint: "max 10" })
                    .componentCountRange,
            ).deep.equals({ min: undefined, max: 10 });
        });
    });
});
