/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "#protocol";
import type { Behavior } from "../../Behavior.js";
import type { ValueSupervisor } from "../../supervision/ValueSupervisor.js";

/**
 * Instrumentation points for the managed values used for {@link Behavior.state}.
 */
export namespace Instrumentation {
    /**
     * A constructor for the generated class associated with a {@link Val.Struct}.
     */
    export type StructFactory = new (ref: Val.Reference<Val.Struct>, session: ValueSupervisor.Session) => Val.Struct;

    /**
     * Instrument the class generated for Matter structs.
     */
    export function instrumentStruct(factory: StructFactory) {
        return factory;
    }

    /**
     * Creation function for generating proxies for Matter lists.
     */
    export type ListFactory = (handlers: ProxyHandler<Val.List>, target: Val.List) => Val.List;

    /**
     * Instrument Matter list creation.
     */
    export function instrumentList(factory: ListFactory) {
        return factory;
    }
}
