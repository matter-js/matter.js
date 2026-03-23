/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel } from "#model";
import { ScopeFile } from "../util/ScopeFile.js";
import { Block } from "../util/TsFile.js";

export class ClusterFile extends ScopeFile {
    clusterName: string;
    typesName: string;

    /**
     * Section for cluster-level interfaces: Attributes, Commands, Events, Features type.
     *
     * Appears at the top of the namespace.
     */
    interfaces: Block;

    /**
     * Section for the Feature enum.
     *
     * Appears after interfaces, before component type definitions.
     */
    featureEnum: Block;

    /**
     * Section for component type definitions (enums, structs, bitmaps).
     *
     * Appears after the Feature enum, before ClusterType definitions.
     */
    components: Block;

    ns: Block;

    constructor(cluster: ClusterModel) {
        super({ scope: cluster });
        this.fileExtension = ".d.ts";
        this.clusterName = `${cluster.name}Cluster`;
        this.typesName = cluster.name;
        this.ns = this.statements(`export declare namespace ${this.typesName} {`, "}");
        this.ns.document(`Definitions for the ${cluster.name} cluster.`);
        this.interfaces = this.ns.section();
        this.featureEnum = this.ns.section();
        this.components = this.ns.section();
    }

    get cluster() {
        return this.model as ClusterModel;
    }
}
