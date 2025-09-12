/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, ServiceBundle } from "#general";
import { Ble } from "#protocol";
import { NodeJsBle } from "./NodeJsBle.js";

function nodejsBle(env: Environment) {
    if (env.vars.boolean("ble.enable") !== true) {
        return;
    }

    const instance = new NodeJsBle({ environment: env });
    env.set(Ble, instance);
}

ServiceBundle.default.add(nodejsBle);
