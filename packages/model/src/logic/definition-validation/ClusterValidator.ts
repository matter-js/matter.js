/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterElement } from "../../elements/index.js";
import { AttributeModel, ClusterModel, CommandModel, DatatypeModel, EventModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[ClusterElement.Tag] = class DeviceTypeValidator extends ModelValidator<ClusterModel> {
    override validate() {
        // Note -- we allow FieldModel in operation schema so it's in the child
        // type but it is not valid for canonical schema
        this.validateStructure(false, DatatypeModel, AttributeModel, CommandModel, EventModel);

        this.validateProperty({ name: "singleton", type: "boolean" });
        this.validateProperty({ name: "classification", type: ClusterElement.Classification });

        if (!this.model.children.length && this.model.type === undefined) {
            this.error("EMPTY_CLUSTER", "Cluster has no elements");
        }

        super.validate();
    }
};
