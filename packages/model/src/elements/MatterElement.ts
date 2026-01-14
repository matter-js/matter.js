/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag, type Specification } from "../common/index.js";
import { AttributeElement } from "./AttributeElement.js";
import { BaseElement } from "./BaseElement.js";
import { ClusterElement } from "./ClusterElement.js";
import { DatatypeElement } from "./DatatypeElement.js";
import { DeviceTypeElement } from "./DeviceTypeElement.js";
import { FabricElement } from "./FabricElement.js";
import { FieldElement } from "./FieldElement.js";
import { SemanticNamespaceElement } from "./SemanticNamespaceElement.js";

/**
 * The root model element.
 */
export type MatterElement = BaseElement & {
    tag: `${ElementTag.Matter}`;
    revision?: Specification.Revision;
    children: MatterElement.Child[];
};

export function MatterElement(definition: MatterElement.Definition, ...children: MatterElement.Child[]) {
    return BaseElement(MatterElement.Tag, { name: "Matter", children: [], ...definition }, children) as MatterElement;
}

export namespace MatterElement {
    export type Tag = ElementTag.Matter;
    export const Tag = ElementTag.Matter;
    export type Properties = BaseElement.Properties<MatterElement>;
    export type Definition = Omit<MatterElement.Properties, "name" | "children"> & {
        name?: string;
        children?: MatterElement.Properties["children"];
    };

    export type Child =
        | ClusterElement
        | DeviceTypeElement
        | FabricElement
        | DatatypeElement
        | FieldElement
        | AttributeElement
        | SemanticNamespaceElement;
}
