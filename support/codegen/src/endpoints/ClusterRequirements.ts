/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger } from "#general";
import {
    ClusterModel,
    FieldValue,
    RequirementElement,
    RequirementModel,
    RequirementResolver,
    ValueModel,
} from "#model";
import { EndpointFile } from "./EndpointFile.js";
import { reportRequirementLost } from "./requirement-coverage.js";
import { dispositionOf, RequirementDisposition } from "./requirement-disposition.js";

const logger = Logger.get("ClusterRequirements");

/**
 * A requirement kind nothing handles is a specification statement we are dropping, so it stops the build rather than
 * disappearing.  A new member of {@link RequirementElement.ElementType} lands here until it is given a home.
 */
function unsupportedRequirement(requirement: RequirementModel): never {
    throw new InternalError(
        `No handling for ${requirement.element} requirement ${requirement.name}; every requirement kind must be handled or explicitly skipped`,
    );
}

/**
 * Validates and ingest cluster requirements.
 */
export class ClusterRequirements {
    /**
     * Generator adds these using "Cluster.with" method.
     */
    mandatoryFeatures = Array<string>();

    /**
     * The same features as {@link mandatoryFeatures}, under the names the cluster's feature map uses rather than the
     * titles the generated "with" takes.  Feature legality is stated in terms of these.
     */
    mandatoryFeatureNames = Array<string>();

    /**
     * Generator adds these using "Cluster.alter" method.
     */
    alterations?: { [key: string]: { [key: string]: {} } };

    /**
     * Generator adds these using "Cluster.set" method.
     */
    defaults?: { [key: string]: any };

    constructor(
        private file: EndpointFile,
        private cluster: ClusterModel,
        clusterRequirement: RequirementModel,
    ) {
        for (const requirement of clusterRequirement.requirements) {
            switch (requirement.element) {
                case RequirementElement.ElementType.Feature:
                    this.ingestFeature(requirement);
                    break;

                case RequirementElement.ElementType.Attribute:
                case RequirementElement.ElementType.Command:
                case RequirementElement.ElementType.Event:
                    this.ingestElement(requirement);
                    break;

                case RequirementElement.ElementType.CommandField:
                case RequirementElement.ElementType.ServerCluster:
                case RequirementElement.ElementType.ClientCluster:
                case RequirementElement.ElementType.DeviceType:
                case RequirementElement.ElementType.Condition:
                    // Nested under a cluster requirement these have no meaning we can express, and the specification
                    // does not currently state any
                    reportRequirementLost(
                        `Skipping ${this.file.model.name} ${requirement.element} requirement ${requirement.name} nested in cluster ${this.cluster.name}`,
                    );
                    break;

                default:
                    unsupportedRequirement(requirement);
            }
        }
    }

    private ingestFeature(requirement: RequirementModel) {
        const feature = RequirementResolver.featureOf(requirement);
        if (!feature) {
            reportRequirementLost(
                `Skipping ${this.file.model.name} unknown feature ${requirement.name} for server cluster ${this.cluster.name}`,
            );
            return;
        }

        const disposition = this.#dispositionOf(requirement, feature.conformance.isMandatory);

        if (disposition === RequirementDisposition.Mandate) {
            this.mandatoryFeatures.push(feature.title ?? feature.name);
            this.mandatoryFeatureNames.push(feature.name);
            return;
        }

        if (disposition === RequirementDisposition.Permit || disposition === RequirementDisposition.Unstated) {
            return;
        }

        // A "with" states a feature is on.  Anything else the device type says about a feature has no expression here,
        // so it is reported rather than dropped.
        logger.info(
            `${this.file.model.name} states feature ${feature.name} of ${this.cluster.name} as ${requirement.conformance}, which the generated endpoint cannot express (${disposition})`,
        );
    }

    #dispositionOf(requirement: RequirementModel, clusterMandates: boolean) {
        return dispositionOf(requirement.conformance, {
            clusterMandates,
            deviceRevision: this.file.model.revision,
        });
    }

    private ingestElement(requirement: RequirementModel) {
        const alteration = {} as Record<string, any>;

        const element = RequirementResolver.elementOf(requirement);

        if (!element) {
            reportRequirementLost(
                `Skipping ${this.file.model.name} unknown ${requirement.element} ${requirement.name} for server cluster ${this.cluster.name}`,
            );
            return;
        }

        const clusterMandates = element instanceof ValueModel && element.conformance.isMandatory;

        switch (this.#dispositionOf(requirement, clusterMandates)) {
            case RequirementDisposition.Mandate:
                alteration.optional = false;
                break;

            case RequirementDisposition.Relax:
                alteration.optional = true;
                break;

            default:
                // Nothing the device type says about this element changes whether it is required
                break;
        }

        if (requirement.default !== undefined) {
            alteration.default = requirement.default;
        }

        if (requirement.constraint) {
            // A bound this states is a value of the element's own type, and the alteration carries it as a number, so a
            // magnitude a number cannot state states nothing here
            const value = FieldValue.numericValue(requirement.constraint.value);
            if (typeof value === "number") {
                alteration.min = value;
                alteration.max = value;
                alteration.default ??= value;
            } else if (value === undefined) {
                const min = FieldValue.numericValue(requirement.constraint.min);
                if (typeof min === "number") {
                    alteration.min = min;
                }
                const max = FieldValue.numericValue(requirement.constraint.max);
                if (typeof max === "number") {
                    alteration.max = max;
                }
            }
        }

        if (!Object.keys(alteration).length) {
            return;
        }

        if (Object.keys(alteration).length !== 1 || alteration.default === undefined) {
            if (!this.alterations) {
                this.alterations = {};
            }
            let elementSet = this.alterations[`${requirement.element}s`];
            if (!elementSet) {
                elementSet = this.alterations[`${requirement.element}s`] = {};
            }
            elementSet[requirement.propertyName] = alteration;
        } else {
            if (!this.defaults) {
                this.defaults = {};
            }
            this.defaults[requirement.propertyName] = alteration.default;
        }
    }
}
