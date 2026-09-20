/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientFile } from "#endpoints/ClientFile.js";
import { decamelize, Logger } from "#general";
import { ClusterModel, ClusterVariance, MatterModel } from "#model";
import "@matter/model/resources";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { BehaviorFile } from "./endpoints/BehaviorFile.js";
import { requirementsLost } from "./endpoints/ComposedTypeGenerator.js";
import { EndpointFile } from "./endpoints/EndpointFile.js";
import { SemanticNamespaceFile } from "./endpoints/SemanticNamespaceFile.js";
import { ServerFile } from "./endpoints/ServerFile.js";
import { OutputSession } from "./util/file.js";
import { TsFile } from "./util/TsFile.js";
import "./util/setup.js";

const logger = Logger.get("generate-endpoints");

const args = await yargs(hideBin(process.argv))
    .usage("Generates behaviors, behavior servers, endpoint definitions and interfaces")
    .option("behaviors", { type: "boolean", describe: "generate behavior files" })
    .option("servers", { type: "boolean", describe: "generate server files" })
    .option("clients", { type: "boolean", describe: "generate client files" })
    .option("endpoints", { type: "boolean", describe: "generate endpoint type files" })
    .option("tags", { type: "boolean", describe: "generate semantic tag files" })
    .option("save", { type: "boolean", default: true, describe: "writes the generated model to disk" })
    .strict().argv;

if (!args.behaviors && !args.servers && !args.clients && !args.endpoints && !args.tags) {
    args.behaviors = args.servers = args.clients = args.endpoints = args.tags = true;
}

// Disposal on abrupt completion is what keeps a throw below from leaving a half-regenerated tree
using session = args.save ? OutputSession.open() : undefined;

if (args.behaviors || args.clients || args.servers) {
    const index = new TsFile(`!behaviors/index`);

    for (const cluster of MatterModel.standard.clusters) {
        const base = cluster.base;

        const isAlias = base && !cluster.children.length;
        const isAbstract = cluster.id === undefined;

        const variance = ClusterVariance(isAlias ? (base as ClusterModel) : cluster);
        const dir = `!behaviors/${decamelize(cluster.name)}`;

        const exports = new TsFile(`${dir}/index`, true);

        if (!isAbstract) {
            if (args.behaviors) {
                generateClusterFile(dir, BehaviorFile, cluster, exports, variance);
            }
            if (args.servers) {
                generateClusterFile(dir, ServerFile, cluster, exports, variance);
            }
            if (args.clients) {
                generateClusterFile(dir, ClientFile, cluster, exports, variance);
            }
        }

        save(exports);

        index.addReexport(`${exports.name}.js`);
    }

    save(index);
}

if (args.endpoints) {
    if (args.save) {
        EndpointFile.clean();
    }

    const endpointIndices = {} as Record<string, TsFile>;

    for (const device of MatterModel.standard.deviceTypes) {
        const file = new EndpointFile(device, endpointIndices);
        save(file);
    }

    Object.values(endpointIndices).forEach(save);
}

if (args.tags) {
    const tagIndex = new TsFile("!tags/index");
    for (const ns of MatterModel.standard.semanticNamespaces) {
        const file = new SemanticNamespaceFile(ns);
        save(file);
        tagIndex.addReexport(`${file.name}.js`);
    }
    save(tagIndex);
}

if (requirementsLost) {
    // Committing here would replace the tree with output known to have lost specification content, which is the
    // state the session exists to prevent.  Disposal discards it.
    logger.error("Not modifying codebase: one or more requirements reached no generated file");
    process.exitCode = 1;
} else if (session) {
    const { written, unchanged, removed } = session.commit();
    logger.info(`Wrote ${written} files, ${unchanged} unchanged, removed ${removed}`);
}

function generateClusterFile(
    dir: string,
    type: {
        new (name: string, cluster: ClusterModel, variance: ClusterVariance): TsFile;
        baseName: string;
    },
    cluster: ClusterModel,
    exports: TsFile,
    variance: ClusterVariance,
) {
    const filename = `${dir}/${cluster.name}${type.baseName}`;
    if (args[`${type.baseName.toLowerCase()}s`]) {
        const file = new type(filename, cluster, variance);
        save(file);
    }
    exports.addReexport(`${filename}.js`);
}

function save(file: TsFile) {
    if (args.save) {
        file.save();
    }
}
