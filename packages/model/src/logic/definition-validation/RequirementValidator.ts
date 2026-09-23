/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag, FieldValue } from "../../common/index.js";
import { RequirementElement } from "../../elements/index.js";
import { ConditionModel, FieldModel, Model, RequirementModel } from "../../models/index.js";
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

        this.validateProperty({ name: "location", type: RequirementElement.Location });
        if (this.model.location !== undefined && this.model.element !== RequirementElement.ElementType.Condition) {
            this.error(
                "LOCATION_NOT_APPLICABLE",
                `Only a condition requirement states where its condition holds, not ${this.model.element}`,
            );
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

        this.#validateConformanceNames();
        this.#validateCondition();
        this.#validateComponent();
        this.#validateSatisfiability();

        super.validate();
    }

    /**
     * Every name the conformance references must resolve, and must be spelled exactly as its declaration.
     *
     * Names resolve regardless of case, but evaluating a requirement's conformance against the names true for an
     * endpoint matches them exactly. A name spelled in another case would therefore validate and then never match,
     * leaving the requirement silently unenforced.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    #validateConformanceNames() {
        const misspelled = new Map<string, string>();

        this.model.conformance.validateReferences(this, name => {
            const resolved = RequirementResolver.resolve(this.model, name);
            if (resolved !== undefined) {
                const stated = typeof name === "string" ? name : name.join(".");
                const declared = typeof name === "string" ? resolved.name : `${resolved.parent?.name}.${resolved.name}`;
                if (stated !== declared) {
                    misspelled.set(stated, declared);
                }
            }
            return resolved;
        });

        for (const [stated, declared] of misspelled) {
            this.error(
                "NONCANONICAL_CONFORMANCE_NAME",
                `Conformance name "${stated}" must be spelled "${declared}" as declared, or evaluation never matches it`,
            );
        }
    }

    /**
     * A condition requirement must name a condition, or the condition it means to assert is never asserted. A
     * requirement stating a type is already reported when the type does not resolve, so this answers for a
     * requirement identified by its name alone.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    #validateCondition() {
        if (this.model.element !== RequirementElement.ElementType.Condition || this.model.type !== undefined) {
            return;
        }

        if (!(RequirementResolver.resolve(this.model, this.model.name) instanceof ConditionModel)) {
            this.error(
                "UNRESOLVED_CONDITION",
                `No condition ${this.model.name} is declared by the device type, its bases or the base device type`,
            );
        }
    }

    /**
     * A component requirement must name a device type the model defines. Otherwise the requirements nested in it have
     * no device type to resolve conditions against and can name only universal and qualified conditions.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    #validateComponent() {
        if (
            this.model.element === RequirementElement.ElementType.DeviceType &&
            RequirementResolver.deviceTypeOf(this.model) === undefined
        ) {
            const identity = this.model.id === undefined ? "" : ` (0x${this.model.id.toString(16)})`;
            this.error(
                "UNRESOLVED_DEVICE_TYPE",
                `No device type ${this.model.name}${identity} is defined for this component requirement`,
            );
        }
    }

    /**
     * A requirement naming a feature, attribute, command or event its cluster does not define states something no
     * endpoint can satisfy. That is wrong model data, so it is reported here once rather than at every endpoint of
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

        let named: Model | undefined;
        switch (this.model.element) {
            case RequirementElement.ElementType.Feature:
                named = RequirementResolver.featureOf(this.model);
                break;

            case RequirementElement.ElementType.Attribute:
            case RequirementElement.ElementType.Command:
            case RequirementElement.ElementType.Event:
                named = RequirementResolver.elementOf(this.model);
                break;

            default:
                return;
        }

        if (named === undefined) {
            this.error(
                "UNSATISFIABLE_REQUIREMENT",
                `Cluster ${cluster.name} defines no ${this.model.element} ${this.model.name}, so no endpoint can satisfy the requirement`,
            );
        }
    }
};
