/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointElement } from "../../elements/index.js";
import { EndpointModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[EndpointElement.Tag] = class EndpointValidator extends ModelValidator<EndpointModel> {
    override validate() {
        this.validateStructure(true, EndpointModel);
        super.validate();
    }
};
