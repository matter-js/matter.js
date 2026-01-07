/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueModel } from "#model";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { astToFunction } from "./conformance-compiler.js";

/**
 * Creates a function that validates a field based on its conformance definition.
 *
 * This is the validator that enforces the presence of mandatory fields.  As such, only invokes {@link nextValidator} if
 * a value is present.
 */
export function createConformanceValidator(
    schema: ValueModel,
    supervisor: RootSupervisor,
    nextValidator?: ValueSupervisor.Validate,
): ValueSupervisor.Validate | undefined {
    const validate = astToFunction(schema, supervisor);

    if (!validate && !nextValidator) {
        return undefined;
    }

    return (value, session, location) => {
        validate?.(value, session, location);
        if (value !== undefined) {
            nextValidator?.(value, session, location);
        }
    };
}
