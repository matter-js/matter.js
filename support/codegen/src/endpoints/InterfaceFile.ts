/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { ClusterModel, ClusterVariance } from "#model";
import { ScopeFile } from "../util/ScopeFile.js";
import { Block } from "../util/TsFile.js";
import { InterfaceGenerator } from "./InterfaceGenerator.js";

const logger = Logger.get("InterfaceFile");

export class InterfaceFile extends ScopeFile {
    static readonly baseName = "Interface";
    readonly definitionName: string;
    readonly cluster: ClusterModel;
    readonly types: Block;
    readonly ns: Block;
    readonly #variance: ClusterVariance;

    constructor(name: string, cluster: ClusterModel, variance: ClusterVariance) {
        super({ name, scope: cluster });
        this.definitionName = `${cluster.name}Interface`;
        this.cluster = cluster;
        this.types = this.section();
        this.ns = this.statements(`export namespace ${this.definitionName} {`, "}");
        this.#variance = variance;

        this.generate();
    }

    private generate() {
        logger.info(`${this.cluster.name} → ${this.name}.ts`);

        const gen = new InterfaceGenerator(this);

        gen.generateComponent("Base", this.#variance.base);
        for (const component of this.#variance.components) {
            gen.generateComponent(component.name, component);
        }

        gen.generateInterface();
    }
}
