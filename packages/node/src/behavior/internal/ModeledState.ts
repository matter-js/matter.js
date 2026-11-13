/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { ClassSemantics, Schema } from "@matter/model";
import type { Behavior } from "../Behavior.js";

interface ModeledClasses {
    type: Behavior.Type;
    State: unknown;
    Events: unknown;
}

const modeledClasses = new WeakMap<object, ModeledClasses>();

/**
 * Record the State and Events classes whose decorations the schema of behavior `type` includes.
 */
export function setModeledClasses(type: Behavior.Type, State: unknown, Events: unknown) {
    modeledClasses.set(type, { type, State, Events });
}

/**
 * Resolves the schema of `type`, then throws if `type` or a behavior it extends has a decorated State or Events class
 * other than the one its schema includes.  This happens when something resolves a schema before the namespace merge
 * assigns the class's State or Events, such as a static initializer that reads the schema or cluster.  The schema, and
 * every variant built from it, would then silently lack the elements that State or Events declare.
 */
export function assertModeledClasses(type: Behavior.Type) {
    Schema(type);

    for (let current: unknown = type; typeof current === "function"; current = Object.getPrototypeOf(current)) {
        const modeled = modeledClasses.get(current);
        if (modeled === undefined) {
            continue;
        }

        for (const name of ["State", "Events"] as const) {
            const declared = modeled.type[name];
            if (
                declared === modeled[name] ||
                !Object.hasOwn(modeled.type, name) ||
                !ClassSemantics.hasOwnSemantics(declared)
            ) {
                continue;
            }

            throw new ImplementationError(
                `Behavior ${type.name} uses the ${name} of ${modeled.type.name}, which its schema does not include ` +
                    `because the schema resolved before ${name} was assigned; do not read the schema or cluster of a ` +
                    `behavior while its class is being defined`,
            );
        }
    }
}
