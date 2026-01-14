/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This script builds cluster elements from the connectedhomeip XML cluster
// definitions.

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { loadChip } from "./mom/chip/load-chip.js";
import { IntermediateModel } from "./mom/common/intermediate-model.js";
import { DEFAULT_MATTER_VERSION } from "./mom/spec/doc-utils.js";
import "./util/setup.js";

const args = await yargs(hideBin(process.argv))
    .usage("Generates a Matter object model from connectedhomeip ZAP files")
    .option("save", { type: "boolean", default: true, describe: "writes the generated model to disk" })
    .option("revision", {
        type: "string",
        default: DEFAULT_MATTER_VERSION,
        describe: "the specification branch to load",
    })
    .strict().argv;

const intermediate = new IntermediateModel("chip", args.revision);

const elements = await loadChip(args.revision);
intermediate.add(...elements);

if (args.save) {
    intermediate.save();
}
