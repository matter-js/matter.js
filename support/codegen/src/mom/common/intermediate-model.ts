/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const INTERMEDIATE_PATH = "models";

import { Logger } from "#general";
import { MatterElement, MatterModel } from "#model";
import { TsFile } from "../../util/TsFile.js";
import { finalizeModel } from "../../util/finalize-model.js";
import { camelize } from "../../util/string.js";
import { generateElement } from "./generate-element.js";

const logger = Logger.get("intermediate-model");

/**
 * Builder for an "intermediate" representation of the Matter model ingested from a canonical source.
 */
export class IntermediateModel {
    #source: string;
    #version: string;
    #elements = Array<MatterElement.Child>();

    constructor(source: string, version: string) {
        this.#source = source;
        this.#version = version;
    }

    add(...elements: MatterElement.Child[]) {
        this.#elements.push(...elements);
    }

    /**
     * Create a model file containing an imported models.  These are "intermediate" in the sense that they're input to
     * the merge process that generates the final model.
     */
    save() {
        this.#finish(true);
    }

    validate() {
        this.#finish(false);
    }

    #finish(save: boolean) {
        logger.info(`validate ${this.#source}`);
        const matter = new MatterModel({
            name: `${camelize(this.#source, true)}Matter`,
            children: [...this.#elements],
        });

        const validationResult = finalizeModel(matter);

        if (save) {
            const file = new TsFile(`!intermediate/v${this.#version}/${this.#source}`);
            generateElement({
                target: file,
                importFrom: "#model",
                element: matter,
                prefix: `export const ${camelize(this.#source, true)}Matter = `,
                operational: false,
            });
            file.save();
        }

        validationResult.report();
    }
}
