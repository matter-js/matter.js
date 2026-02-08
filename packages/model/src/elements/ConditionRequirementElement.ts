/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { Conformance } from "../index.js";
import { BaseElement } from "./BaseElement.js";

/**
 * Describes a condition conformance override for a device type.  These specify that a condition defined elsewhere
 * has a specific conformance when applied to a particular device type composition.
 */
export type ConditionRequirementElement = BaseElement & {
    tag: `${ConditionRequirementElement.Tag}`;

    /**
     * The condition being overridden.
     */
    condition: string;

    /**
     * The device type ID this applies to.
     */
    deviceTypeId?: number;

    /**
     * The device type name this applies to.
     */
    deviceTypeName?: string;

    /**
     * Where the condition applies (e.g. "Root", "App").
     */
    location?: string;

    conformance?: Conformance.Definition;
};

export function ConditionRequirementElement(definition: ConditionRequirementElement.Properties) {
    return {
        ...BaseElement(ConditionRequirementElement.Tag, definition, []),
        tag: ConditionRequirementElement.Tag,
    } as ConditionRequirementElement;
}

export namespace ConditionRequirementElement {
    export type Tag = ElementTag.ConditionRequirement;
    export const Tag = ElementTag.ConditionRequirement;
    export type Properties = BaseElement.Properties<ConditionRequirementElement>;
}
