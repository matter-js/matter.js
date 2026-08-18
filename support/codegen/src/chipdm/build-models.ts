/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { LocalMatter } from "#intermediate-models";
import { MatterElement, MatterModel, MergedModel, Specification, TraverseMap } from "#model";
import { finalizeModel } from "../util/finalize-model.js";

const logger = Logger.get("build-models");

/**
 * The models we validate.
 *
 * We build the model twice.  The difference between the two identifies divergences from the specification we introduce
 * deliberately via {@link LocalMatter}, which are not scraper defects.
 */
export interface ValidationModels {
    /** The model we ship: specification scrape with our overrides applied */
    merged: MatterModel;

    /** The specification scrape alone */
    unmodified: MatterModel;
}

export async function buildModels(revision: string): Promise<ValidationModels> {
    const spec = (await import(`@matter/intermediate-models/v${revision}/spec`)).SpecMatter as MatterElement;

    return {
        merged: build(revision, { spec, local: LocalMatter }, "merged model"),
        unmodified: build(revision, { spec }, "specification model"),
    };
}

function build(revision: string, inputs: TraverseMap, what: string) {
    logger.info(`Building ${what} for Matter ${revision}`);

    const merged = MergedModel(revision as Specification.Revision, inputs);
    const model = new MatterModel(merged as MatterElement);

    // Codegen applies the same fixups before writing the model, so validation must see them too
    const validation = Logger.nest(() => finalizeModel(model));
    if (validation.errors.length) {
        logger.warn(`${what} has ${validation.errors.length} validation errors of its own:`);
        Logger.nest(() => {
            for (const error of validation.errors) {
                logger.warn(`${error.source}: ${error.message}`);
            }
        });
    }

    return model;
}
