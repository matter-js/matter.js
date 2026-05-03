/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { describeList, MatterAggregateError, MatterError } from "@matter/general";
import type { ReadResult } from "@matter/protocol";
import type { Status } from "@matter/types";
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

/**
 * Thrown when a behavior is not present on an endpoint.
 */
export class EndpointBehaviorNotPresentError extends MatterError {
    constructor(behaviorId: string) {
        super(`Behavior "${behaviorId}" is not present on this endpoint`);
    }
}

/**
 * Thrown when an attribute is not present on a behavior.
 */
export class AttributeNotPresentError extends MatterError {
    constructor(behaviorId: string, attributeName: string) {
        super(`Attribute "${attributeName}" is not present on behavior "${behaviorId}"`);
    }
}

/**
 * Describes a single failed attribute read.
 */
export interface EndpointReadFailure {
    readonly path: ReadResult.ConcreteAttributePath;
    readonly status: Status;
    readonly clusterStatus?: number;
}

/**
 * Thrown when attribute reads fail for one or more paths.
 */
export class EndpointReadFailedError extends MatterError {
    readonly failed: ReadonlyArray<EndpointReadFailure>;
    readonly partial: unknown;

    constructor(detail: { failed: ReadonlyArray<EndpointReadFailure>; partial: unknown }) {
        super(`Endpoint read failed for ${detail.failed.length} path(s)`);
        this.failed = detail.failed;
        this.partial = detail.partial;
    }
}
