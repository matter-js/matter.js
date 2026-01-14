/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticTagElement } from "../../elements/index.js";
import { SemanticTagModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[SemanticTagElement.Tag] = class SemanticTagValidator extends (
    ModelValidator
)<SemanticTagModel> {
    override validate() {
        this.validateStructure(true);

        super.validate();
    }
};
