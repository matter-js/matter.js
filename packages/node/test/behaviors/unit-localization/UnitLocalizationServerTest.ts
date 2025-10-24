/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnitLocalizationServer } from "#behaviors/unit-localization";
import { UnitLocalization } from "#clusters/unit-localization";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("UnitLocalizationServer", () => {
    it("initializes", async () => {
        const node = await MockServerNode.create(MockServerNode.RootEndpoint.with(UnitLocalizationServer));
        expect(node.state.unitLocalization.temperatureUnit).equals(UnitLocalization.TempUnit.Celsius);
        expect(node.state.unitLocalization.supportedTemperatureUnits).deep.equals([
            UnitLocalization.TempUnit.Celsius,
            UnitLocalization.TempUnit.Fahrenheit,
        ]);
    });
});
