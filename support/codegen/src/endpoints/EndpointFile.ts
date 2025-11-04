/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize, Logger } from "#general";
import { DeviceClassification, DeviceTypeModel } from "#model";
import { Block, TsFile } from "../util/TsFile.js";
import { clean } from "../util/file.js";
import { describeList, serialize } from "../util/string.js";
import { RequirementGenerator } from "./RequirementGenerator.js";

const logger = Logger.get("EndpointFile");

const SYSTEM_ENDPOINT_TYPES = new Set(["BridgedNode", "Aggregator"]);

export class EndpointFile extends TsFile {
    definitionName: string;
    requirementsName: string;
    requirements: Block;
    definitions: Block;
    interfaceLocation: Block;

    constructor(
        public model: DeviceTypeModel,
        indices: Record<string, TsFile>,
    ) {
        let path;
        let name;
        let specName;

        let indexName;
        if (model.classification === DeviceClassification.Simple && !SYSTEM_ENDPOINT_TYPES.has(model.name)) {
            specName = model.name;
            name = `${model.name}Device`;
            path = `devices/${decamelize(model.name)}`;
            indexName = "devices";
        } else {
            if (model.name === "RootNode") {
                specName = "Root";
            } else {
                specName = model.name;
            }
            name = `${specName}Endpoint`;
            path = `endpoints/${decamelize(specName)}`;
            indexName = "endpoints";
        }

        super(`!node/${path}`);

        let index = indices[indexName];
        if (index === undefined) {
            index = indices[indexName] = new TsFile(`!node/${indexName}/index`);
        }
        index.addReexport(`${this.name}.js`);

        this.definitionName = name;
        this.requirementsName = `${specName}Requirements`;

        this.interfaceLocation = this.section();

        this.requirements = this.statements(`export namespace ${this.requirementsName} {`, "}");
        this.definitions = this.requirements.section();
        this.undefine(this.definitionName);

        this.generate();
    }

    static clean() {
        clean("!node/endpoints");
        clean("!node/devices");
    }

    private generate() {
        logger.info(`${this.model.name} → ${this.name}.ts`);

        const serverBehaviors = new RequirementGenerator(this, "server");
        const server = serverBehaviors.generate();
        if (server !== undefined) {
            server.document(
                "An implementation for each server cluster supported by the endpoint per the Matter specification.",
            );
        }

        const clientClusters = new RequirementGenerator(this, "client");
        const client = clientClusters.generate();
        if (client !== undefined) {
            client.document(
                "A definition for each client cluster supported by the endpoint per the Matter specification.",
            );
        }

        if (this.model.id === undefined) {
            // For base endpoints (of which I believe there is only one, called
            // "base endpoint") only generate the requirements, no actual
            // endpoint
            const ns = this.statements(`export namespace ${this.definitionName} {`, "}");
            ns.atom(`export const requirements = ${this.requirementsName}`);
        } else {
            this.generateServer(serverBehaviors);
        }
    }

    private generateServer(requirements: RequirementGenerator) {
        this.addImport("!node/endpoint/type/MutableEndpoint.js", "MutableEndpoint");
        const definition = this.expressions(`export const ${this.definitionName}Definition = MutableEndpoint({`, "})");
        definition.atom("name", serialize(this.model.name));
        definition.atom("deviceType", `0x${this.model.id.toString(16)}`);
        definition.atom("deviceRevision", this.model.revision);
        this.addDeviceClass(definition);

        this.atom(`Object.freeze(${this.definitionName}Definition)`);

        this.addImport("!node/endpoint/properties/SupportedBehaviors.js", "SupportedBehaviors");
        definition.atom(`requirements: ${this.requirementsName}`);
        const behaviors = definition.expressions("behaviors: SupportedBehaviors(", ")");

        if (requirements.default.length) {
            for (const behavior of requirements.default) {
                behaviors.atom(requirements.reference(behavior));
            }
        }

        this.addImport("#general", "Identity");
        const intf = this.interfaceLocation.atom(
            `export interface ${this.definitionName} extends Identity<typeof ${this.definitionName}Definition> {}`,
        );
        this.undefine(this.definitionName);
        this.atom(`export const ${this.definitionName}: ${this.definitionName} = ${this.definitionName}Definition`);

        if (requirements.mandatoryWithExtension) {
            // Additional clusters are required
            intf.document(
                this.model,
                `${this.definitionName} requires ${describeList(
                    "and",
                    ...requirements.mandatoryWithExtension.map(c => c.name),
                )} cluster${requirements.mandatoryWithExtension.length === 1 ? "" : "s"} but ${
                    requirements.mandatoryWithExtension.length === 1
                        ? `${requirements.mandatoryWithExtension[0].name} is`
                        : "they are"
                } not added by default because you must select the features your device supports.  You can add manually using ${
                    this.definitionName
                }.with().`,
            );
        } else {
            // Additional clusters are optional
            intf.document(this.model);
        }
    }

    private addDeviceClass(definition: Block) {
        let deviceClass;
        switch (this.model.classification) {
            case DeviceClassification.Dynamic:
                deviceClass = "Dynamic";
                break;

            case DeviceClassification.Node:
                deviceClass = "Node";
                break;

            case DeviceClassification.Utility:
                deviceClass = "Utility";
                break;

            default:
                // "Simple" is the default
                return;
        }

        this.addImport("#model", "DeviceClassification");
        definition.atom("deviceClass", `DeviceClassification.${deviceClass}`);
    }
}
