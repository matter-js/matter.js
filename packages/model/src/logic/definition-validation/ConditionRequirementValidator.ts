/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConditionElement } from "../../elements/index.js";
import { ConditionModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[ConditionElement.Tag] = class ConditionValidator extends ModelValidator<ConditionModel> {
    override validate() {
        // TODO we need to validate as needed. Likely here we can not do that much because we
        //  need an endpoint structure
        this.validateStructure(false);
        super.validate();
    }
};
