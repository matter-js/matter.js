/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticNamespaceElement } from "../../elements/index.js";
import { SemanticNamespaceModel, SemanticTagModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[SemanticNamespaceElement.Tag] = class SemanticNamespaceValidator extends (
    ModelValidator
)<SemanticNamespaceModel> {
    override validate() {
        this.validateStructure(true, SemanticTagModel);

        super.validate();
    }
};
