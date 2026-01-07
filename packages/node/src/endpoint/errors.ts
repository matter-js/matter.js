/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { describeList, MatterAggregateError, MatterError } from "#general";
import type { Endpoint } from "./Endpoint.js";

/**
 * Thrown when an error occurs during initialization of a behavior.
 */
export class BehaviorInitializationError extends MatterError {
    constructor(message: string, cause?: unknown) {
        super(message);
        this.cause = cause;
    }
}

/**
 * Thrown when an error occurs initializing the behaviors of an endpoint.
 */
export class EndpointBehaviorsError extends MatterAggregateError {
    constructor(causes: Iterable<BehaviorBacking>) {
        super(causes, `Behaviors have errors`);
    }
}

/**
 * Thrown when an error occurs initializing essential parts of an endpoint during initialization.
 */
export class EndpointPartsError extends MatterError {
    constructor(causes: Iterable<Endpoint>) {
        let suffix;

        const causesArray = [...causes];
        if (causesArray.length) {
            suffix = `${causesArray.length === 1 ? "" : "s"} ${describeList("and", ...causesArray.map(cause => cause.toString()))}`;
        } else {
            suffix = "";
        }

        super(`Error initializing part${suffix}`);
    }
}

/**
 * Thrown when a requested child {@link Endpoint} does not exist.
 */
export class PartNotFoundError extends MatterError {}
