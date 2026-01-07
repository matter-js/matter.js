/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticNamespaceElement, SemanticTagElement } from "../index.js";
import { AnyValueElement } from "./AnyValueElement.js";
import { BaseElement } from "./BaseElement.js";
import { ClusterElement } from "./ClusterElement.js";
import { DeviceTypeElement } from "./DeviceTypeElement.js";
import { EndpointElement } from "./EndpointElement.js";
import { FabricElement } from "./FabricElement.js";
import { MatterElement } from "./MatterElement.js";
import { NodeElement } from "./NodeElement.js";
import { RequirementElement } from "./RequirementElement.js";

/**
 * Any Matter element.
 */
export type AnyElement =
    | AnyValueElement
    | ClusterElement
    | DeviceTypeElement
    | RequirementElement
    | EndpointElement
    | FabricElement
    | NodeElement
    | SemanticTagElement
    | SemanticNamespaceElement
    | MatterElement;

export namespace AnyElement {
    /**
     * General definition for an element factory function.
     */
    export interface Type<T = BaseElement> {
        (definition: T): AnyElement;
        Tag: string;
    }
}
