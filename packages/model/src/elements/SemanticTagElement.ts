/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";

/**
 * Details a specific semantic tag.
 */
export type SemanticTagElement = BaseElement & {
    id: number;
    tag: `${SemanticTagElement.Tag}`;
    children?: never[];
};

export function SemanticTagElement(definition: SemanticTagElement.Properties) {
    return BaseElement(SemanticTagElement.Tag, definition, []) as SemanticTagElement;
}

export namespace SemanticTagElement {
    export type Tag = ElementTag.SemanticTag;
    export const Tag = ElementTag.SemanticTag;
    export type Properties = BaseElement.Properties<SemanticTagElement>;
}
