/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Validates the model we scrape from the specification against CHIP's data model XML

import { asError, Logger } from "#general";
import { Specification } from "#model";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { buildModels } from "./chipdm/build-models.js";
import { ChipDataModel } from "./chipdm/chip-data-model.js";
import { compareModels } from "./chipdm/compare.js";
import { loadDataModel } from "./chipdm/load-data-model.js";
import { report } from "./chipdm/report.js";
import "./util/setup.js";

const args = await yargs(hideBin(process.argv))
    .usage(
        "Compares our Matter model against the CHIP data model XML for the same Matter version.\n\n" +
            "The comparison is calibrated for Matter 1.6.0 and later.  An earlier version reports differences that " +
            "come from the state of our scrape at the time rather than from a defect of the model we ship.",
    )
    .option("revision", {
        type: "string",
        default: Specification.REVISION,
        describe: "the Matter version to validate",
    })
    .option("all", {
        type: "boolean",
        default: false,
        describe: "validate every version present in both our models and CHIP's",
    })
    .option("chip-dir", {
        type: "string",
        describe: "path of a connectedhomeip checkout to use instead of downloading",
    })
    .option("chip-ref", {
        type: "string",
        default: "master",
        describe: "branch or tag to download the data model from",
    })
    .option("refresh", {
        type: "boolean",
        default: false,
        describe: "discard the cached download",
    })
    .option("verbose", {
        type: "boolean",
        default: false,
        describe: "list intended and tolerated divergences individually rather than summarized",
    })
    .strict().argv;

await using source = await ChipDataModel.open({ dir: args.chipDir, ref: args.chipRef, refresh: args.refresh });

const versions = args.all ? await source.versions() : [ChipDataModel.versionFor(args.revision)];

const logger = Logger.get("validate-chipdm-model");

let failures = 0;

for (const version of versions) {
    let models;
    try {
        models = await buildModels(version);
    } catch (cause) {
        // A version we have no model of is not a failure; anything else is
        if (args.all && (cause as { code?: string }).code === "ERR_MODULE_NOT_FOUND") {
            logger.warn(`Skipping Matter ${version}: ${asError(cause).message}`);
            continue;
        }

        if (!args.all) {
            throw cause;
        }

        logger.error(`Building our model of Matter ${version} failed`, cause);
        failures++;
        continue;
    }

    try {
        const dm = await loadDataModel(source, version);
        const result = report(dm, compareModels(models, dm), args.verbose);

        process.stdout.write(`${result.text}\n\n`);

        if (result.mismatches) {
            failures++;
        }
    } catch (cause) {
        // A sweep reports every version it can rather than stopping at the first it cannot read
        if (!args.all) {
            throw cause;
        }
        logger.error(`Validation of Matter ${version} failed`, cause);
        failures++;
    }
}

if (failures) {
    process.exitCode = 1;
}
