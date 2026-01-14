/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterElement } from "../../elements/index.js";
import { MatterModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[MatterElement.Tag] = class MatterValidator extends ModelValidator<MatterModel> {
    override validate() {
        this.validateStructure(false);
        this.validateProperty({ name: "version", type: "string" });

        super.validate();
    }
};
