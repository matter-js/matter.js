/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, Environment, Logger } from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { ConditionAssertions } from "./ConditionAssertions.js";
import { DeviceTypeConformance } from "./DeviceTypeConformance.js";
import { ValidationPass } from "./ValidationPass.js";
import { DeviceTypeConformanceError, DeviceTypeViolationError, Violation } from "./Violation.js";

/**
 * Reports where the endpoints of a node depart from the device types they declare.
 *
 * Reporting is one warning per endpoint by default, because departing from a device type is a certification problem
 * rather than a runtime fault. Two cases refuse the endpoint with a {@link DeviceTypeConformanceError}: a misplaced
 * singleton, which is unambiguous, and any violation when the environment variable `endpoint.validation.strict` is set.
 *
 * Each violation is reported once per endpoint while it persists. A violation that disappears and returns is reported
 * again.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export class DeviceTypeConformanceService {
    readonly #node: Endpoint;
    readonly #strict: boolean;
    readonly #model: MatterModel;
    readonly #logger: Logger;
    readonly #reported = new Map<Endpoint, Set<string>>();

    /**
     * @param node the node whose endpoints are validated
     * @param environment the node's environment, which supplies `endpoint.validation.strict` and the log origin
     * @param model the model device types resolve in
     */
    constructor(node: Endpoint, environment: Environment, model: MatterModel = Matter) {
        this.#node = node;
        this.#strict = environment.vars.boolean("endpoint.validation.strict") ?? false;
        this.#model = model;
        this.#logger = environment.logger("DeviceTypeConformance");
    }

    /**
     * Whether any violation refuses the endpoint, as set by `endpoint.validation.strict` when the service was created.
     */
    get strict() {
        return this.#strict;
    }

    /**
     * Judge {@link endpoints} in one pass and report the violations not already reported for each.
     *
     * The pass collects each node scope's conditions once and shares endpoint and composition facts across the
     * endpoints, which validating them in separate calls repeats per call. An endpoint in no node scope is not judged.
     *
     * With {@link DeviceTypeConformanceService.ValidateOptions.refuse} (the default) an endpoint with a new misplaced
     * singleton, or with any new violation when {@link strict}, throws. When several endpoints are refused, the first
     * is thrown and the others are logged. Every other endpoint with new violations logs one warning listing them.
     *
     * @throws {DeviceTypeConformanceError} when an endpoint is refused
     */
    validate(endpoints: Endpoint | Iterable<Endpoint>, options?: DeviceTypeConformanceService.ValidateOptions) {
        this.#validate(isEndpoint(endpoints) ? [endpoints] : endpoints, new ValidationPass(this.#model), options);
    }

    /**
     * {@link validate} every endpoint of the node scope {@link endpoint} belongs to, in one pass.
     */
    validateNodeScope(endpoint: Endpoint, options?: DeviceTypeConformanceService.ValidateOptions) {
        const pass = new ValidationPass(this.#model);
        const nodeEndpoint = ConditionAssertions.nodeEndpointOf(endpoint, pass);
        if (nodeEndpoint === undefined) {
            return;
        }
        this.#validate(ConditionAssertions.nodeScopeOf(nodeEndpoint, pass), pass, options);
    }

    #validate(
        endpoints: Iterable<Endpoint>,
        pass: ValidationPass,
        options: DeviceTypeConformanceService.ValidateOptions | undefined,
    ) {
        const refuse = options?.refuse ?? true;
        let refusal: DeviceTypeConformanceError | undefined;

        for (const endpoint of endpoints) {
            const fresh = this.#judge(endpoint, pass);
            if (!fresh.length) {
                continue;
            }

            if (
                refuse &&
                refusal === undefined &&
                (this.#strict || fresh.some(({ kind }) => kind === "singletonMisplaced"))
            ) {
                refusal = new DeviceTypeConformanceError(
                    endpoint.toString(),
                    fresh.map(violation => new DeviceTypeViolationError(violation)),
                );
                continue;
            }

            this.#logger.warn(
                `Endpoint ${endpoint} does not conform to its device types:`,
                Diagnostic.list(
                    fresh.map(
                        ({ kind, deviceType, requirement, detail }) =>
                            `${kind} ${deviceType} ${requirement}: ${detail}`,
                    ),
                ),
            );
        }

        if (refusal !== undefined) {
            throw refusal;
        }
    }

    /**
     * Drop what was reported for {@link endpoint}, so a later {@link validate} reports all its violations again.
     */
    forget(endpoint: Endpoint) {
        this.#reported.delete(endpoint);
    }

    /**
     * Whether violations reported for {@link endpoint} are held.
     */
    knows(endpoint: Endpoint) {
        return this.#reported.has(endpoint);
    }

    /**
     * Drop what was reported for every endpoint, as a factory reset requires.
     */
    reset() {
        this.#reported.clear();
    }

    /**
     * The violations of {@link endpoint} not reported before. What the endpoint violates now becomes what was reported.
     */
    #judge(endpoint: Endpoint, pass: ValidationPass) {
        const nodeEndpoint = ConditionAssertions.nodeEndpointOf(endpoint, pass);
        if (nodeEndpoint === undefined) {
            return [];
        }

        const violations = DeviceTypeConformance.check(endpoint, ConditionAssertions.collect(nodeEndpoint, pass), pass);

        // The kind and requirement path identify a violation on its endpoint; check() reports each pair once
        const keys = new Set(violations.map(keyOf));
        const previous = this.#reported.get(endpoint);
        if (keys.size) {
            this.#reported.set(endpoint, keys);
        } else {
            this.#reported.delete(endpoint);
        }

        return violations.filter(violation => !previous?.has(keyOf(violation)));
    }

    /**
     * Textual description of the node, for diagnostics.
     */
    toString() {
        return `device type conformance of ${this.#node}`;
    }
}

export namespace DeviceTypeConformanceService {
    export interface ValidateOptions {
        /**
         * Whether an endpoint with a new misplaced singleton, or with any new violation in strict mode, throws. Defaults
         * to true. Off, those violations log like any other; changes after the node started are reported that way,
         * because nothing could roll them back.
         */
        refuse?: boolean;
    }
}

function keyOf({ kind, requirement }: Violation) {
    return `${kind} ${requirement}`;
}

function isEndpoint(value: Endpoint | Iterable<Endpoint>): value is Endpoint {
    return !(Symbol.iterator in value);
}
