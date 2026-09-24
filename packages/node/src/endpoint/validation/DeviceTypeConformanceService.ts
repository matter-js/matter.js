/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Diagnostic, Environment, Lifecycle, Logger } from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { ConditionAssertions } from "./ConditionAssertions.js";
import { DeviceTypeConformance } from "./DeviceTypeConformance.js";
import { EndpointFacts } from "./EndpointFacts.js";
import { ValidationPass } from "./ValidationPass.js";
import { DeviceTypeConformanceError, DeviceTypeViolationError, Violation } from "./Violation.js";

/**
 * Reports where the endpoints of a node depart from the device types they declare.
 *
 * Reporting is one warning per endpoint by default, because departing from a device type is a certification problem
 * rather than a runtime fault. Two cases refuse the endpoint with a {@link DeviceTypeConformanceError}: a misplaced
 * singleton, which is unambiguous, and any violation when the environment variable `endpoint.validation.strict` is set.
 *
 * Each violation is logged once per endpoint and recorded while it persists; a later pass logs only the violations not
 * recorded. A violation that disappears and returns is logged again, because it is a new departure.
 *
 * Refusing is possible only while an endpoint is constructed, because only a construction error rolls the endpoint
 * back. A server node's endpoint initializer calls {@link assertPlacement} before an endpoint's behaviors initialize.
 * Once the endpoint's parts have initialized it calls {@link validateNodeScope} for the node endpoint, which judges the
 * initial tree, or {@link validateAddition} for an endpoint added to a constructed tree, which judges it with its
 * ancestors. A refusal fails the endpoint's construction; {@link Endpoint.add} then rolls back an essential endpoint,
 * while a non-essential one stays in its parent, crashed.
 *
 * After construction the node reports two changes: {@link deviceTypesChanged} when an endpoint's `DeviceTypeList`
 * changes and {@link endpointDestroyed} when an endpoint is destroyed. Both only log and record, in strict mode and for
 * a misplaced singleton too, so a later addition is not refused for a violation one of them already recorded.
 * Neither judges anything while the changed endpoint's owner or any endpoint above it is being constructed or
 * destroyed, or has crashed: construction judges the tree itself, and a tree being destroyed has nothing left to
 * report.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export class DeviceTypeConformanceService {
    readonly #node: Endpoint;
    readonly #strict: boolean;
    readonly #model: MatterModel;
    readonly #logger: Logger;
    readonly #reported = new Map<Endpoint, Map<string, Violation>>();

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
        this.#validate(
            isEndpoint(endpoints) ? [endpoints] : endpoints,
            new ValidationPass(this.#model),
            options,
            false,
        );
    }

    /**
     * {@link validate} every endpoint of the node scope {@link endpoint} belongs to, in one pass.
     *
     * A pass that refuses an endpoint records nothing as reported, because the construction it refuses fails.
     */
    validateNodeScope(endpoint: Endpoint, options?: DeviceTypeConformanceService.ValidateOptions) {
        const pass = new ValidationPass(this.#model);
        const nodeEndpoint = ConditionAssertions.nodeEndpointOf(endpoint, pass);
        if (nodeEndpoint === undefined) {
            return;
        }
        this.#validate(ConditionAssertions.nodeScopeOf(nodeEndpoint, pass), pass, options, true);
    }

    /**
     * {@link validate} {@link endpoint}, its descendants and its ancestors in one pass. This is what adding the endpoint
     * to a constructed tree may change: the ancestors' composition includes it.
     *
     * An ancestor is refused only for a violation not recorded before, so an addition is refused only for what it
     * causes, as long as every earlier change was reported through {@link deviceTypesChanged} or
     * {@link endpointDestroyed} and was judged there. Siblings and a child crashing after construction are not. A pass
     * that refuses an endpoint records nothing as reported, because the addition it refuses fails.
     */
    validateAddition(endpoint: Endpoint, options?: DeviceTypeConformanceService.ValidateOptions) {
        const pass = new ValidationPass(this.#model);
        this.#validate(subtreeAndAncestorsOf(endpoint, pass), pass, options, true);
    }

    /**
     * Report the violations a change to the `DeviceTypeList` of the constructed {@link endpoint} causes, in one pass
     * over the endpoint, its descendants and its ancestors. The device types of an endpoint decide its own requirements,
     * the conditions and singletons of what lies below it and the composition of what lies above it. Siblings are not
     * judged, although the Base `Duplicate` condition compares an endpoint with its siblings.
     *
     * Never refuses; see {@link DeviceTypeConformanceService.ValidateOptions.refuse}. Judges nothing while
     * {@link endpoint} or an ancestor is not constructed, has crashed or is being destroyed.
     */
    deviceTypesChanged(endpoint: Endpoint) {
        if (!this.#isSettled(endpoint)) {
            return;
        }

        const pass = new ValidationPass(this.#model);
        this.#validate(subtreeAndAncestorsOf(endpoint, pass), pass, { refuse: false }, false);
    }

    /**
     * Forget {@link endpoint}, which is being destroyed, and report what its removal changes in the composition of its
     * ancestors, in one pass once its owner no longer lists it.
     *
     * Call this for every endpoint whose destruction the node emits, descendants included, while the endpoint still has
     * its owner. Never refuses; see {@link DeviceTypeConformanceService.ValidateOptions.refuse}. Judges nothing while
     * an ancestor is not constructed, has crashed or is being destroyed itself, so destroying a subtree judges only the
     * ancestors of the subtree and closing the node judges nothing.
     */
    endpointDestroyed(endpoint: Endpoint) {
        this.forget(endpoint);

        const owner = endpoint.owner;
        if (owner === undefined || !this.#isSettled(owner)) {
            return;
        }

        // The owner lists the endpoint until the endpoint's destruction completes
        endpoint.lifecycle.destroyed.once(() => {
            const ancestors = new Array<Endpoint>();
            for (let ancestor: Endpoint | undefined = owner; ancestor !== undefined; ancestor = ancestor.owner) {
                ancestors.push(ancestor);
            }
            this.#validate(ancestors, new ValidationPass(this.#model), { refuse: false }, false);
        });
    }

    /**
     * Refuse {@link endpoint} when it or a descendant carries a server cluster that a device type of an endpoint above
     * it in the same node scope declares a singleton.
     *
     * Judges the endpoint and its descendants in one pass before their behaviors initialize, so the misplacement is
     * refused before a behavior that works only on its node endpoint fails. {@link validate} judges declarations
     * elsewhere in the node scope. The first misplacing endpoint is named. Nothing is recorded as reported.
     *
     * @throws {DeviceTypeConformanceError} when a singleton is misplaced
     */
    assertPlacement(endpoint: Endpoint) {
        const violations = DeviceTypeConformance.misplacedSingletons(endpoint, new ValidationPass(this.#model));
        if (!violations.length) {
            return;
        }

        const misplacing = violations[0].endpoint;
        throw new DeviceTypeConformanceError(
            misplacing.toString(),
            violations
                .filter(violation => violation.endpoint === misplacing)
                .map(violation => new DeviceTypeViolationError(violation)),
        );
    }

    #validate(
        endpoints: Iterable<Endpoint>,
        pass: ValidationPass,
        options: DeviceTypeConformanceService.ValidateOptions | undefined,
        atomic: boolean,
    ) {
        const refuse = options?.refuse ?? true;
        let refusal: DeviceTypeConformanceError | undefined;
        const judged = new Array<{ endpoint: Endpoint; current: Map<string, Violation> }>();

        for (const endpoint of endpoints) {
            const judgement = this.#judge(endpoint, pass);
            if (judgement === undefined) {
                continue;
            }

            const { fresh, current } = judgement;
            if (
                refuse &&
                refusal === undefined &&
                fresh.length &&
                (this.#strict || fresh.some(({ kind }) => kind === "singletonMisplaced"))
            ) {
                // Left as it was, so the endpoint is refused again until it conforms
                refusal = new DeviceTypeConformanceError(
                    endpoint.toString(),
                    fresh.map(violation => new DeviceTypeViolationError(violation)),
                );
                continue;
            }

            judged.push({ endpoint, current });

            if (!fresh.length) {
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

        if (refusal === undefined || !atomic) {
            for (const { endpoint, current } of judged) {
                if (current.size) {
                    this.#reported.set(endpoint, current);
                } else {
                    this.#reported.delete(endpoint);
                }
            }
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
     * The violations recorded for {@link endpoint}: those found by the last pass that judged it and recorded, which a
     * pass refusing any endpoint of an addition or initial tree does not.
     */
    violationsOf(endpoint: Endpoint): Violation[] {
        return [...(this.#reported.get(endpoint)?.values() ?? [])];
    }

    /**
     * Drop what was reported for every endpoint, as a factory reset requires.
     */
    reset() {
        this.#reported.clear();
    }

    /**
     * The violations of {@link endpoint} not reported before, and the keys of all it violates now. Undefined for an
     * endpoint in no node scope, which is not judged.
     */
    #judge(endpoint: Endpoint, pass: ValidationPass) {
        const nodeEndpoint = ConditionAssertions.nodeEndpointOf(endpoint, pass);
        if (nodeEndpoint === undefined) {
            return;
        }

        const violations = DeviceTypeConformance.check(endpoint, pass);

        // The kind and requirement path identify a violation on its endpoint; check() reports each pair once
        const current = new Map(violations.map(violation => [keyOf(violation), violation]));
        const previous = this.#reported.get(endpoint);
        const fresh = violations.filter(violation => !previous?.has(keyOf(violation)));

        return { fresh, current };
    }

    /**
     * Whether {@link endpoint} and every ancestor up to the node are constructed, not crashed and not being destroyed.
     */
    #isSettled(endpoint: Endpoint) {
        for (let current: Endpoint | undefined = endpoint; current !== undefined; current = current.owner) {
            if (!current.lifecycle.isReady || current.construction.status !== Lifecycle.Status.Active) {
                return false;
            }
            if (current.owner === undefined) {
                return current === this.#node;
            }
        }
        return false;
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
         * to true. Off, those violations log and are recorded like any other, a misplaced singleton included.
         * {@link DeviceTypeConformanceService.deviceTypesChanged} and
         * {@link DeviceTypeConformanceService.endpointDestroyed} judge with it off, because nothing rolls back a change
         * after construction.
         *
         * A refused endpoint's violations do not count as reported, so validating it again refuses it again.
         */
        refuse?: boolean;
    }
}

/**
 * {@link endpoint}, its descendants and its ancestors.
 */
function subtreeAndAncestorsOf(endpoint: Endpoint, pass: ValidationPass) {
    const endpoints = new Array<Endpoint>();

    const visit = (current: Endpoint) => {
        endpoints.push(current);
        for (const child of EndpointFacts.of(current, pass).children) {
            visit(child);
        }
    };
    visit(endpoint);

    for (let ancestor = endpoint.owner; ancestor !== undefined; ancestor = ancestor.owner) {
        endpoints.push(ancestor);
    }

    return endpoints;
}

function keyOf({ kind, requirement }: Violation) {
    return `${kind} ${requirement}`;
}

function isEndpoint(value: Endpoint | Iterable<Endpoint>): value is Endpoint {
    return !(Symbol.iterator in value);
}
