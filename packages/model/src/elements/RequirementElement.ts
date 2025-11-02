/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { Access, Conformance, Constraint, FieldElement, Quality } from "../index.js";
import { BaseElement } from "./BaseElement.js";

/**
 * Describes a cluster or cluster element requirement for a device.
 */
export type RequirementElement = BaseElement & {
    tag: `${RequirementElement.Tag}`;

    /**
     * Requirement element type.
     */
    element: `${RequirementElement.ElementType}`;

    constraint?: Constraint.Definition;
    access?: Access.Definition;
    quality?: Quality.Definition;
    conformance?: Conformance.Definition;
    default?: any;

    children?: (RequirementElement | FieldElement)[];
};

export function RequirementElement(
    definition: RequirementElement.Properties,
    ...children: (RequirementElement | FieldElement)[]
) {
    return {
        ...BaseElement(RequirementElement.Tag, definition, children),
        tag: RequirementElement.Tag,
    } as RequirementElement;
}

export namespace RequirementElement {
    export type Tag = ElementTag.Requirement;
    export const Tag = ElementTag.Requirement;
    export type Properties = BaseElement.Properties<RequirementElement>;

    export enum ElementType {
        ClientCluster = "clientCluster",
        ServerCluster = "serverCluster",
        Feature = "feature",
        Attribute = "attribute",
        Command = "command",
        Event = "event",
        CommandField = "commandField",
        DeviceType = "deviceType",
    }
}
