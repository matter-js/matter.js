/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "../../common/index.js";
import { RequirementElement } from "../../elements/index.js";
import { FieldModel, RequirementModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[RequirementElement.Tag] = class RequirementValidator extends (
    ModelValidator
)<RequirementModel> {
    override validate() {
        this.validateStructure(false, RequirementModel, RequirementModel, FieldModel);
        this.validateProperty({
            name: "element",
            type: RequirementElement.ElementType,
            required: true,
        });

        const parentTag = this.model.parent?.tag;
        if (parentTag) {
            switch (this.model.element) {
                case RequirementElement.ElementType.ClientCluster:
                case RequirementElement.ElementType.ServerCluster:
                    if (
                        parentTag !== ElementTag.DeviceType &&
                        (parentTag !== ElementTag.Requirement ||
                            (this.model.parent as RequirementModel).element !==
                                RequirementElement.ElementType.DeviceType)
                    ) {
                        this.error(
                            "ILLEGAL_REQUIREMENT_PARENT",
                            `Requirement type ${this.model.type} must be parented by device type or device requirement`,
                        );
                    }
                    break;

                case RequirementElement.ElementType.Feature:
                case RequirementElement.ElementType.Attribute:
                case RequirementElement.ElementType.Command:
                case RequirementElement.ElementType.Event:
                    if (parentTag !== ElementTag.Requirement) {
                        this.error(
                            "ILLEGAL_REQUIREMENT_PARENT",
                            `Requirement type ${this.model.type} must be parented by cluster requirement`,
                        );
                    }
                    break;
            }
        }

        // Skip type validation for condition requirements — their type is a cross-reference
        // (e.g. "RootNode.AclExtensionCond") not a resolvable model type
        if (this.model.element === RequirementElement.ElementType.Condition) {
            return;
        }

        super.validate();
    }
};
