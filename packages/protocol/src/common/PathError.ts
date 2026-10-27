/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExpandedStatus } from "#common/ExpandedStatus.js";
import { camelize, capitalize, decamelize, MatterAggregateError } from "@matter/general";
import { DataModelPath } from "@matter/model";
import { StatusResponseError } from "@matter/types";

/**
 * A protocol error associated with a specific data model path.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.10
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

/**
 * A {@link PathError} the peer reported.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.10
 */
export class ReceivedPathError extends PathError {
    override get received(): true {
        return true;
    }
}

export namespace PathError {
    export interface Definition {
        path: DataModelPath;
        status: ExpandedStatus;
        message?: string;
    }
}

/**
 * Raised when multiple {@link PathError}s occur in one operation.
 */
export class AggregatePathError extends MatterAggregateError {}
