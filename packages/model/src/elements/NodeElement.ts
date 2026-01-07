/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { EndpointElement } from "./EndpointElement.js";

/**
 * Runtime representation of a node.
 */
export type NodeElement = BaseElement & {
    id: number;
    tag: `${NodeElement.Tag}`;
    children?: EndpointElement[];
};

export function NodeElement(definition: NodeElement.Properties, ...children: EndpointElement[]) {
    return BaseElement(NodeElement.Tag, definition, children) as NodeElement;
}

export namespace NodeElement {
    export type Tag = ElementTag.Node;
    export const Tag = ElementTag.Node;
    export type Properties = BaseElement.Properties<NodeElement>;
}
