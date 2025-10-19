/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventElement } from "../elements/index.js";
import { Model } from "./Model.js";
import { ValueModel } from "./ValueModel.js";

export class EventModel extends ValueModel<EventElement> implements EventElement {
    override tag: EventElement.Tag = EventElement.Tag;
    priority?: EventElement.Priority;

    constructor(definition: Model.Definition<EventModel>, ...children: Model.ChildDefinition<EventModel>[]) {
        super(definition, ...children);

        this.priority = definition.priority as EventElement.Priority;
    }

    override toElement(omitResources = false, extra?: Record<string, unknown>) {
        return super.toElement(omitResources, {
            priority: this.priority,
            ...extra,
        });
    }

    get fabricSensitive(): boolean {
        return this.effectiveAccess.fabricSensitive;
    }

    override get requiredFields() {
        return { ...super.requiredFields, id: this.id };
    }

    static Tag = EventElement.Tag;
    static requiresId = true;
}

EventModel.register();
