/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize, Logger } from "#general";
import { ClusterModel, ClusterVariance, MatterModel, RequirementModel } from "#model";
import { Block } from "../util/TsFile.js";
import { ClusterRequirements } from "./ClusterRequirements.js";
import { EndpointFile } from "./EndpointFile.js";

const logger = Logger.get("EndpointClusterGenerator");

const MANDATORY_PART_ENDPOINTS = ["RootEndpoint", "AggregatorEndpoint", "BridgedNodeEndpoint"];

type ClusterDetail = {
    requirement: RequirementModel;
    definition: ClusterModel;
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
                logger.error(`Skipping ${file.model.name} ${type} requirement for unknown cluster ${requirement.name}`);
                continue;
            }

            if (definition.id === undefined || definition.id === 0x1d) {
                // Skip base clusters & descriptor
                continue;
            }

            if (requirement.isMandatory || requirement.name === "Descriptor") {
                const variance = ClusterVariance(definition);
                if (variance.requiresFeatures) {
                    if (!this.mandatoryWithExtension) {
                        this.mandatoryWithExtension = [];
                    }
                    this.mandatoryWithExtension.push(definition);
                } else {
                    this.default.push(definition.name);
                }

                this.#mandatory.push({ requirement, definition });
            } else {
                this.#optional.push({ requirement, definition });
            }
        }
    }

    generate() {
        if (this.#mandatoryParts) {
            this.file.addImport("!node/behavior/system/parts/PartsBehavior.js", "PartsBehavior");
            this.file.addImport("!node/behavior/system/index/IndexBehavior.js", "IndexBehavior");
            this.mandatoryBlock.atom("Parts", "PartsBehavior");
            this.mandatoryBlock.atom("Index", "IndexBehavior");
        }

        for (const detail of this.#mandatory) {
            this.#generateOne(detail, this.mandatoryBlock);
        }

        for (const detail of this.#optional) {
            this.#generateOne(detail, this.optionalBlock);
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

    #generateOne(detail: ClusterDetail, target: Block) {
        let name;
        const prefix = `!behaviors/${decamelize(detail.definition.name)}/${detail.definition.name}`;
        if (this.type === "server") {
            name = `${detail.definition.name}Server`;
            this.file.addImport(`${prefix}Server.js`, `${name} as Base${name}`);
        } else {
            name = `${detail.definition.name}Behavior`;
            this.file.addImport(`${prefix}Behavior.js`, `${name} as Base${name}`);
        }

        const definition = this.file.definitions.builder(`export const ${name} = Base${name}`);

        const requirements = new ClusterRequirements(this.file, detail.definition, detail.requirement);

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

        const requiredOrMandatory = target === this.mandatoryBlock ? "required by" : "optional per";

        let documentation = `The ${detail.definition.name} cluster is ${requiredOrMandatory} the Matter specification.`;

        if (specialized) {
            documentation += `\nThis version of {@link ${name}} is specialized per the specification.`;
        } else {
            documentation += `\nWe provide this alias to the default implementation {@link ${name}} for convenience.`;
        }

        definition.document(documentation);

        target.builder(`${detail.definition.name}: ${name}`);
    }
}
