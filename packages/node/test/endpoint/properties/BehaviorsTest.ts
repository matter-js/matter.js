/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";

describe("Behaviors", () => {
    it("accepts different base class for cluster requirements", () => {
        class MyOnOffServer extends OnOffServer {}

        const light = new Endpoint(OnOffLightDevice.with(MyOnOffServer));

        light.behaviors.validateRequirements();
    });

    it("inject rejects behavior ID starting with uppercase", () => {
        class UpperBehavior extends Behavior {
            static override readonly id = "BadName";
        }

        const light = new Endpoint(OnOffLightDevice);

        expect(() => {
            light.behaviors.inject(UpperBehavior);
        }).throws('Behavior ID "BadName" must start with a lowercase letter');
    });

    it("inject accepts behavior ID starting with lowercase", () => {
        class GoodBehavior extends Behavior {
            static override readonly id = "goodName";
        }

        const light = new Endpoint(OnOffLightDevice);

        light.behaviors.inject(GoodBehavior);
        expect(light.behaviors.supported["goodName"]).equal(GoodBehavior);
    });
});
