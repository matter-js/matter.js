/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldElement } from "../../elements/index.js";
import { FieldModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValueValidator } from "./ValueValidator.js";

ModelValidator.validators[FieldElement.Tag] = class AttributeValidator extends ValueValidator<FieldModel> {
    override validate() {
        this.validateStructure(false, FieldModel);
        super.validate();
    }
};
