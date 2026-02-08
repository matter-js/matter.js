/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "../../common/DeviceClassification.js";
import { DeviceTypeElement } from "../../elements/index.js";
import { ConditionRequirementModel, DeviceTypeModel, FieldModel, RequirementModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[DeviceTypeElement.Tag] = class DeviceTypeValidator extends ModelValidator<DeviceTypeModel> {
    override validate() {
        this.validateStructure(false, DeviceTypeModel, RequirementModel, FieldModel, ConditionRequirementModel);
        this.validateProperty({
            name: "classification",
            type: DeviceClassification,
        });

        super.validate();
    }
};
