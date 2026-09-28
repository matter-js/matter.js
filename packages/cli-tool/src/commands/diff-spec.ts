/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, ImportError, LogFormat } from "@matter/general";
import { AnyElement, ElementTag, Model, ModelDiff, Specification } from "@matter/model";
import { Command } from "./command.js";

Command({
    usage: "[FROM] [TO]",
    description: "Show differences between Matter versions.",
    namedArgs: [
        {
            name: "d",
            description: "maximum depth for details",
            default: 2,
            type: "integer",
        },
    ],
    positionalArgs: [
        {
            name: "from",
            description: "the baseline model",
            type: "any",
        },
        {
            name: "to",
            description: "the target model",
            type: "any",
        },
    ],
    maxArgs: 2,

    invoke: async function diffSpec({ d: depth, from, to }) {
        if (to === undefined) {
            to = Specification.REVISION;
        }
        if (from === undefined) {
            from = await previousRevisionOf(isRevisionArg(to) ? String(to) : Specification.REVISION);
        }

        const diff = ModelDiff(await loadModel(from), await loadModel(to), depth);
        if (isRevisionArg(from) && isRevisionArg(to)) {
            this.out(`${from} → ${to}\n`);
        }
        this.out(LogFormat.formats.ansi(ModelDiff.diagnosticOf(diff)), "\n");
    },
});

/**
 * The latest revision before {@link revision} that has an intermediate model: the previous patch level of the same
 * release, otherwise the latest patch level of the previous release.
 */
async function previousRevisionOf(revision: string) {
    const [major, minor, patch = 0] = revision.split(".").map(Number);

    const candidates =
        patch > 0
            ? [`${major}.${minor}.${patch - 1}`]
            : Array.from(
                  { length: MAX_PATCH_LEVEL + 1 },
                  (_, level) => `${major}.${minor - 1}.${MAX_PATCH_LEVEL - level}`,
              );

    for (const candidate of candidates) {
        if (await isImportable(intermediateModelName(candidate))) {
            return candidate;
        }
    }

    throw new ImportError(`No intermediate model precedes revision ${revision}`);
}

const MAX_PATCH_LEVEL = 9;

function isRevision(source: string) {
    return /^\d+\.\d+(\.\d+)?$/.test(source);
}

/** Intermediate models are stored by revision with a trailing ".0" dropped */
function intermediateModelName(revision: string) {
    return `@matter/intermediate-models/v${revision.replace(/\.0$/, "")}/spec`;
}

async function isImportable(name: string) {
    try {
        await import(name);
        return true;
    } catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "ERR_MODULE_NOT_FOUND") {
            return false;
        }
        throw cause;
    }
}

/** The command line parses "1.6" as a number */
function isRevisionArg(source: unknown) {
    return typeof source === "number" || (typeof source === "string" && isRevision(source));
}

async function loadModel(source: unknown): Promise<Model> {
    if (typeof source === "number") {
        source = source.toString();
    }

    if (typeof source !== "string") {
        const model = asModel(source);
        if (model === undefined) {
            throw new ImplementationError(`Input models must be Model, AnyElement, or a string import specifier`);
        }
        return model;
    }

    const importName = isRevision(source) ? intermediateModelName(source) : source;

    let module: Record<string, unknown>;
    try {
        module = await import(importName);
    } catch (cause) {
        throw new ImportError(`Could not import "${importName}"`, { cause });
    }

    for (const value of Object.values(module)) {
        const model = asModel(value);
        if (model) {
            return model;
        }
    }

    throw new ImportError(`Could not find an exported model in "${importName}"`);
}

function asModel(value: unknown) {
    if (value instanceof Model) {
        return value;
    }

    if (
        typeof value === "object" &&
        value !== null &&
        "tag" in value &&
        Object.values(ElementTag).includes(value.tag as ElementTag)
    ) {
        return Model.create(value as AnyElement);
    }
}
