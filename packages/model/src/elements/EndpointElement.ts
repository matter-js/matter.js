/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { DeviceTypeElement } from "./DeviceTypeElement.js";

/**
 * Runtime representation of an endpoint.
 */
export interface EndpointElement extends BaseElement {
    id: number;
    tag: `${EndpointElement.Tag}`;
    children: DeviceTypeElement[];
}

export function EndpointElement(definition: EndpointElement.Properties, ...children: DeviceTypeElement[]) {
    return BaseElement(EndpointElement.Tag, definition, children) as EndpointElement;
}

export namespace EndpointElement {
    export type Tag = ElementTag.Endpoint;
    export const Tag = ElementTag.Endpoint;
    export type Properties = BaseElement.Properties<DeviceTypeElement>;
}
