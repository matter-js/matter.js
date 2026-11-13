/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SchemaErrorPath } from "@matter/model";
import { WriteError } from "@matter/protocol";
import { Status } from "@matter/types";

/**
 * Thrown for a change in place of a mandatory list, struct or bitmap that the cluster state of a client node does not
 * hold.
 *
 * The cluster state of a client node reads such a value as its default, so it reads like any other value.  The default
 * is not the device's value: the device's list may hold entries, its bitmap flags and its struct fields that the
 * default does not have.  Sending the default with a change would replace the device's value, so the change fails and
 * nothing is stored or sent.
 *
 * Read the attribute from the device first, or assign a complete value.  An assigned value replaces the value on the
 * device, also when it was built from the default, such as `[...state.binding, entry]`.  `Endpoint.set()` and
 * `Endpoint.setStateOf()` assign each attribute value given for the cluster state of a client node whole, so they do
 * not fail with this error.
 */
export class UncachedValueError extends WriteError {
    constructor(path: SchemaErrorPath) {
        super(
            path,
            "The value is not cached; read it from the device first, or assign a complete value, which replaces the value on the device",
            Status.InvalidInState,
        );
    }
}
