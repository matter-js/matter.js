/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventElement } from "../../elements/index.js";
import { EventModel, FieldModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValueValidator } from "./ValueValidator.js";

ModelValidator.validators[EventElement.Tag] = class EventValidator extends ValueValidator<EventModel> {
    override validate() {
        this.validateStructure(true, FieldModel);
        this.validateProperty({ name: "priority", type: EventElement.Priority, required: true });
        super.validate();
    }
};
