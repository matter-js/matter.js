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

        this.validateProperty({ name: "location", type: RequirementElement.Location });
        if (this.model.location !== undefined && this.model.element !== RequirementElement.ElementType.Condition) {
            this.error(
                "LOCATION_NOT_APPLICABLE",
                `Only a condition requirement states where its condition holds, not ${this.model.element}`,
            );
        }

        const { parent } = this.model;
        if (parent) {
            switch (this.model.element) {
                case RequirementElement.ElementType.ClientCluster:
                case RequirementElement.ElementType.ServerCluster:
                    if (
                        parent.tag !== ElementTag.DeviceType &&
                        !(
                            parent instanceof RequirementModel &&
                            parent.element === RequirementElement.ElementType.DeviceType
                        )
                    ) {
                        this.error(
                            "ILLEGAL_REQUIREMENT_PARENT",
                            `${this.model.element} requirement ${this.model.name} must be parented by a device type or component requirement`,
                        );
                    }
                    break;

                case RequirementElement.ElementType.Feature:
                case RequirementElement.ElementType.Attribute:
                case RequirementElement.ElementType.Command:
                case RequirementElement.ElementType.Event:
                case RequirementElement.ElementType.CommandField:
                    if (
                        !(parent instanceof RequirementModel) ||
                        (parent.element !== RequirementElement.ElementType.ServerCluster &&
                            parent.element !== RequirementElement.ElementType.ClientCluster)
                    ) {
                        this.error(
                            "ILLEGAL_REQUIREMENT_PARENT",
                            `${this.model.element} requirement ${this.model.name} must be parented by a server or client cluster requirement`,
                        );
                    }
                    break;
            }
        }

        this.#validateConformanceNames();
        this.#validateReferent();

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
     * The condition, component device type, cluster or cluster member a requirement names must resolve, or the
     * requirement states something no endpoint can meet. That is wrong model data, so it is reported here once rather
     * than at every endpoint of the device type.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    #validateReferent() {
        // A prohibition holds for a referent that does not exist. We accept missing a typo in one because a strict rule
        // would stop model generation on a specification row disallowing what a cluster no longer defines
        if (this.model.isDisallowed) {
            return;
        }

        const { element } = this.model;
        switch (element) {
            case RequirementElement.ElementType.Condition:
                // A stated type that does not resolve is already reported as an unknown type
                if (this.model.type === undefined && RequirementResolver.conditionOf(this.model) === undefined) {
                    this.error(
                        "UNRESOLVED_CONDITION",
                        `No condition ${this.model.name} is declared by the device type, its bases or the base device type`,
                    );
                }
                break;

            case RequirementElement.ElementType.DeviceType:
                if (RequirementResolver.deviceTypeOf(this.model) === undefined) {
                    this.error(
                        "UNRESOLVED_DEVICE_TYPE",
                        `No device type ${this.#identity} is defined for this component requirement`,
                    );
                }
                break;

            case RequirementElement.ElementType.ServerCluster:
            case RequirementElement.ElementType.ClientCluster:
                if (RequirementResolver.clusterOf(this.model) === undefined) {
                    this.error(
                        "UNRESOLVED_CLUSTER",
                        `No cluster ${this.#identity} is defined for this ${element} requirement`,
                    );
                }
                break;

            case RequirementElement.ElementType.Feature:
                this.#validateMember(RequirementResolver.featureOf(this.model));
                break;

            case RequirementElement.ElementType.Attribute:
            case RequirementElement.ElementType.Command:
            case RequirementElement.ElementType.Event:
                this.#validateMember(RequirementResolver.elementOf(this.model));
                break;

            case RequirementElement.ElementType.CommandField:
                this.#validateMember(RequirementResolver.commandFieldOf(this.model));
                break;

            default:
                // An element that is not an element type is already reported by the property validation
                element satisfies never;
        }
    }

    #validateMember(member: Model | undefined) {
        if (member !== undefined) {
            return;
        }

        // Without a cluster the enclosing cluster requirement is what is wrong, and it reports itself
        const cluster = RequirementResolver.clusterOf(this.model);
        if (cluster === undefined) {
            return;
        }

        this.error(
            "UNSATISFIABLE_REQUIREMENT",
            `Cluster ${cluster.name} defines no ${this.model.element} ${this.model.name}, so no endpoint can satisfy the requirement`,
        );
    }

    get #identity() {
        const { name, id } = this.model;
        return id === undefined ? name : `${name} (0x${id.toString(16)})`;
    }
};
