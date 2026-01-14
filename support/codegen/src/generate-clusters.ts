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
import { clean } from "./util/file.js";
import "./util/setup.js";

const logger = Logger.get("generate-clusters");

const args = await yargs(hideBin(process.argv))
    .usage("Generates the matter.js file from intermediate files")
    .option("save", { type: "boolean", default: true, describe: "writes the generated model to disk" })
    .strict().argv;

const clusterIndex = new TsFile("!clusters/index");
const globalIndex = new TsFile("!globals/index");

const files = [clusterIndex, globalIndex];

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
} else {
    logger.warn("Not modifying codebase because this is a dry run");
}
