/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { SemanticTagElement } from "./SemanticTagElement.js";

/**
 * Details a specific semantic tag.
 */
export type SemanticNamespaceElement = BaseElement & {
    id: number;
    tag: `${SemanticNamespaceElement.Tag}`;
    children?: SemanticTagElement[];
    mfgCode?: number;
};

export function SemanticNamespaceElement(
    definition: SemanticNamespaceElement.Properties,
    ...children: SemanticTagElement[]
) {
    return BaseElement(SemanticNamespaceElement.Tag, definition, children) as SemanticNamespaceElement;
}

export namespace SemanticNamespaceElement {
    export type Tag = ElementTag.SemanticNamespace;
    export const Tag = ElementTag.SemanticNamespace;
    export type Properties = BaseElement.Properties<SemanticNamespaceElement>;
}
