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
 * A cluster property description.
 */
export interface AttributeElement extends ValueElement {
    tag: `${AttributeElement.Tag}`;
    id: Mei;
}

export function AttributeElement(definition: AttributeElement.Properties, ...children: ValueElement[]) {
    return ValueElement(AttributeElement.Tag, definition, children) as AttributeElement;
}

export namespace AttributeElement {
    export type Tag = ElementTag.Attribute;
    export const Tag = ElementTag.Attribute;
    export type Properties = BaseElement.Properties<AttributeElement>;
}
