/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#general";
import { DataModelPath } from "./DataModelPath.js";

export type SchemaErrorPath = (DataModelPath & { path?: undefined }) | { path: DataModelPath | string };

/**
 * Thrown for issues with metadata definitions or related data that are a local (vs network client) problem.
 */
export class SchemaImplementationError extends MatterError {
    constructor(path: SchemaErrorPath, message: string) {
        super(`Definition of ${path.path ?? path}: ${message}`);
    }
}
