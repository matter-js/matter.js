/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Generates the runtime Matter model

import { decamelize, InternalError, Logger } from "#general";
import { LocalMatter } from "#intermediate-models";
import {
    AttributeModel,
    DatatypeModel,
    ElementTag,
    MatterElement,
    MatterModel,
    MergedModel,
    Model,
    Specification,
    TraverseMap,
} from "#model";
import { generateResource } from "#mom/common/generate-resource.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { AcknowledgedRemovals } from "./acknowledged-removals.js";
import { generateElement } from "./mom/common/generate-element.js";
import { DEFAULT_MATTER_VERSION } from "./mom/spec/md/load-markdown-files.js";
import { canonicalizeConditionReferences } from "./util/canonicalize-condition-references.js";
import { checkNumberTlvMapping } from "./util/check-number-tlv-mapping.js";
import { clean, OutputSession } from "./util/file.js";
import { finalizeModel } from "./util/finalize-model.js";
import { digestOf, findLosses, ModelDigest } from "./util/model-digest.js";
import { camelize } from "./util/string.js";
import "./util/setup.js";
import { TsFile } from "./util/TsFile.js";
export const CLUSTER_SUFFIX = "Element";

const logger = Logger.get("generate-model");

const args = await yargs(hideBin(process.argv))
    .usage("Generates the matter.js file from intermediate files")
    .option("save", { type: "boolean", default: true, describe: "writes the generated model to disk" })
    .option("allow-invalid", {
        type: "boolean",
        default: false,
        describe: "generates even when the model fails validation, for spec revision bring-up",
    })
    .option("allow-removals", {
        type: "boolean",
        default: false,
        describe:
            "generates even when elements disappear without an entry in acknowledged-removals.ts, which a revision we no longer scrape requires",
    })
    .option("revision", {
        type: "string",
        default: DEFAULT_MATTER_VERSION,
        describe: "the Matter version of the input intermediate model",
    })
    .strict().argv;

const revisionComponents = args.revision.split(".");
if (revisionComponents.length > 3) {
    revisionComponents.length = 3;
}
if (revisionComponents.length > 2 && revisionComponents[2] === "0") {
    revisionComponents.length = 2;
}
args.revision = revisionComponents.join(".");

function elementDiscriminatedName(element: Model) {
    const { name } = element;
    if (element.tag === ElementTag.DeviceType) {
        return `${name}DT`;
    }
    if (element.tag === ElementTag.SemanticNamespace) {
        return `${name}NS`;
    }
    return name;
}

const assignedFilenames = new Map<Model, string>();

function elementFilename(element: Model, type: "element" | "resource") {
    return `${assignedFilenames.get(element)}.${type}`;
}

function elementIdentifierName(element: Model) {
    const name = elementDiscriminatedName(element);
    return camelize(name, name[0] < "a" || name[0] > "z");
}

function generateElementFile(element: Model) {
    logger.debug(element.name);

    const file = new TsFile(`!elements/${elementFilename(element, "element")}`);

    file.addImport(`../MatterDefinition.js`, `MatterDefinition`);
    const exportName = elementIdentifierName(element);
    generateElement({
        target: file,
        importFrom: "!model/elements/index.js",
        element,
        prefix: `export const ${exportName} = `,
    });
    file.atom(`MatterDefinition.children.push(${exportName})`);

    if (args.save) {
        file.save();
    }
}

function generateResourceFile(element: Model) {
    logger.debug(`${element.name} resources`);

    const file = new TsFile(`!resources/${elementFilename(element, "resource")}`);
    if (!generateResource(file, element)) {
        return false;
    }

    if (args.save) {
        file.save();
    }

    return true;
}

function generateElementIndex(elements: Model[]) {
    const file = new TsFile(`!elements/definitions`);
    for (const element of elements) {
        file.addReexport(`./${elementFilename(element, "element")}.js`);
    }

    if (args.save) {
        file.save();
    }
}

function generateModelIndex(elements: Model[]) {
    const file = new TsFile(`!elements/models`);
    file.addImport("./definitions.js", "* as definitions");
    for (const element of elements) {
        const type = `${camelize(element.tag, true)}Model`;
        file.addImport(`../../models/${type}.js`, type);
        const exportName = elementIdentifierName(element);
        file.atom(`export const ${exportName} = new ${type}(definitions.${exportName})`);
    }

    if (args.save) {
        file.save();
    }
}

function generateResourceIndex(elements: Model[]) {
    const file = new TsFile(`!resources/index`);
    file.addImport("../elements/models.js");
    for (const element of elements) {
        file.addImport(`./${elementFilename(element, "resource")}.js`);
    }

    if (args.save) {
        file.save();
    }
}

async function importModel(source: string) {
    return (await import(`@matter/intermediate-models/v${args.revision}/${source}`))[
        `${camelize(source, true)}Matter`
    ] as MatterElement;
}

const inputs = {} as TraverseMap;

inputs.spec = await importModel("spec");

// We merged in CHIP data in our 1.1 implementation but going forward just rely on the spec and our overrides
if (args.revision === "1.1") {
    inputs.chip = await importModel("chip");
}

inputs.local = LocalMatter;

const merged = MergedModel(args.revision as Specification.Revision, inputs);

const matter = new MatterModel(merged as MatterElement);

canonicalizeConditionReferences(matter);

const validationResult = finalizeModel(matter);

if (!matter.get(DatatypeModel, "bool") || !matter.get(AttributeModel, "FeatureMap")) {
    throw new InternalError("Model is missing key elements that would break codebase, aborting");
}

checkNumberTlvMapping(matter);

{
    const nameMap = new Map<string, Model[]>();
    for (const child of matter.children) {
        const name = decamelize(child.name);
        const entry = nameMap.get(name);
        if (entry) {
            entry.push(child);
        } else {
            nameMap.set(name, [child]);
        }
    }

    for (const [name, models] of nameMap.entries()) {
        if (models.length === 1) {
            assignedFilenames.set(models[0], name);
        } else {
            for (const model of models) {
                let suffix = model.tag as string;
                switch (suffix) {
                    case "deviceType":
                        suffix = "device";
                        break;

                    case "semanticNamespace":
                        suffix = "namespace";
                        break;

                    case "semanticTag":
                        suffix = "tag";
                        break;
                }
                assignedFilenames.set(model, `${name}-${suffix}`);
            }
        }
    }
}

validationResult.report();

/**
 * Compare against the model we currently ship.
 *
 * The digest comes from a child process because loading the shipped model in this one installs it as the traversal
 * fallback root and freezes its resources, which breaks generation.
 */
function unacknowledgedLosses() {
    const dump = execFileSync(process.execPath, [fileURLToPath(new URL("./dump-model-digest.js", import.meta.url))], {
        encoding: "utf-8",
        maxBuffer: 256 * 1024 * 1024,
    });

    const previous = JSON.parse(dump) as ModelDigest;

    // An entry excuses one loss of one kind while generating the revision that caused it.  Matching on the key alone
    // would let an entry recorded for a later revision hide a genuine accidental loss in every earlier one.
    const acknowledged = new Set(
        AcknowledgedRemovals.filter(entry => entry.revision === args.revision).map(
            entry => `${entry.kind}\u0000${entry.key}`,
        ),
    );

    return findLosses(previous, digestOf(matter)).filter(loss => !acknowledged.has(`${loss.kind}\u0000${loss.key}`));
}

// A guard that cannot read its baseline is not a guard, so a failure here stops the run rather than waving it through
let losses: ReturnType<typeof unacknowledgedLosses> | undefined;
try {
    losses = unacknowledgedLosses();
} catch (e) {
    logger.error("Cannot read the model we currently ship, so losses cannot be detected", e);
    if (!args.allowRemovals) {
        process.exitCode = 1;
        throw new InternalError("Removal detection failed; pass --allow-removals to generate without it");
    }
}

if (losses?.length) {
    logger.error(`*** ${losses.length} specification statement${losses.length === 1 ? "" : "s"} would be lost ***`);
    Logger.nest(() => {
        for (const { kind, key, was, now } of losses) {
            logger.error(now === undefined ? `${key} loses its ${kind} (${was})` : `${key} ${kind}: ${was} -> ${now}`);
        }
    });
    logger.error(
        "Record each in support/codegen/src/acknowledged-removals.ts with the specification change that caused it, " +
            "or pass --allow-removals",
    );
}

const losesContent = !!losses?.length && !args.allowRemovals;

const invalid = validationResult.errors.length > 0;
if (losesContent) {
    logger.error("Not generating because specification content would be lost");
    process.exitCode = 1;
} else if (invalid && !args.allowInvalid) {
    logger.error("Not generating because the model failed validation; pass --allow-invalid to generate anyway");
    process.exitCode = 1;
} else {
    using session = args.save ? OutputSession.open() : undefined;

    if (args.save) {
        clean("!elements");
        clean("!resources");
    }

    logger.info("generate matter model");
    Logger.nest(() => {
        const withResources = Array<Model>();

        for (const child of matter.children) {
            Logger.nest(() => {
                generateElementFile(child);
                if (generateResourceFile(child)) {
                    withResources.push(child);
                }
            });
        }

        logger.info("index");
        generateElementIndex(matter.children as Model[]);
        generateModelIndex(matter.children as Model[]);
        generateResourceIndex(withResources);
    });

    if (invalid) {
        // Exiting non-zero here would stop the composite generate script with a new model beside old types, which is
        // the mixed tree the output session exists to prevent.  The caller asked for this generation.
        logger.warn("Generated from a model that failed validation because --allow-invalid was given");
    }

    if (session) {
        const { written, unchanged, removed } = session.commit();
        logger.info(`Wrote ${written} files, ${unchanged} unchanged, removed ${removed}`);
    }
}
