/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";

describe("Behaviors", () => {
    it("accepts different base class for cluster requirements", () => {
        class MyOnOffServer extends OnOffServer {}

        const light = new Endpoint(OnOffLightDevice.with(MyOnOffServer));

        light.behaviors.validateRequirements();
    });
});
