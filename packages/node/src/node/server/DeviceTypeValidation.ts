/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import type { DeviceTypeViolation } from "@matter/model";

/**
 * What an application may ask of the device type validation of a server node, which
 * {@link DeviceTypeConformanceService} provides.
 */
export interface DeviceTypeValidation {
    /**
     * The mode `endpoint.validation` set when the node was created.
     */
    readonly mode: DeviceTypeValidation.Mode;

    /**
     * Judge {@link endpoints} in one pass and report the violations not already reported for each.
     *
     * @returns the violations of each judged endpoint; an endpoint in no node scope is not judged
     * @throws {DeviceTypeConformanceError} when an endpoint is refused
     * @throws {ImplementationError} when an endpoint is not a part of the node, such as a peer's
     */
    validate(
        endpoints: Endpoint | Iterable<Endpoint>,
        options?: DeviceTypeValidation.ValidateOptions,
    ): DeviceTypeValidation.Verdict;

    /**
     * {@link validate} every endpoint of the node scope {@link endpoint} belongs to, in one pass.
     *
     * @throws {ImplementationError} when {@link endpoint} is not a part of the node
     */
    validateNodeScope(endpoint: Endpoint, options?: DeviceTypeValidation.ValidateOptions): DeviceTypeValidation.Verdict;

    /**
     * The violations recorded for {@link endpoint}: those found by the last pass that judged it and recorded. Always
     * empty in mode `"off"`, which records nothing.
     */
    violationsOf(endpoint: Endpoint): DeviceTypeViolation[];
}

export namespace DeviceTypeValidation {
    /**
     * How the node judges the device types of its endpoints: `"off"` judges nothing on its own, `"warn"` logs each
     * violation and `"strict"` refuses the construction of an endpoint with any new violation.
     */
    export type Mode = "off" | "warn" | "strict";

    export interface ValidateOptions {
        /**
         * Whether an endpoint with a new misplaced singleton, or with any new violation in mode `"strict"`, throws.
         * Defaults to true. Off, those violations log and are recorded like any other, a misplaced singleton included.
         * The node judges changes after construction with it off, because nothing rolls back such a change.
         *
         * A refused endpoint's violations do not count as reported, so validating it again refuses it again.
         */
        refuse?: boolean;
    }

    /**
     * The violations of each endpoint a pass judged.
     */
    export type Verdict = Map<Endpoint, DeviceTypeViolation[]>;
}
