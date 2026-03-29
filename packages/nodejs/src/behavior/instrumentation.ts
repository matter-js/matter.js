/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Instrumentation } from "@matter/node";
import { Val } from "@matter/protocol";
import { inspect } from "node:util";

/**
 * Node's default console formatting makes it difficult to view the value of managed collections.  This function
 * instruments values to make inspection work more naturally.
 */
export function installInspectionInstrumentation() {
    Instrumentation.instrumentStruct = constructor => {
        constructor.prototype[inspect.custom] = function (this: Val.Struct) {
            return { ...this };
        };

        return constructor;
    };
}
