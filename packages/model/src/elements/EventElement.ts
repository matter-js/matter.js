/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mei } from "../common/Mei.js";
import { ElementTag } from "../common/index.js";
import { BaseElement } from "./BaseElement.js";
import { ValueElement } from "./ValueElement.js";

/**
 * An event is triggered by endpoints.
 */
export interface EventElement extends ValueElement {
    id: Mei;
    tag: `${EventElement.Tag}`;

    // Priority is required but we handle missing priority in validation
    priority?: `${EventElement.Priority}`;
}

export function EventElement(definition: EventElement.Properties, ...children: ValueElement[]) {
    return ValueElement(EventElement.Tag, definition, children) as EventElement;
}

export namespace EventElement {
    export type Tag = ElementTag.Event;
    export const Tag = ElementTag.Event;
    export type Properties = BaseElement.Properties<EventElement>;

    /**
     * Event priority as defined in Matter specification.
     */
    export enum Priority {
        Debug = "debug",
        Info = "info",
        Critical = "critical",
    }

    /**
     * Event priority mapped to official ID.
     */
    export enum PriorityId {
        debug = 0,
        info = 1,
        critical = 2,
    }
}

export const Debug = EventElement.Priority.Debug;
export const Info = EventElement.Priority.Info;
export const Critical = EventElement.Priority.Critical;
