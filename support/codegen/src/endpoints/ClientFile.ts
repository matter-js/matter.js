/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize, Logger } from "#general";
import { ClusterModel } from "#model";
import { TsFile } from "../util/TsFile.js";

const logger = Logger.get("BehaviorServerFile");

export class ClientFile extends TsFile {
    static readonly baseName = "Client";
    readonly definitionName: string;

    constructor(
        name: string,
        public cluster: ClusterModel,
    ) {
        super(name);
        this.definitionName = `${cluster.name}Client`;
        this.cluster = cluster;

        this.generate();
    }

    private generate() {
        logger.info(`${this.cluster.name} → ${this.name}.ts`);

        const constructorName = `${this.definitionName}Constructor`;

        this.addImport(`#clusters/${decamelize(this.cluster.name)}`, this.cluster.name);
        this.addImport("!node/behavior/cluster/ClientBehavior.js", "ClientBehavior");
        const constructor = this.expressions(`export const ${constructorName} = ClientBehavior(`, ")");
        constructor.atom(`${this.cluster.name}.Complete`);
        this.atom(`export interface ${this.definitionName} extends InstanceType<typeof ${constructorName}> {}`);

        this.addImport("#general", "Identity");
        this.undefine(constructorName);
        this.atom(`export interface ${constructorName} extends Identity<typeof ${constructorName}> {}`);

        this.undefine(this.definitionName);
        this.atom(`export const ${this.definitionName}: ${constructorName} = ${constructorName}`);
    }
}
