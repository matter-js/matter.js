/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatatypeElement } from "../../elements/DatatypeElement.js";
import { FieldModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValueValidator } from "./ValueValidator.js";

ModelValidator.validators[DatatypeElement.Tag] = class AttributeValidator extends ValueValidator<FieldModel> {
    override validate() {
        this.validateStructure(false, FieldModel);
        super.validate();
    }
};
