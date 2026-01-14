/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access, Conformance, Constraint, Quality } from "../aspects/index.js";
import { ElementTag, FieldValue } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";

/**
 * A base element for all {@link BaseElement}s that represent data values.
 */
export type ValueElement = BaseElement & {
    /**
     * Derived datatypes as defined by the Matter Specification must specify the name of the base type.  This is every
     * type that is not global.
     *
     * Elements may use the shortcut "list[EntryType]" to designate an element as type "list" with a single child that
     * is the entry type.
     */
    type?: string;

    /**
     * Limits on values.
     */
    constraint?: Constraint.Definition;

    /**
     * Optionality control.
     */
    conformance?: Conformance.Definition;

    /**
     * Authorization limits.
     */
    access?: Access.Definition;

    /**
     * Other qualities not covered by conformance or access.
     */
    quality?: Quality.Definition;

    /**
     * Applies to numeric types.
     */
    byteSize?: ValueElement.ByteSize;

    /**
     * The default value for the element.
     */
    default?: FieldValue;

    /**
     * Nested structures that may have data elements include enums, structs and
     * lists.
     */
    children?: ValueElement[];
};

export function ValueElement(tag: ElementTag, definition: ValueElement, children: ValueElement[]) {
    definition = { ...definition };

    if (definition.constraint?.toString().toLowerCase() === "all") {
        delete definition.constraint;
    }

    for (const k of ["conformance", "quality", "access", "quality"]) {
        if ((definition as any)[k] === "") {
            delete (definition as any)[k];
        }
    }

    return BaseElement(tag, definition, children) as ValueElement;
}

export namespace ValueElement {
    export type Properties = BaseElement.Properties<ValueElement & { tag: `${ElementTag}` }>;

    /**
     * The general type of datatype (ignoring size).
     */
    export enum Metatype {
        bool,
        map,
    }

    /**
     * A pool of datatype definitions indexed by name.
     */
    export type Datatypes = { [name: string]: ValueElement };

    /**
     * Valid sizes for ints.
     */
    export type ByteSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

    /**
     * Legal bitmap sizes.  The Matter specification defines enums as extensions of int8 or in16 so the size information
     * is not used for actual enums, just for bitmaps, which are used (somewhat inconsistently) as base types.
     */
    export type BitmapSize = 1 | 2 | 4 | 8;
}
