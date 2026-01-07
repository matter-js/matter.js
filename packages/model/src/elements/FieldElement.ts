/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mei } from "../common/Mei.js";
import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { ValueElement } from "./ValueElement.js";

/**
 * A field element defines a field in a list, struct, enum or bitmap.
 */
export interface FieldElement extends ValueElement {
    tag: `${FieldElement.Tag}`;

    /**
     * Fields must have IDs but they may be implied by the field's position in its parent.
     */
    id?: Mei;

    /**
     * Alternate field name.
     *
     * This is used for the full name of feature bitfields.
     */
    title?: string;

    children?: FieldElement[];
}

export function FieldElement(definition: FieldElement.Properties, ...children: FieldElement[]) {
    // Support legacy long name definition
    if (definition.title === undefined && definition.description && definition.name.match(/^[A-Z_]+$/)) {
        definition.title = definition.description;
        delete definition.description;
    }

    return ValueElement(FieldElement.Tag, definition, children) as FieldElement;
}

export namespace FieldElement {
    export type Tag = ElementTag.Field;
    export const Tag = ElementTag.Field;
    export type Properties = BaseElement.Properties<FieldElement>;
}
