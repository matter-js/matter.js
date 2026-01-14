/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { NodeElement } from "./NodeElement.js";

/**
 * Runtime representation of a fabric.
 */
export interface FabricElement extends BaseElement {
    id: number;
    tag: `${FabricElement.Tag}`;
    children: NodeElement[];
}

export function FabricElement(definition: FabricElement.Properties, ...children: NodeElement[]) {
    return BaseElement(FabricElement.Tag, definition, children);
}

export namespace FabricElement {
    export type Tag = ElementTag.Fabric;
    export const Tag = ElementTag.Fabric;
    export type Properties = BaseElement.Properties<FabricElement>;
}
