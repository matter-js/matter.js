/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueModel } from "@matter/model";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { astToFunction } from "./conformance-compiler.js";
import { forwardValidationToPeer } from "./peer-forwarding.js";

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
        const cfg = location.config?.supervision;

        // validate=false is the master kill switch — skip all validation including type-specific validators
        // (which for structs means child fields are never visited)
        if (cfg?.validate === false) {
            return;
        }

        if (cfg?.conformance !== false) {
            try {
                validate?.(value, session, location);
            } catch (e) {
                // For peer writes a forwarded conformance failure must still fall through to datatype validation below,
                // so a wrong-typed value cannot slip onto the wire.
                if (!forwardValidationToPeer(session, e)) {
                    throw e;
                }
            }
        }

        if (value !== undefined) {
            nextValidator?.(value, session, location);
        }
    };
}
