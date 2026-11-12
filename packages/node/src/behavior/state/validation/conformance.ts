/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueModel } from "@matter/model";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { astToFunction } from "./conformance-compiler.js";
import { leaveToRemote, mayLeaveToRemote } from "./remote-validation.js";

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
    const conformance = astToFunction(schema, supervisor);

    if (!conformance && !nextValidator) {
        return undefined;
    }

    const remoteDecides = mayLeaveToRemote(supervisor);

    return (value, session, location) => {
        const cfg = location.config?.supervision;

        // validate=false is the master kill switch — skip all validation including type-specific validators
        // (which for structs means child fields are never visited)
        if (cfg?.validate === false) {
            return;
        }

        // A conformance failure left to the device must still fall through to datatype validation below, so a
        // wrong-typed value cannot slip onto the wire
        if (cfg?.conformance !== false) {
            try {
                conformance?.(value, session, location);
            } catch (e) {
                if (!remoteDecides || !leaveToRemote(location, e)) {
                    throw e;
                }
            }
        }

        if (value !== undefined) {
            nextValidator?.(value, session, location);
        }
    };
}
