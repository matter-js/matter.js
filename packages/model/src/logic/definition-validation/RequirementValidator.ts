/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag, FieldValue } from "../../common/index.js";
import { RequirementElement } from "../../elements/index.js";
import { FieldModel, Model, RequirementModel } from "../../models/index.js";
import { RequirementResolver } from "../RequirementResolver.js";
import { ModelValidator } from "./ModelValidator.js";

ModelValidator.validators[RequirementElement.Tag] = class RequirementValidator extends (
    ModelValidator<RequirementModel>
) {
    override validate() {
        this.validateStructure(false, RequirementModel, RequirementModel, FieldModel);
        this.validateProperty({
            name: "element",
            type: RequirementElement.ElementType,
            required: true,
        });

        const { instance } = this.model;
        if (instance !== undefined) {
            if (this.model.element !== RequirementElement.ElementType.DeviceType) {
                this.error(
                    "INSTANCE_NOT_APPLICABLE",
                    `Only a component device type is required in numbered instances, not ${this.model.element}`,
                );
            } else if (this.model.instanceNumber === undefined) {
                this.error(
                    "INVALID_INSTANCE",
                    `Instance ${FieldValue.serialize(instance)} is not a number of an instance, which counts from 1`,
                );
            }
        }

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

        this.model.conformance.validateReferences(this, name => RequirementResolver.resolve(this.model, name));
        this.#validateSatisfiability();

        super.validate();
    }

    /**
     * A requirement naming a feature, attribute, command or event its cluster does not define states something no
     * endpoint can satisfy.  That is wrong model data, so it is reported here once rather than at every endpoint of
     * the device type.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    #validateSatisfiability() {
        if (this.model.isDisallowed) {
            return;
        }

        const cluster = RequirementResolver.clusterOf(this.model);
        if (cluster === undefined) {
            return;
        }

        const { name } = this.model;
        let named: Model | undefined;
        switch (this.model.element) {
            case RequirementElement.ElementType.Feature:
                named = RequirementResolver.featureOf(this.model);
                break;

            case RequirementElement.ElementType.Attribute:
                named = cluster.member(name, [ElementTag.Attribute]);
                break;

            case RequirementElement.ElementType.Command:
                named = cluster.member(name, [ElementTag.Command]);
                break;

            case RequirementElement.ElementType.Event:
                named = cluster.member(name, [ElementTag.Event]);
                break;

            default:
                return;
        }

        if (named === undefined) {
            this.error(
                "UNSATISFIABLE_REQUIREMENT",
                `Cluster ${cluster.name} defines no ${this.model.element} ${name}, so no endpoint can satisfy the requirement`,
            );
        }
    }
};
