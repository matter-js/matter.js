/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandElement } from "../../elements/index.js";
import { CommandModel, FieldModel, ValueModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[CommandElement.Tag] = class CommandValidator extends ModelValidator<CommandModel> {
    override validate() {
        this.validateStructure(true, FieldModel);
        this.validateProperty({
            name: "effectiveDirection",
            type: CommandElement.Direction,
            required: true,
        });
        this.validateProperty({
            name: "response",
            type: "string",
        });

        const response = this.model.response;
        if (response && response !== "status") {
            const responseModel = this.model.responseModel;
            if (!responseModel) {
                this.error("RESPONSE_NOT_FOUND", `response type ${response} not found`);
            } else if (!(responseModel instanceof ValueModel)) {
                this.error("INVALID_RESPONSE_TYPE", `response type ${response} is not a ValueModel`);
            }
        }

        super.validate();
    }
};
