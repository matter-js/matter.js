/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricElement } from "../../elements/index.js";
import { FabricModel, FieldModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[FabricElement.Tag] = class AttributeValidator extends ModelValidator<FabricModel> {
    override validate() {
        this.validateStructure(true, FieldModel);
        super.validate();
    }
};
