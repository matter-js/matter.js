/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";

/**
 * Defines a condition on a device type.  Conditions are named flags that control conformance of cluster
 * requirements when device types are composed.  For example, "TimeSyncCond" on a Root Node means the node
 * needs time synchronization support.
 *
 * Conditions are defined on one device type (e.g. Base) and may be referenced by requirements on other device
 * types using {@link RequirementElement} with element type "condition".
 */
export type ConditionElement = BaseElement & {
    tag: `${ConditionElement.Tag}`;
};

export function ConditionElement(definition: ConditionElement.Properties) {
    return {
        ...BaseElement(ConditionElement.Tag, definition, []),
        tag: ConditionElement.Tag,
    } as ConditionElement;
}

export namespace ConditionElement {
    export type Tag = ElementTag.Condition;
    export const Tag = ElementTag.Condition;
    export type Properties = BaseElement.Properties<ConditionElement>;
}
