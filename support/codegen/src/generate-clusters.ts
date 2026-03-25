/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { ClusterModel, MatterModel } from "#model";
import "@matter/model/resources";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ClusterFile } from "./clusters/ClusterFile.js";
import { generateCluster } from "./clusters/generate-cluster.js";
import { generateGlobal } from "./clusters/generate-global.js";
import { TsFile } from "./util/TsFile.js";
import { clean, writeMatterFile } from "./util/file.js";
import "./util/setup.js";

const HEADER = `/**
 * @license
 * Copyright 2022-${new Date().getFullYear()} Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/
`;

const logger = Logger.get("generate-clusters");

const args = await yargs(hideBin(process.argv))
    .usage("Generates the matter.js file from intermediate files")
    .option("save", { type: "boolean", default: true, describe: "writes the generated model to disk" })
    .strict().argv;

const clusterIndex = new TsFile("!clusters/index");
const globalIndex = new TsFile("!globals/index");

const files = [clusterIndex, globalIndex];
const jsFiles: { path: string; content: string }[] = [];

let fail = false;

for (const model of MatterModel.standard.children) {
    try {
        let file;
        const symbols = Array<string>();
        let index;
        if (model instanceof ClusterModel) {
            file = new ClusterFile(model);
            generateCluster(file);

            if (model.id !== undefined) {
                symbols.push(file.clusterName);
            }
            symbols.push(file.typesName);
            index = clusterIndex;

            jsFiles.push({
                path: `!clusters/${file.basename}.js`,
                content: generateClusterJs(model),
            });
        } else {
            file = generateGlobal(model);
            if (!file) {
                continue;
            }
            index = globalIndex;
        }
        index.addReexport(`./${file.basename}.js`, ...symbols);
        files.push(file);
    } catch (e) {
        logger.error(e);
        fail = true;
    }
}

if (fail) {
    logger.error("Not modifying codebase due to errors");
} else if (args.save) {
    clean("!clusters");
    clean("!globals");
    for (const file of files) {
        file.save();
    }
    for (const js of jsFiles) {
        writeMatterFile(js.path, js.content);
    }
} else {
    logger.warn("Not modifying codebase because this is a dry run");
}

function generateClusterJs(cluster: ClusterModel): string {
    const name = cluster.name;
    const lines = [
        HEADER,
        `import { ClusterType } from "../cluster/ClusterType.js";`,
        `import { ${name} as ${name}Model } from "@matter/model";`,
        "",
        `export const ${name} = ClusterType(${name}Model);`,
    ];

    if (cluster.id !== undefined) {
        lines.push(`export const ${name}Cluster = ${name};`);
    }

    lines.push("");
    return lines.join("\n");
}
