/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize } from "#general";
import {
    ClusterModel,
    ClusterVariance,
    Conformance,
    FeatureSelectionViolations,
    MatterModel,
    RequirementModel,
} from "#model";
import { Block } from "../util/TsFile.js";
import { ClusterRequirements } from "./ClusterRequirements.js";
import { reportRequirementLost } from "./ComposedTypeGenerator.js";
import { EndpointFile } from "./EndpointFile.js";

const MANDATORY_PART_ENDPOINTS = ["RootEndpoint", "AggregatorEndpoint", "BridgedNodeEndpoint"];

/**
 * Does the feature selection a device type mandates satisfy every combination the cluster forbids?
 *
 * A cluster that requires a choice is only satisfied by a member of that choice. Counting the mandated features
 * instead would accept a device type that mandates an unrelated feature and ship an endpoint whose feature
 * combination the cluster itself rejects.
 *
 * A cluster we cannot assess keeps the requirement that the application select features itself.
 */
function selectionIsLegal(cluster: ClusterModel, mandated: string[]) {
    if (!mandated.length) {
        return false;
    }

    return FeatureSelectionViolations(cluster, new Set(mandated))?.length === 0;
}

/**
 * Say what the specification actually states about a requirement.
 *
 * A provisional cluster reads as optional here, which is intended and lets an application exercise it and still
 * certify.  Reporting that outcome as though it were the specification's own statement tells the reader the cluster is
 * optional when the specification says it becomes mandatory once the provisional status lifts.
 */
function describeConformance(conformance: Conformance, kind: "mandatory" | "optional") {
    if (kind === "mandatory") {
        return "required by the Matter specification.";
    }

    if (conformance.isProvisional) {
        return `provisional per the Matter specification (conformance ${conformance}), so it is treated as optional.`;
    }

    return "optional per the Matter specification.";
}

type ClusterDetail = {
    requirement: RequirementModel;
    definition: ClusterModel;

    /**
     * Resolved before variance is decided, because a device type that mandates the features a cluster needs has
     * already answered the question variance asks.
     */
    requirements: ClusterRequirements;
};

/**
 * Analyzes endpoint clusters and generates definitions.
 */
export class RequirementGenerator {
    default = Array<string>();
    mandatoryWithExtension?: ClusterModel[];

    #mandatory = Array<ClusterDetail>();
    #optional = Array<ClusterDetail>();
    #mandatoryBlock?: Block;
    #optionalBlock?: Block;
    #requirementsBlock: Block | undefined;
    #mandatoryParts = false;

    constructor(
        private file: EndpointFile,
        private type: "client" | "server",
    ) {
        const matter = file.model.owner(MatterModel);
        if (!matter) {
            throw new Error("Unable to locate root MatterModel");
        }
        const clusterReqs = this.file.model.requirements.filter(r => r.element === `${type}Cluster`);

        if (type === "server" && MANDATORY_PART_ENDPOINTS.includes(file.definitionName)) {
            this.#mandatoryParts = true;
            this.default.push("Parts");
            this.default.push("Index");
        }

        for (const requirement of clusterReqs) {
            const definition = matter.get(ClusterModel, requirement.name);
            if (!definition) {
                reportRequirementLost(
                    `Skipping ${file.model.name} ${type} requirement for unknown cluster ${requirement.name}`,
                );
                continue;
            }

            if (definition.id === undefined || definition.id === 0x1d) {
                // Skip base clusters & descriptor
                continue;
            }

            if (requirement.isDisallowed) {
                continue;
            }

            const requirements = new ClusterRequirements(this.file, definition, requirement);
            const detail = { requirement, definition, requirements };

            if (requirement.isMandatory) {
                const variance = ClusterVariance(definition);

                if (variance.requiresFeatures && !selectionIsLegal(definition, requirements.mandatoryFeatureNames)) {
                    if (!this.mandatoryWithExtension) {
                        this.mandatoryWithExtension = [];
                    }
                    this.mandatoryWithExtension.push(definition);
                } else {
                    this.default.push(definition.name);
                }

                this.#mandatory.push(detail);
            } else {
                this.#optional.push(detail);
            }
        }
    }

    generate() {
        // Nothing below may touch the optional block before the mandatory one, or an empty mandatory block
        // materialises after it
        if (this.#mandatoryParts) {
            this.file.addImport("!node/behavior/system/parts/PartsBehavior.js", "PartsBehavior");
            this.file.addImport("!node/behavior/system/index/IndexBehavior.js", "IndexBehavior");
            this.mandatoryBlock.atom("Parts", "PartsBehavior");
            this.mandatoryBlock.atom("Index", "IndexBehavior");
        }

        for (const detail of this.#mandatory) {
            this.#generateOne(detail, this.mandatoryBlock, "mandatory");
        }

        for (const detail of this.#optional) {
            this.#generateOne(detail, this.optionalBlock, "optional");
        }

        return this.#requirementsBlock;
    }

    reference(name: string, mandatory = true) {
        return `${this.file.requirementsName}.${this.type}.${mandatory ? "mandatory" : "optional"}.${name}`;
    }

    private get mandatoryBlock() {
        if (this.#mandatoryBlock === undefined) {
            this.#mandatoryBlock = this.#requirements.expressions("mandatory: {", "}");
        }
        return this.#mandatoryBlock;
    }

    private get optionalBlock() {
        if (this.#optionalBlock === undefined) {
            this.#optionalBlock = this.#requirements.expressions("optional: {", "}");
        }
        return this.#optionalBlock;
    }

    get #requirements() {
        if (!this.#requirementsBlock) {
            this.#requirementsBlock = this.file.requirements.expressions(`export const ${this.type} = {`, "}");
        }
        return this.#requirementsBlock;
    }

    #generateOne(detail: ClusterDetail, target: Block, kind: "mandatory" | "optional") {
        let name;
        const prefix = `!behaviors/${decamelize(detail.definition.name)}/${detail.definition.name}`;
        if (this.type === "server") {
            name = `${detail.definition.name}Server`;
            this.file.addImport(`${prefix}Server.js`, `${name} as Base${name}`);
        } else {
            name = `${detail.definition.name}Client`;
            this.file.addImport(`${prefix}Client.js`, `${name} as Base${name}`);
        }

        const definition = this.file.definitions.builder(`export const ${name} = Base${name}`);

        const { requirements } = detail;

        let specialized = false;

        if (requirements.mandatoryFeatures.length) {
            specialized = true;
            const extended = definition.expressions("with(", ")");
            for (const feature of requirements.mandatoryFeatures) {
                extended.value(feature);
            }
        }

        if (requirements.defaults) {
            specialized = true;
            const defaults = definition.expressions("set(", ")");
            defaults.value(requirements.defaults);
        }

        if (requirements.alterations) {
            specialized = true;
            const altered = definition.expressions("alter(", ")");
            altered.value(requirements.alterations);
        }

        let documentation = `The ${detail.definition.name} cluster is ${describeConformance(detail.requirement.conformance, kind)}`;

        if (specialized) {
            documentation += `\nThis version of {@link ${name}} is specialized per the specification.`;
        } else {
            documentation += `\nWe provide this alias to the default implementation {@link ${name}} for convenience.`;
        }

        definition.document(documentation);

        target.builder(`${detail.definition.name}: ${name}`);
    }
}
