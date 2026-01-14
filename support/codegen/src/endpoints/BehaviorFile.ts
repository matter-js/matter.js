/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize, Logger } from "#general";
import { ClusterModel, ClusterVariance } from "#model";
import { TsFile } from "../util/TsFile.js";

const logger = Logger.get("BehaviorFile");

export class BehaviorFile extends TsFile {
    static readonly baseName = "Behavior";
    readonly definitionName: string;
    #variance: ClusterVariance;

    constructor(
        name: string,
        public cluster: ClusterModel,
        variance: ClusterVariance,
    ) {
        super(name);
        this.definitionName = `${cluster.name}Behavior`;
        this.cluster = cluster;
        this.#variance = variance;

        this.generate();
    }

    private generate() {
        logger.info(`${this.cluster.name} → ${this.name}.ts`);

        this.addImport(`#clusters/${decamelize(this.cluster.name)}`, this.cluster.name);
        this.addImport("!node/behavior/cluster/ClusterBehavior.js", "ClusterBehavior");

        const constructorName = `${this.definitionName}Constructor`;

        const builder = this.builder(`export const ${constructorName} = ClusterBehavior`);

        // Install the interface if there are commands
        const definingCluster = this.#variance.cluster;
        if (definingCluster.commands.length) {
            const interfaceName = `${definingCluster.name}Interface`;

            if (definingCluster === this.cluster) {
                // The cluster defines its own interface
                this.addImport(`./${interfaceName}.js`, interfaceName);
            } else {
                // This is an alias so just import the interface of the base cluster
                this.addImport(`../${decamelize(definingCluster.name)}/${interfaceName}.js`, interfaceName);
            }

            builder.atom(`withInterface<${interfaceName}>()`);
        }

        // Inject the cluster and appropriate documentation
        let extraDocs;
        if (this.#variance.requiresFeatures) {
            this.addImport(`#types`, "ClusterType");
            builder.atom(`for(ClusterType(${this.cluster.name}.Base))`);
            extraDocs =
                `${this.cluster.name}.Cluster requires you to enable one or more optional features.  ` +
                `You can do so using {@link ${this.definitionName}.with}.`;
        } else {
            builder.atom(`for(${this.cluster.name}.Cluster)`);
            if (Object.keys(this.#variance.components).length) {
                extraDocs =
                    `This class does not have optional features of ${this.cluster.name}.Cluster enabled.  ` +
                    `You can enable additional features using ${this.definitionName}.with.`;
            }
        }

        builder.document(
            `${this.definitionName} is the base class for objects that support interaction with {@link ${this.cluster.name}.Cluster}.`,
            extraDocs,
        );

        // Export the constructor
        this.file.addImport("#general", "Identity");
        this.undefine(constructorName);
        this.atom(`export interface ${constructorName} extends Identity<typeof ${constructorName}> {}`);
        this.atom(`export const ${this.definitionName}: ${constructorName} = ${constructorName}`);

        // Behavior is a generated class so we need to define types for it to act like a real class in typescript
        this.undefine(`${this.definitionName}`);
        this.atom(`export interface ${this.definitionName} extends InstanceType<${constructorName}> {}`);

        // We also need to generate an interface for State
        const ns = this.expressions(`export namespace ${this.definitionName} {`, "}");
        ns.atom(`export interface State extends InstanceType<typeof ${this.definitionName}.State> {}`);
    }
}
