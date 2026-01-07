/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "#general";
import { DefinitionError } from "../common/index.js";
import { Model } from "../models/index.js";
import { ModelTraversal } from "./ModelTraversal.js";
import { ModelValidator } from "./definition-validation/ModelValidator.js";

const logger = Logger.get("ValidateModel");

/**
 * Ensures that a model's definition is correct.  Places errors into the error
 * array of invalid models.
 *
 * Makes a few minor modifications to the model as a side effect:
 *
 * - Default values are cast to the correct type if possible
 * - Cross-references are deleted if they're redundant with the parent
 *
 * Note that we run validation against model classes rather than element
 * datatypes.  The classes implement type resolution, error handling and other
 * logic we rely on for validation.
 */
export function ValidateModel(model: Model) {
    const result = new ValidateModel.Result(model);

    function validate(model: Model) {
        const Validator = ModelValidator.validators[model.tag];
        if (!Validator) {
            model.error("UNKNOWN_MODEL_TYPE", `No validator for ${model.tag}`);
            return;
        }

        try {
            new Validator(model).validate();
        } catch (e) {
            console.error(`Error validating ${model.path}`);
            throw e;
        }

        result.elementCount++;
        if (!model.valid) {
            result.invalidElementCount++;
            if (model.errors) {
                for (const error of model.errors) {
                    if (result.errorCounts[error.code]) {
                        result.errorCounts[error.code]++;
                    } else {
                        result.errorCounts[error.code] = 1;
                    }
                    result.errors.push(error);
                }
            }
        }

        // Need another logging level before enabling this
        // logger.debug(
        //     `${model.valid ? "✓": "✗"} ${model.name}`,
        //     Diagnostic.dict({
        //         tag: model.tag,
        //         children: model.children.length || undefined,
        //         id: model.id ? `0x${model.id?.toString(16)}` : undefined,
        //         xref: model.xref
        //     })
        // );

        Logger.nest(() => {
            model.children.forEach(validate);
        });
    }

    logger.info("Validating matter model");
    ModelTraversal.memoize(() => validate(model));

    return result;
}

export namespace ValidateModel {
    export class Result {
        elementCount = 0;
        invalidElementCount = 0;
        errorCounts: { [name: string]: number } = {};
        errors = Array<DefinitionError>();

        get invalidElementPercent() {
            return ((this.invalidElementCount / this.elementCount) * 100).toPrecision(2);
        }

        constructor(public model: Model) {}

        report() {
            if (this.errors.length) {
                logger.error("*** Validation error summary ***");
                this.errors.forEach(error =>
                    logger.error(
                        error.message,
                        Diagnostic.dict({ code: error.code, xref: error.xref, src: error.source }),
                    ),
                );

                logger.error("Error counts by code:");
                Logger.nest(() => {
                    const codes = Object.keys(this.errorCounts).sort((a, b) =>
                        a.localeCompare(b, undefined, { sensitivity: "base" }),
                    );
                    for (const code of codes) {
                        logger.error(`${code}: ${this.errorCounts[code]}`);
                    }
                });

                logger.error(
                    `*** Total ${this.errors.length} validation error${this.errors.length === 1 ? "" : "s"} ***`,
                );
                logger.error(
                    `*** Total ${this.invalidElementCount} invalid element${
                        this.invalidElementCount === 1 ? "" : "s"
                    } (${this.invalidElementPercent}%) ***`,
                );
            } else {
                logger.info(`*** Validation successful ***`);
            }
            logger.debug(`*** Total ${this.elementCount} element${this.elementCount === 1 ? "" : "s"} ***`);
        }
    }
}
