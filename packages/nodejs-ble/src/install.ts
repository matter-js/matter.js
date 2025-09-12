/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, ServiceBundle } from "#general";
import { Ble } from "#protocol";
import { NodeJsBle } from "./NodeJsBle.js";

function nodejsBle(env: Environment) {
    let installed = false;
    let instance = undefined as undefined | Ble;

    env.vars.use(() => {
        const shouldInstall = env.vars.boolean("ble.enable");
        if (shouldInstall === installed) {
            return;
        }

        if (shouldInstall) {
            instance = new NodeJsBle({ environment: env });
            env.set(Ble, instance);
        } else {
            env.delete(Ble, instance);
            instance = undefined;
        }

        installed = shouldInstall;
    });
}

ServiceBundle.default.add(nodejsBle);
