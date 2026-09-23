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
});
