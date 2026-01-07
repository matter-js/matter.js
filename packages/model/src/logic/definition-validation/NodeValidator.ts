/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeElement } from "../../elements/index.js";
import { EndpointModel, NodeModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[NodeElement.Tag] = class NodeValidator extends ModelValidator<NodeModel> {
    override validate() {
        this.validateStructure(true, EndpointModel);

        super.validate();
    }
};
