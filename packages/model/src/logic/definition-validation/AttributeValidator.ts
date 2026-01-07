/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement } from "../../elements/index.js";
import { AttributeModel, FieldModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValueValidator } from "./ValueValidator.js";

ModelValidator.validators[AttributeElement.Tag] = class AttributeValidator extends ValueValidator<AttributeModel> {
    override validate() {
        this.validateStructure(true, FieldModel);

        super.validate();
    }
};
