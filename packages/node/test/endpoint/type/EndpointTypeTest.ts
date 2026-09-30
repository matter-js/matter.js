/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import { EndpointType } from "#endpoint/type/EndpointType.js";

describe("EndpointType.is", () => {
    const shape = { name: "Light", deviceType: 0x100, deviceRevision: 3, behaviors: {} };

    it("accepts an endpoint type", () => {
        expect(EndpointType.is(OnOffLightDevice)).true;
        expect(EndpointType.is(shape)).true;
    });

    it("refuses a value lacking a field or carrying one of the wrong type", () => {
        expect(EndpointType.is(undefined)).false;
        expect(EndpointType.is(null)).false;
        expect(EndpointType.is("OnOffLight")).false;
        expect(EndpointType.is({ ...shape, name: 1 })).false;
        expect(EndpointType.is({ ...shape, deviceType: "0x100" })).false;
        expect(EndpointType.is({ ...shape, deviceRevision: "3" })).false;
        expect(EndpointType.is({ ...shape, behaviors: null })).false;
        expect(EndpointType.is({ ...shape, behaviors: "none" })).false;
        const { behaviors: _behaviors, ...withoutBehaviors } = shape;
        expect(EndpointType.is(withoutBehaviors)).false;
    });
});
