/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
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
 * rather than a runtime fault. Two cases refuse the endpoint with a {@link DeviceTypeConformanceError}: a new misplaced
 * singleton, which is unambiguous, and any new violation when the `endpoint.validation.strict` variable (environment
 * variable `MATTER_ENDPOINT_VALIDATION_STRICT`) is set.
 *
 * Each violation is logged once per endpoint and recorded while it persists; a later pass logs only the violations not
 * recorded. A violation that disappears and returns is logged again, because it is a new departure.
 *
 * Refusing is possible only while an endpoint is constructed, because only a construction error rolls the endpoint
 * back. A refused construction logs and records nothing, because every endpoint of its pass was judged in a tree the
 * refused endpoint then leaves, rolled back or crashed. A server node's endpoint initializer calls
 * {@link assertPlacement} before an endpoint's behaviors initialize. Once the endpoint's parts have initialized it
 * calls {@link validateNodeScope} for the node endpoint, which judges the initial tree, or {@link validateAddition}
 * for an endpoint added to a constructed tree, which judges what the addition may change. A refusal fails the
 * endpoint's construction; {@link Endpoint.add} then rolls back an essential endpoint,
 * while a non-essential one stays in its parent, crashed.
 *
 * After construction the node reports two changes: {@link deviceTypesChanged} when an endpoint's `DeviceTypeList`
 * changes and {@link endpointDestroyed} when an endpoint is destroyed. Both only log and record, in strict mode and for
 * a misplaced singleton too, so a later addition is not refused for a violation one of them already recorded.
 * Neither judges anything while the changed endpoint's owner or any endpoint above it is being constructed or
 * destroyed, or has crashed: construction judges the tree itself, and a tree being destroyed has nothing left to
 * report.
 *
 * The passes of a service share what they derive from a whole node scope until a change the node reports through
 * {@link lifecycleChanged} or {@link deviceTypesChanged} may alter it; see {@link ValidationPass.Memory}.
 *
 * An addition, a `DeviceTypeList` change and a removal each judge, in one pass, the endpoints whose judgement the
 * change can alter. A judgement of an endpoint reads the endpoint, its composition, its ancestors, its siblings only
 * through the Base `Duplicate` condition, and the facts of its node scope that
 * {@link ConditionAssertions.reachesNodeScope} and {@link DeviceTypeConformance.declaresSingleton} name. Among the
 * ancestors' conditions, those of the node endpoint also hold what any endpoint of the scope asserts there through
 * {@link ConditionAssertions.assertsOnNodeEndpoint a condition requirement located at the node endpoint}.
 *
 * The changed endpoints are an added endpoint and its descendants, an endpoint whose `DeviceTypeList` changed, or a
 * removed endpoint and its destroyed descendants. So a change judges:
 *
 * - the added or changed endpoint and its descendants;
 * - the ancestors of the added, changed or removed endpoint;
 * - each sibling whose `Duplicate` condition differs from what the sibling's last recorded judgement read, and the
 *   sibling's descendants;
 * - the node endpoint and its {@link DeviceTypeConformance.nodeConditionReadersOf condition readers} when a changed
 *   endpoint, before or after the change, or such a sibling states a condition requirement located at the node
 *   endpoint;
 * - the whole node scope when a changed endpoint, before or after the change, carries a fact that reaches the node
 *   scope, when a `DeviceTypeList` change makes the endpoint a node endpoint or stops it being one, or when the
 *   endpoint whose `DeviceTypeList` changed or that was removed, or a destroyed descendant, has no recorded judgement.
 *
 * A sibling's facts that reach the node scope do not depend on its conditions, so a flipped `Duplicate` condition
 * changes only what the sibling asserts.
 *
 * Limits:
 *
 * - A child that crashes after construction reports no change, so its siblings are judged again only by the next
 *   change under the same parent, and a violation it causes is not recorded until then. A strict addition whose pass
 *   judges an endpoint with such a violation is refused for it.
 * - Server clusters added to or dropped from a constructed endpoint report no change either. Their effect is judged
 *   only when a later change judges that endpoint, such as a change to it or an addition below it.
 * - {@link assertPlacement} reads the device types an endpoint still being constructed is configured with, not a
 *   `DeviceTypeList` persisted from an earlier run. So when a restart constructs the tree again, a singleton declared
 *   only by a device type added at runtime is refused only once the declaring endpoint's parts have initialized.
 * - {@link validateNodeScope} judges only the node scope the endpoint it is called for belongs to, so a node scope
 *   nested in the initial tree is judged only by later changes in it. Only RootNode is classified a node,
 *   so no standard tree nests one.
 * - A construction is refused after the endpoint's `ready` and `partsReady` lifecycle events, so their listeners, such
 *   as the node initialization of `CommissioningServer`, may already have run for an endpoint that is then refused.
 *   A refused endpoint's number stays in its parent's `PartsList`.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export class DeviceTypeConformanceService {
    readonly #node: Endpoint;
    readonly #strict: boolean;
    readonly #model: MatterModel;
    readonly #logger: Logger;
    readonly #reported = new Map<Endpoint, Map<string, Violation>>();
    readonly #footprints = new Map<Endpoint, Footprint>();
    readonly #memory = new ValidationPass.Memory();

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
     * Whether any new violation refuses the endpoint, as set by `endpoint.validation.strict` when the service was
     * created.
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
     * singleton, or with any new violation when {@link strict}, throws. The error names the first refused endpoint and
     * carries the others; none of them is logged or recorded. Every other endpoint with new violations logs one warning
     * listing them.
     *
     * @throws {DeviceTypeConformanceError} when an endpoint is refused
     */
    validate(endpoints: Endpoint | Iterable<Endpoint>, options?: DeviceTypeConformanceService.ValidateOptions) {
        this.#validate(isEndpoint(endpoints) ? [endpoints] : endpoints, this.#pass(), options, false);
    }

    /**
     * {@link validate} every endpoint of the node scope {@link endpoint} belongs to, in one pass.
     *
     * A pass that refuses an endpoint records and logs nothing, because the construction it refuses fails.
     */
    validateNodeScope(endpoint: Endpoint, options?: DeviceTypeConformanceService.ValidateOptions) {
        const pass = this.#pass();
        const nodeEndpoint = ConditionAssertions.nodeEndpointOf(endpoint, pass);
        if (nodeEndpoint === undefined) {
            return;
        }
        this.#validate(ConditionAssertions.nodeScopeOf(nodeEndpoint, pass), pass, options, true);
    }

    /**
     * {@link validate} what adding {@link endpoint} to a constructed tree may change, in one pass, as the class
     * documentation lists it for an addition.
     *
     * An endpoint is refused only for a violation not recorded before, so an addition is refused only for what it
     * causes, as long as every earlier change was reported through {@link deviceTypesChanged} or
     * {@link endpointDestroyed} and was judged there. A child crashing after construction is not. A pass that refuses
     * an endpoint records and logs nothing, because the addition it refuses fails.
     */
    validateAddition(endpoint: Endpoint, options?: DeviceTypeConformanceService.ValidateOptions) {
        const pass = this.#pass();
        this.#validate(this.#affectedBy({ kind: "added", endpoint }, pass), pass, options, true);
    }

    /**
     * Report the violations a change to the `DeviceTypeList` of the constructed {@link endpoint} causes, in one pass
     * over what the change may alter, as the class documentation lists it.
     *
     * Never refuses; see {@link DeviceTypeConformanceService.ValidateOptions.refuse}. Judges nothing while
     * {@link endpoint} or an ancestor is not constructed, has crashed or is being destroyed.
     */
    deviceTypesChanged(endpoint: Endpoint) {
        this.#memory.changed(endpoint);
        if (!this.#isSettled(endpoint)) {
            return;
        }

        const pass = this.#pass();
        const change: Change = { kind: "changed", endpoint, previous: this.#footprints.get(endpoint) };
        this.#validate(this.#affectedBy(change, pass), pass, { refuse: false }, false);
    }

    /**
     * Forget {@link endpoint}, which is being destroyed, and report what its removal changes, in one pass once its
     * owner no longer lists it, as the class documentation lists it for a removal.
     *
     * Call this for every endpoint whose destruction the node emits, descendants included, while the endpoint still has
     * its owner. Never refuses; see {@link DeviceTypeConformanceService.ValidateOptions.refuse}. Judges nothing while
     * an ancestor is not constructed, has crashed or is being destroyed itself, so destroying a subtree judges only
     * what the removal of the subtree changes and closing the node judges nothing.
     */
    endpointDestroyed(endpoint: Endpoint) {
        const previous = this.#footprints.get(endpoint);
        this.forget(endpoint);

        const owner = endpoint.owner;
        if (owner === undefined) {
            return;
        }

        if (!this.#isSettled(owner)) {
            // Descendants are destroyed before their owner, whose removal then answers for them
            const footprint = this.#footprints.get(owner);
            if (footprint !== undefined && !footprint.isNodeEndpoint) {
                this.#footprints.set(owner, {
                    ...footprint,
                    reach: widerOf(footprint.reach, previous?.reach ?? Reach.NodeScope),
                });
            }
            return;
        }

        // The owner lists the endpoint until the endpoint's destruction completes
        endpoint.lifecycle.destroyed.once(() => {
            const pass = this.#pass();
            this.#validate(
                this.#affectedBy({ kind: "removed", owner, previous }, pass),
                pass,
                { refuse: false },
                false,
            );
        });
    }

    /**
     * Take note of a lifecycle {@link change} of {@link endpoint}, which the node reports for each of its endpoints,
     * and follow a destruction with {@link endpointDestroyed}.
     *
     * Passes keep what they derive from a whole node scope until a noted change may alter it; see
     * {@link ValidationPass.Memory}. A change that emits no lifecycle change and no `DeviceTypeList` change is not
     * noted.
     */
    lifecycleChanged(change: EndpointLifecycle.Change, endpoint: Endpoint) {
        this.#memory.changed(endpoint);
        if (change === EndpointLifecycle.Change.Destroyed) {
            this.endpointDestroyed(endpoint);
        }
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
        const violations = DeviceTypeConformance.misplacedSingletons(endpoint, this.#pass());
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
        const refused = new Array<Judged>();
        const judged = new Array<Judged & { current: Map<string, Violation> }>();

        for (const endpoint of endpoints) {
            const judgement = this.#judge(endpoint, pass);
            if (judgement === undefined) {
                continue;
            }

            const { fresh, current } = judgement;
            if (refuse && fresh.length && (this.#strict || fresh.some(({ kind }) => kind === "singletonMisplaced"))) {
                // Left as it was, so the endpoint is refused again until it conforms
                refused.push({ endpoint, fresh });
            } else {
                judged.push({ endpoint, fresh, current });
            }
        }

        // Each verdict of the pass counted the refused endpoint, so none of them may be logged or recorded
        if (atomic && refused.length) {
            throw refusalOf(refused);
        }

        for (const { endpoint, fresh, current } of judged) {
            this.#footprints.set(endpoint, footprintOf(endpoint, pass));
            if (current.size) {
                this.#reported.set(endpoint, current);
            } else {
                this.#reported.delete(endpoint);
            }

            if (fresh.length) {
                this.#logger.warn(
                    `Endpoint ${endpoint} violates device type requirements:`,
                    Diagnostic.list(
                        fresh.map(
                            ({ kind, deviceType, requirement, detail }) =>
                                `${kind} ${deviceType} ${requirement}: ${detail}`,
                        ),
                    ),
                );
            }
        }

        if (refused.length) {
            throw refusalOf(refused);
        }
    }

    /**
     * Drop what was reported for {@link endpoint}, so a later {@link validate} reports all its violations again.
     */
    forget(endpoint: Endpoint) {
        this.#reported.delete(endpoint);
        this.#footprints.delete(endpoint);
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
        this.#footprints.clear();
        this.#memory.clear();
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
     * The endpoints whose judgement {@link change} may alter, as the class documentation lists them, in the order a
     * pass judges them: the changed subtree, the affected siblings with their descendants, the ancestors, then the
     * node endpoint with its condition readers or the rest of the node scope.
     *
     * A sibling is compared with its footprint, which records what its last recorded judgement read, so a sibling
     * whose `Duplicate` condition the change leaves as it was is not judged however many siblings share its device
     * type. A footprint that is missing counts as changed.
     */
    #affectedBy(change: Change, pass: ValidationPass): Endpoint[] {
        const affected = new Set<Endpoint>();
        const addSubtree = (endpoint: Endpoint) => {
            affected.add(endpoint);
            for (const child of EndpointFacts.of(endpoint, pass).children) {
                addSubtree(child);
            }
        };

        let owner: Endpoint | undefined;
        let anchor: Endpoint;
        let reach: Reach;
        switch (change.kind) {
            case "added":
                addSubtree(change.endpoint);
                owner = change.endpoint.owner;
                anchor = owner ?? change.endpoint;
                reach = subtreeReachOf(change.endpoint, pass);
                break;

            case "changed": {
                const { endpoint, previous } = change;
                addSubtree(endpoint);
                owner = endpoint.owner;
                anchor = owner ?? endpoint;
                const now = footprintOf(endpoint, pass);
                reach =
                    previous === undefined || previous.isNodeEndpoint !== now.isNodeEndpoint
                        ? Reach.NodeScope
                        : widerOf(previous.reach, now.reach);
                break;
            }

            case "removed":
                owner = anchor = change.owner;
                reach = change.previous === undefined ? Reach.NodeScope : change.previous.reach;
                break;
        }

        if (owner !== undefined) {
            const changed = change.kind === "removed" ? undefined : change.endpoint;
            for (const sibling of EndpointFacts.of(owner, pass).children) {
                if (sibling === changed || sibling.construction.status !== Lifecycle.Status.Active) {
                    continue;
                }
                const recorded = this.#footprints.get(sibling)?.duplicate;
                if (recorded !== undefined && recorded === ConditionAssertions.isDuplicate(sibling, pass)) {
                    continue;
                }
                addSubtree(sibling);
                if (ConditionAssertions.assertsOnNodeEndpoint(sibling, pass)) {
                    reach = widerOf(reach, Reach.NodeEndpoint);
                }
            }
        }

        for (let ancestor = owner; ancestor !== undefined; ancestor = ancestor.owner) {
            affected.add(ancestor);
        }

        if (reach === Reach.None) {
            return [...affected];
        }

        const nodeEndpoint = ConditionAssertions.nodeEndpointOf(anchor, pass);
        if (nodeEndpoint !== undefined) {
            const reached =
                reach === Reach.NodeScope
                    ? ConditionAssertions.nodeScopeOf(nodeEndpoint, pass)
                    : [nodeEndpoint, ...DeviceTypeConformance.nodeConditionReadersOf(nodeEndpoint, pass)];
            for (const endpoint of reached) {
                affected.add(endpoint);
            }
        }

        return [...affected];
    }

    /**
     * Whether {@link endpoint} and every ancestor up to the node are constructed, not crashed and not being destroyed,
     * and each is a part of its owner, so an endpoint of a peer, whose node the node owns without listing it, is not.
     */
    #isSettled(endpoint: Endpoint) {
        for (let current = endpoint; ;) {
            if (!current.lifecycle.isReady || current.construction.status !== Lifecycle.Status.Active) {
                return false;
            }
            if (current === this.#node) {
                return true;
            }
            const { owner } = current;
            if (owner === undefined || !owner.parts.has(current)) {
                return false;
            }
            current = owner;
        }
    }

    #pass() {
        return new ValidationPass(this.#model, this.#memory);
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
 * A change {@link DeviceTypeConformanceService} judges the effects of.
 */
type Change =
    | { kind: "added"; endpoint: Endpoint }
    | { kind: "changed"; endpoint: Endpoint; previous?: Footprint }
    | { kind: "removed"; owner: Endpoint; previous?: Footprint };

/**
 * How far beyond its own subtree, its ancestors and its siblings an endpoint's facts enter the judgement of other
 * endpoints of its node scope. Ordered, so the wider of two is the greater.
 */
enum Reach {
    None,

    /**
     * The node endpoint and its condition readers, through a condition the endpoint asserts on the node endpoint.
     */
    NodeEndpoint,

    /**
     * Every endpoint of the node scope, through a network interface or a singleton declaration.
     */
    NodeScope,
}

function widerOf(a: Reach, b: Reach) {
    return a > b ? a : b;
}

/**
 * What the recorded judgement of an endpoint read that decides which other endpoints a change to it affects.
 */
interface Footprint {
    duplicate: boolean;
    isNodeEndpoint: boolean;

    /**
     * The reach of the endpoint's facts, widened by those of descendants destroyed before it. Always
     * {@link Reach.None} for a node endpoint, whose node scope is its own subtree.
     */
    reach: Reach;
}

function footprintOf(endpoint: Endpoint, pass: ValidationPass): Footprint {
    const isNodeEndpoint = EndpointFacts.of(endpoint, pass).isNodeEndpoint;
    return {
        duplicate: ConditionAssertions.isDuplicate(endpoint, pass),
        isNodeEndpoint,
        reach: isNodeEndpoint ? Reach.None : reachOf(endpoint, pass),
    };
}

function reachOf(endpoint: Endpoint, pass: ValidationPass) {
    if (
        ConditionAssertions.reachesNodeScope(endpoint, pass) ||
        DeviceTypeConformance.declaresSingleton(endpoint, pass)
    ) {
        return Reach.NodeScope;
    }
    return ConditionAssertions.assertsOnNodeEndpoint(endpoint, pass) ? Reach.NodeEndpoint : Reach.None;
}

/**
 * The widest reach of {@link endpoint} and its descendants in the node scope of its owner.
 */
function subtreeReachOf(endpoint: Endpoint, pass: ValidationPass): Reach {
    const facts = EndpointFacts.of(endpoint, pass);
    if (facts.isNodeEndpoint) {
        return Reach.None;
    }
    return facts.children.reduce(
        (reach, child) => widerOf(reach, subtreeReachOf(child, pass)),
        reachOf(endpoint, pass),
    );
}

/**
 * An endpoint a pass judged, with the violations not reported for it before.
 */
interface Judged {
    endpoint: Endpoint;
    fresh: Violation[];
}

/**
 * The error refusing the first of {@link refused}, which carries each other refused endpoint as an error of its own.
 */
function refusalOf([first, ...others]: Judged[]) {
    return new DeviceTypeConformanceError(first.endpoint.toString(), [
        ...violationErrorsOf(first),
        ...others.map(other => new DeviceTypeConformanceError(other.endpoint.toString(), violationErrorsOf(other))),
    ]);
}

function violationErrorsOf({ fresh }: Judged) {
    return fresh.map(violation => new DeviceTypeViolationError(violation));
}

function keyOf({ kind, requirement }: Violation) {
    return `${kind} ${requirement}`;
}

function isEndpoint(value: Endpoint | Iterable<Endpoint>): value is Endpoint {
    return !(Symbol.iterator in value);
}
