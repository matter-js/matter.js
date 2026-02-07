/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const USAGE = `Generates a Matter object model from specification documents.

This script scrapes specification information from an HTML version of the
Matter specification.  You may override the default location with the
MATTER_SPECIFICATION_PATH environment variable or --path= command line
argument.

The script is optimized to work with the HTML version of the specification
generated from the same sources as the published PDFs. 

If you have access to the spec PDFs, reach out in Matter Integrators Discord
server if you would like access to a GitHub repository with the HTML version of
the specification.  Specifically mention the term "masochist".`;

import "./util/setup.js";

import { IntermediateModel } from "./mom/common/intermediate-model.js";
import { SpecFile } from "./mom/spec/spec-file.js";

const args = await yargs(hideBin(process.argv))
    .usage(USAGE)
    .option("clusters", { type: "boolean", describe: "ingest clusters" })
    .option("devices", { type: "boolean", describe: "ingest device types" })
    .option("namespaces", { type: "boolean", describe: "ingest semantic namespaces" })
    .option("save", { type: "boolean", describe: "writes the generated model to disk" })
    .option("path", { type: "string", describe: "path to spec index or directory of indices" })
    .option("document", {
        type: "string",
        describe: "limit ingestion to a specific document",
        choices: ["core", "cluster", "device", "namespace"],
    })
    .option("revision", { type: "string", describe: "spec version if path is unspecified" })
    .wrap(null) // Grr ESM version word wrap is broken so we just wrap manually to 79 chars
    .strict().argv;

if (!args.clusters && !args.devices && !args.namespaces) {
    args.clusters = args.devices = args.namespaces = true;
    if (args.save === undefined && args.document === undefined) {
        args.save = true;
    }
}

let version = args.revision;

const files = [...SpecFile.load({ version, path: args.path, document: args.document })];

for (const file of files) {
    if (version === undefined) {
        version = file.version;
    } else if (version !== file.version) {
        throw new Error(`Version mismatch for file ${file.path} (version is ${file.version} but expected ${version})`);
    }
}

if (version === undefined || !files.length) {
    throw new Error("No input found");
}

const intermediate = new IntermediateModel("spec", version);

for (const file of files) {
    if (args.clusters) {
        file.ingestClusters(intermediate);
    }

    if (args.devices) {
        file.ingestDevices(intermediate);
    }

    if (args.namespaces) {
        file.ingestNamespaces(intermediate);
    }
}

if (args.save) {
    intermediate.save();
} else {
    intermediate.validate();
}
