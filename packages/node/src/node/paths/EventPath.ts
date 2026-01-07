/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventId, TlvEventPath, TypeFromSchema } from "#types";
import { BasePath } from "./BasePath.js";

export namespace EventPath {
    /**
     * Event name or ID.
     */
    export type Address = EventId | string;

    /**
     * Addresses event data for reads.  Note that you can wildcard the
     * event but if you specify an event you must also specify the cluster.
     *
     * @see {@link MatterSpecification.v11.Core} § 8.9.3.2
     */
    export type Read = BasePath.Read & {
        urgent?: boolean;
    } & {
        cluster: BasePath.Address;
        event: Address;
    };

    /**
     * Addresses a specific event source.
     */
    export type Concrete = BasePath.Concrete & {
        event: Address;
    };
}

export type EventPath = TypeFromSchema<typeof TlvEventPath>;
