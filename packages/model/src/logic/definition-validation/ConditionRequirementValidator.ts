/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConditionRequirementElement } from "../../elements/index.js";
import { ConditionRequirementModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[ConditionRequirementElement.Tag] = class ConditionRequirementValidator extends (
    ModelValidator<ConditionRequirementModel>
) {
    override validate() {
        // TODO we need to validate is as needed. Likely here we can not do that much because we
        //  need an endpoint structure
        this.validateStructure(false);
        super.validate();
    }
};
