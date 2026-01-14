/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeId, EntryIndex, FieldId } from "#types";
import { BasePath } from "./BasePath.js";

export namespace AttributePath {
    /**
     * Attribute name or ID.
     */
    export type Address = AttributeId | string;

    /**
     * Field name or ID.
     */
    export type FieldAddress = FieldId | string;

    /**
     * Addresses a collection (struct or list) within an attribute.
     *
     * @see {@link MatterSpecification.v11.Core} § 8.9.2.2
     */
    export type Nested = ({ field: FieldAddress } | { entry: EntryIndex })[];

    /**
     * Addresses attribute data for read operations.  Note that if you specify the attribute you must also specify the
     * cluster except for global attributes.
     *
     * @see {@link MatterSpecification.v11.Core} § 8.9.2.1 & 8.9.2.3
     */
    export type Read = BasePath.Read & {
        attribute?: Address;
        subpath?: Nested;
    };

    /**
     * Addresses attribute data for write operations.
     *
     * @see {@link MatterSpecification.v11.Core} § 8.9.2.1 & 8.9.2.4
     */
    export type Write = BasePath.Write & {
        attribute: Address;
        subpath?: Nested;
    };

    /**
     * Addresses a specific attribute.
     */
    export type Concrete = BasePath.Concrete & {
        attribute: Address;
        subpath?: Nested;
    };
}
