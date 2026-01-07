/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { camelize, capitalize, decamelize, MatterAggregateError } from "#general";
import { DataModelPath } from "#model";
import { StatusResponseError } from "#types";

/**
 * A protocol error associated with a specific data model path.
 */
export class PathError extends StatusResponseError {
    #id: string;
    #path: DataModelPath;

    constructor({ path, status: { id, status, clusterStatus }, message }: PathError.Definition) {
        if (message === undefined) {
            message = capitalize(decamelize(camelize(id), " "));
        }

        super(message, status, clusterStatus);
        this.#id = id;
        this.#path = path;
    }

    override get id() {
        return this.#id;
    }

    get path() {
        return this.#path;
    }
}

export namespace PathError {
    export interface Definition {
        path: DataModelPath;
        status: ExpandedStatus;
        message?: string;
    }
}

export class AggregatePathError extends MatterAggregateError {}
