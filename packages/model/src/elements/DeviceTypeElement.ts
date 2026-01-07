/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification, ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { FieldElement } from "./FieldElement.js";
import { RequirementElement } from "./RequirementElement.js";

/**
 * Details on a specific device as defined in the Matter specification.
 *
 * TODO - extract/merge DeviceTypes.ts?
 */
export interface DeviceTypeElement extends BaseElement {
    tag: `${DeviceTypeElement.Tag}`;
    classification?: `${DeviceClassification}`;
    category?: string;
    children?: (RequirementElement | FieldElement)[];
}

export function DeviceTypeElement(
    definition: DeviceTypeElement.Properties,
    ...children: (RequirementElement | FieldElement)[]
) {
    return BaseElement(DeviceTypeElement.Tag, definition, children) as DeviceTypeElement;
}

export namespace DeviceTypeElement {
    export type Tag = ElementTag.DeviceType;
    export const Tag = ElementTag.DeviceType;
    export type Properties = BaseElement.Properties<DeviceTypeElement>;
}
