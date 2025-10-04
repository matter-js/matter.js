/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag, Metatype } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { FieldElement } from "./FieldElement.js";
import { ValueElement } from "./ValueElement.js";

/**
 * A datatype represents a named, standalone type definition.
 */
export interface DatatypeElement extends ValueElement {
    tag: `${DatatypeElement.Tag}`;

    /**
     * A "metatype" provides enough semantics for us to translate a value into
     * a native datatype.  Metatype is only required on global datatypes, and
     * only when the datatype should map directly to a specific native (JS)
     * type.
     */
    metatype?: `${Metatype}`;

    /**
     * You can only reference a datatype by name.  It does not have an ID.
     */
    id?: undefined;

    children?: FieldElement[];
}

export function DatatypeElement(definition: DatatypeElement.Properties, ...children: ValueElement[]) {
    return ValueElement(DatatypeElement.Tag, definition, children) as DatatypeElement;
}

export namespace DatatypeElement {
    export const Tag = ElementTag.Datatype;
    export type Tag = typeof ElementTag.Datatype;
    export type Properties = BaseElement.Properties<DatatypeElement>;

    /**
     * Convert a TypeScript enum to Matter enum values.
     *
     * Matter enums include conformance and other metadata.  They may also have multiple definitions of the same value
     * selectable by conformance.  So we can't use a TypeScript enum directly.
     */
    export function ListValues(values: ValueMap): ListValues {
        const result = Array<FieldElement>();

        for (const [k, v] of Object.entries(values)) {
            if (typeof v === "number") {
                result.push(
                    FieldElement({
                        id: v,
                        name: k,
                        type: "uint8",
                        default: v,
                    }),
                );
            }
        }

        return result;
    }

    /**
     * We express enum values as IntElements as this gives us conformance and other metadata.
     */
    export type ListValues = FieldElement[];

    /**
     * Per the Matter specification, enums are named integers.  The following allows TypeScript enums to be supplied for
     * translation into Matter enums.  To do so, we must accept both numeric and string values.  For generating the
     * Matter enum we ignore the string keys.
     */
    export type ValueMap = { [name: string]: number | string };
}
