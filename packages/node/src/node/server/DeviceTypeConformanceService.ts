/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Diagnostic, Environment, ImplementationError, Logger, ObserverGroup } from "@matter/general";
import { DeviceTypeConformance, DeviceTypeValidationPass, MatterModel } from "@matter/model";
import { DeviceTypeConformanceError, DeviceTypeViolationError, Violation } from "./DeviceTypeConformanceError.js";
import { DeviceTypeValidation } from "./DeviceTypeValidation.js";
import { NodeScopeIndex } from "./NodeScopeIndex.js";
import { Presence, ServerEndpointFacts } from "./ServerEndpointFacts.js";

import Reach = DeviceTypeValidationPass.Reach;

/**
 * Reports where the endpoints of a node depart from the device types they declare.
 *
 * The `endpoint.validation` variable (environment variable `MATTER_ENDPOINT_VALIDATION`) sets the {@link mode}.
 * Reporting is one warning per endpoint in the default mode, `"warn"`, because departing from a device type is a
 * certification problem rather than a runtime fault. Two cases refuse the endpoint with a
 * {@link DeviceTypeConformanceError}: a new misplaced singleton, which is unambiguous, and any new violation in mode
 * `"strict"`. In mode `"off"` the node judges no device types on its own; see {@link mode}.
 *
 * Each violation is logged once per endpoint and recorded while it persists; a later pass logs only the violations not
 * recorded. A violation that disappears and returns is logged again, because it is a new departure.
 *
 * Refusing is possible only while an endpoint is constructed, because only a construction error rolls the endpoint
 * back. A refused construction logs and records nothing, because every endpoint of its pass was judged in a tree the
 * refused endpoint then leaves, rolled back or crashed. A server node's endpoint initializer calls
 * {@link constructing} before an endpoint's behaviors initialize and {@link constructed} once its parts have
 * initialized. For the node endpoint the latter judges the initial tree; for an endpoint added to a constructed tree it
 * judges what the addition may change. A refusal fails the endpoint's construction; {@link Endpoint.add} then rolls
 * back an essential endpoint, while a non-essential one stays in its parent, crashed.
 *
 * After construction the node follows two changes: a change of an endpoint's `DeviceTypeList` and the destruction of
 * an endpoint. Both only log and record, in strict mode and for a misplaced singleton too, so a later addition is not
 * refused for a violation one of them already recorded. Neither judges anything while the changed endpoint's owner or
 * any endpoint above it is being constructed or destroyed, or has crashed: construction judges the tree itself, and a
 * tree being destroyed has nothing left to report.
 *
 * The passes of a service share what they derive from a whole node scope until a change the node follows may alter
 * it; see {@link NodeScopeIndex}.
 *
 * An addition, a `DeviceTypeList` change and a removal each judge, in one pass, the endpoints whose judgement the
 * change can alter. A judgement of an endpoint reads the endpoint, its composition, its ancestors, its siblings only
 * through the Base `Duplicate` condition, and the facts of its node scope that the endpoints'
 * {@link DeviceTypeValidationPass.reachOf reach} names.
 *
 * The changed endpoints are an added endpoint and its descendants, an endpoint whose `DeviceTypeList` changed, or a
 * removed endpoint and its destroyed descendants. So a change judges:
 *
 * - the added or changed endpoint and its descendants;
 * - the ancestors of the added, changed or removed endpoint;
 * - each sibling whose `Duplicate` condition differs from what the sibling's last recorded judgement read, and the
 *   sibling's descendants;
 * - the node endpoint when a changed endpoint, before or after the change, or such a sibling states a condition
 *   requirement located at the node endpoint, and then also its
 *   {@link DeviceTypeValidationPass.nodeConditionReadersOf condition readers} unless the node endpoint's conditions
 *   are those every recorded reader was last judged under;
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
 * - {@link constructing} reads the device types an endpoint still being constructed is configured with, not a
 *   `DeviceTypeList` persisted from an earlier run. So when a restart constructs the tree again, a singleton declared
 *   only by a device type added at runtime is refused only once the declaring endpoint's parts have initialized, and
 *   not at all in mode `"off"`.
 * - {@link validateNodeScope} judges only the node scope the endpoint it is called for belongs to, so a node scope
 *   nested in the initial tree is judged only by later changes in it. Only RootNode is classified a node,
 *   so no standard tree nests one.
 * - A construction is refused after the endpoint's `ready` and `partsReady` lifecycle events, so their listeners, such
 *   as the node initialization of `CommissioningServer`, may already have run for an endpoint that is then refused.
 *   A refused endpoint's number stays in its parent's `PartsList`.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export class DeviceTypeConformanceService implements DeviceTypeValidation {
    readonly #node: ServerNode;
    readonly #mode: DeviceTypeValidation.Mode;
    readonly #model?: MatterModel;
    readonly #logger: Logger;
    readonly #facts = new ServerEndpointFacts();
    #reported = new WeakMap<Endpoint, Map<string, Violation>>();
    readonly #index?: NodeScopeIndex;
    readonly #followed = new Map<Endpoint, ObserverGroup>();

    /**
     * @param node the node whose endpoints are validated, in the model {@link ServerNode.matter} answers
     * @param options for tests: the environment that supplies `endpoint.validation` and the log origin instead of the
     * node's, and a model to resolve in instead of the node's
     * @throws {ImplementationError} when `endpoint.validation` is not a {@link DeviceTypeValidation.Mode mode}
     *
     * @internal
     */
    constructor(node: ServerNode, options?: { environment?: Environment; model?: MatterModel }) {
        const environment = options?.environment ?? node.env;
        this.#node = node;
        this.#mode = modeOf(environment);
        this.#model = options?.model;
        this.#logger = environment.logger("DeviceTypeConformance");
        if (this.#mode !== "off") {
            this.#index = new NodeScopeIndex(this.#facts);
        }
    }

    /**
     * The mode `endpoint.validation` set when the service was created.
     *
     * In mode `"off"` the node runs no pass other than the singleton placement check of {@link constructing}: no
     * construction pass, no pass after a `DeviceTypeList` change or a removal, and it does not follow its endpoints.
     * It keeps the placement check, because a behavior that works only on its node endpoint otherwise fails with an
     * untyped error. The methods of the service still judge when called, as in mode `"warn"`, so an application can
     * check its tree on request, but they record nothing: each call logs every violation it finds and returns it.
     */
    get mode() {
        return this.#mode;
    }

    /**
     * Judge {@link endpoints} in one pass and report the violations not already reported for each.
     *
     * The pass collects each node scope's conditions once and shares endpoint and composition facts across the
     * endpoints, which validating them in separate calls repeats per call. An endpoint in no node scope is not judged.
     *
     * With {@link DeviceTypeValidation.ValidateOptions.refuse} (the default) an endpoint with a new misplaced
     * singleton, or with any new violation in mode `"strict"`, throws. The error names the first refused endpoint and
     * carries the others; none of them is logged or recorded. Every other endpoint with new violations logs one warning
     * listing them.
     *
     * @returns the violations of each judged endpoint
     * @throws {DeviceTypeConformanceError} when an endpoint is refused
     * @throws {ImplementationError} when an endpoint is not a part of this service's node, such as a peer's
     */
    validate(endpoints: Endpoint | Iterable<Endpoint>, options?: DeviceTypeValidation.ValidateOptions) {
        const list = isEndpoint(endpoints) ? [endpoints] : [...endpoints];
        for (const endpoint of list) {
            this.#assertOwn(endpoint);
        }
        return this.#validate({ endpoints: list }, this.#pass(), options, false);
    }

    /**
     * {@link validate} every endpoint of the node scope {@link endpoint} belongs to, in one pass.
     *
     * A pass that refuses an endpoint records and logs nothing, because the construction it refuses fails.
     *
     * @returns the violations of each judged endpoint, none when {@link endpoint} is in no node scope
     * @throws {ImplementationError} when {@link endpoint} is not a part of this service's node
     */
    validateNodeScope(endpoint: Endpoint, options?: DeviceTypeValidation.ValidateOptions) {
        this.#assertOwn(endpoint);
        const pass = this.#pass();
        const nodeEndpoint = pass.nodeEndpointOf(endpoint);
        if (nodeEndpoint === undefined) {
            return new Map<Endpoint, Violation[]>();
        }
        return this.#validate(
            { endpoints: pass.nodeScopeOf(nodeEndpoint), readersOf: nodeEndpoint },
            pass,
            options,
            true,
        );
    }

    /**
     * The violations recorded for {@link endpoint}: those found by the last pass that judged it and recorded, which a
     * pass refusing any endpoint of an addition or initial tree does not. Always empty in mode `"off"`.
     */
    violationsOf(endpoint: Endpoint): Violation[] {
        return [...(this.#reported.get(endpoint)?.values() ?? [])];
    }

    /**
     * Prepare {@link endpoint}, a server endpoint about to initialize its behaviors.
     *
     * For an endpoint constructed on its own rather than with its owner's tree, refuse it when it or a descendant
     * carries a server cluster that a device type of an endpoint above it in the same node scope declares a
     * singleton. Judges the endpoint and its descendants in one pass before their behaviors initialize, so the
     * misplacement is refused before a behavior that works only on its node endpoint fails; the construction pass
     * judges declarations elsewhere in the node scope. The first misplacing endpoint is named. Nothing is recorded.
     *
     * Unless the mode is `"off"`, follow the endpoint's `DeviceTypeList` from here on, and for the node endpoint the
     * lifecycle of every endpoint of the node.
     *
     * @throws {DeviceTypeConformanceError} when a singleton is misplaced
     *
     * @internal
     */
    constructing(endpoint: Endpoint) {
        if (isConstructionRoot(endpoint)) {
            this.#assertPlacement(endpoint);
        }
        if (this.#index !== undefined) {
            this.#follow(endpoint);
        }
    }

    /**
     * Judge the tree whose construction {@link endpoint} completes once its parts are initialized: the whole node
     * scope for the node endpoint, or what an endpoint added to a constructed tree may change, as the class
     * documentation lists it for an addition. An endpoint constructed with its owner's tree is judged with that tree,
     * so a tree is judged in one pass. Judges nothing in mode `"off"`.
     *
     * An addition is refused only for a violation not recorded before, so it is refused only for what it causes, as
     * long as every earlier change was followed and judged. A child crashing after construction is not. A pass that
     * refuses an endpoint records and logs nothing, because the construction it refuses fails.
     *
     * @throws {DeviceTypeConformanceError} when an endpoint is refused
     *
     * @internal
     */
    constructed(endpoint: Endpoint) {
        const index = this.#index;
        if (index === undefined || !isConstructionRoot(endpoint)) {
            return;
        }

        if (endpoint.owner === undefined) {
            this.validateNodeScope(endpoint);
            return;
        }

        this.#assertOwn(endpoint);
        const pass = this.#pass();
        this.#validate(this.#affectedBy({ kind: "added", endpoint }, pass, index), pass, undefined, true);
    }

    /**
     * Drop what was reported and recorded for {@link endpoint}, so a later {@link validate} reports all its violations
     * again and a later change counts it unrecorded. The endpoint stays followed and listed.
     *
     * @internal
     */
    forget(endpoint: Endpoint) {
        this.#reported.delete(endpoint);
        this.#index?.forget(endpoint);
    }

    /**
     * Drop what was reported for every endpoint, as a factory reset requires.
     *
     * @internal
     */
    reset() {
        this.#reported = new WeakMap();
        this.#index?.clear();
    }

    /**
     * Stop following the node's endpoints.
     *
     * @internal
     */
    close() {
        for (const observers of this.#followed.values()) {
            observers.close();
        }
        this.#followed.clear();
    }

    /**
     * What the passes of this service keep of the node's tree, undefined in mode `"off"`.
     *
     * @internal
     */
    get index() {
        return this.#index;
    }

    /**
     * Textual description of the node, for diagnostics.
     */
    toString() {
        return `device type conformance of ${this.#node}`;
    }

    #follow(endpoint: Endpoint) {
        this.#release(endpoint);
        const observers = new ObserverGroup();
        this.#followed.set(endpoint, observers);

        if (endpoint === this.#node) {
            observers.on(endpoint.lifecycle.changed, (change, changed) => this.#lifecycleChanged(change, changed));
        }
        observers.on(endpoint.lifecycle.reset, () => this.#endpointReset(endpoint));
        if (endpoint.behaviors.has(DescriptorServer)) {
            observers.on(endpoint.eventsOf(DescriptorServer).deviceTypeList$Changed, () =>
                this.#deviceTypesChanged(endpoint),
            );
        }
    }

    #release(endpoint: Endpoint) {
        this.#followed.get(endpoint)?.close();
        this.#followed.delete(endpoint);
    }

    #lifecycleChanged(change: EndpointLifecycle.Change, endpoint: Endpoint) {
        this.#index?.noteChanged(endpoint);
        if (change === EndpointLifecycle.Change.Destroyed) {
            this.#endpointDestroyed(endpoint);
        }
    }

    /**
     * Report the violations a change to the `DeviceTypeList` of {@link endpoint} causes, in one pass over what the
     * change may alter, as the class documentation lists it. Never refuses. Judges nothing while {@link endpoint} or an
     * ancestor is not constructed, has crashed or is being destroyed.
     */
    #deviceTypesChanged(endpoint: Endpoint) {
        const index = this.#index;
        if (index === undefined) {
            return;
        }

        // The emitter is the commit of the change, which must not fail for a report
        try {
            index.noteChanged(endpoint);
            if (!this.#isSettled(endpoint)) {
                return;
            }

            const pass = this.#pass();
            const change: Change = { kind: "changed", endpoint, previous: index.entryOf(endpoint) };
            this.#validate(this.#affectedBy(change, pass, index), pass, { refuse: false }, false);
        } catch (error) {
            this.#logger.error(`Cannot judge the device types of ${endpoint} after they changed:`, error);
        }
    }

    /**
     * Forget {@link endpoint}, which is being destroyed, and report what its removal changes, in one pass once its
     * owner no longer lists it, as the class documentation lists it for a removal.
     *
     * The node emits the destruction of every endpoint, descendants included, while the endpoint still has its owner.
     * Never refuses. Judges nothing while an ancestor is not constructed, has crashed or is being destroyed itself, so
     * destroying a subtree judges only what the removal of the subtree changes and closing the node judges nothing.
     */
    #endpointDestroyed(endpoint: Endpoint) {
        const index = this.#index;
        if (index === undefined) {
            return;
        }

        this.#release(endpoint);
        this.#reported.delete(endpoint);
        const previous = index.removed(endpoint);

        const owner = endpoint.owner;
        if (owner === undefined) {
            return;
        }

        if (!this.#isSettled(owner)) {
            // Descendants are destroyed before their owner, whose removal then answers for them
            index.widen(owner, previous?.reach ?? Reach.NodeScope);
            return;
        }

        // The owner lists the endpoint until the endpoint's destruction completes
        endpoint.lifecycle.destroyed.once(() => {
            const pass = this.#pass();
            this.#validate(
                this.#affectedBy({ kind: "removed", owner, previous }, pass, index),
                pass,
                { refuse: false },
                false,
            );
        });
    }

    /**
     * Stop following {@link endpoint}, which a rollback or a factory reset returns to its unconstructed state. A
     * factory reset constructs it again, which follows it again.
     */
    #endpointReset(endpoint: Endpoint) {
        this.#release(endpoint);
        this.#index?.removed(endpoint);
    }

    #assertPlacement(endpoint: Endpoint) {
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
        { endpoints, readersOf }: Affected,
        pass: DeviceTypeValidationPass<Endpoint>,
        options: DeviceTypeValidation.ValidateOptions | undefined,
        atomic: boolean,
    ): DeviceTypeValidation.Verdict {
        const refuse = options?.refuse ?? true;
        const refused = new Array<Judged>();
        const judged = new Array<Judged & { current: Map<string, Violation> }>();

        for (const endpoint of endpoints) {
            const judgement = this.#judge(endpoint, pass);
            if (judgement === undefined) {
                continue;
            }

            const { fresh, current } = judgement;
            if (
                refuse &&
                fresh.length &&
                (this.#mode === "strict" || fresh.some(({ kind }) => kind === "singletonMisplaced"))
            ) {
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

        const verdict: DeviceTypeValidation.Verdict = new Map();
        for (const { endpoint, fresh, current } of judged) {
            verdict.set(endpoint, [...current.values()]);

            if (this.#index !== undefined) {
                this.#index.recorded(endpoint, entryOf(endpoint, pass));
                this.#noteReaderRecorded(endpoint, pass, this.#index);
                if (current.size) {
                    this.#reported.set(endpoint, current);
                } else {
                    this.#reported.delete(endpoint);
                }
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

        if (readersOf !== undefined) {
            this.#index?.readersJudged(readersOf, conditionsKeyOf(readersOf, pass));
        }

        return verdict;
    }

    /**
     * Stop trusting what the condition readers of {@link endpoint}'s node endpoint were judged under when
     * {@link endpoint}, which may be one of them, was recorded under other conditions of the node endpoint.
     */
    #noteReaderRecorded(endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>, index: NodeScopeIndex) {
        const nodeEndpoint = pass.nodeEndpointOf(endpoint);
        if (
            nodeEndpoint === undefined ||
            nodeEndpoint === endpoint ||
            index.readersJudgedUnder(nodeEndpoint) === undefined ||
            !pass.mayReadNodeConditions(endpoint, nodeEndpoint)
        ) {
            return;
        }
        if (index.readersJudgedUnder(nodeEndpoint) !== conditionsKeyOf(nodeEndpoint, pass)) {
            index.readersJudged(nodeEndpoint, undefined);
        }
    }

    /**
     * The violations of {@link endpoint} not reported before, and the keys of all it violates now. Undefined for an
     * endpoint in no node scope, which is not judged.
     */
    #judge(endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>) {
        if (pass.nodeEndpointOf(endpoint) === undefined) {
            return;
        }

        const violations = DeviceTypeConformance.check(endpoint, pass);

        // The kind and requirement path identify a violation on its endpoint; check() reports each pair once
        const current = new Map(violations.map(violation => [Violation.keyOf(violation), violation]));
        const previous = this.#reported.get(endpoint);
        const fresh = violations.filter(violation => !previous?.has(Violation.keyOf(violation)));

        return { fresh, current };
    }

    /**
     * The endpoints whose judgement {@link change} may alter, as the class documentation lists them, in the order a
     * pass judges them: the changed subtree, the affected siblings with their descendants, the ancestors, then the
     * node endpoint with its condition readers or the rest of the node scope.
     *
     * A sibling is compared with its recorded entry, which records what its last recorded judgement read, so a sibling
     * whose `Duplicate` condition the change leaves as it was is not judged however many siblings share its device
     * type. An entry that is missing counts as changed. Only the index's {@link NodeScopeIndex.suspectsOf suspects} are
     * compared; every other sibling's entry matches it.
     */
    #affectedBy(change: Change, pass: DeviceTypeValidationPass<Endpoint>, index: NodeScopeIndex): Affected {
        const affected = new Set<Endpoint>();
        const addSubtree = (endpoint: Endpoint) => {
            affected.add(endpoint);
            for (const child of pass.childrenOf(endpoint)) {
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
                const now = entryOf(endpoint, pass);
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
            const flipped = new Array<Endpoint>();
            for (const sibling of [...index.suspectsOf(owner)]) {
                if (sibling === changed || this.#facts.presenceOf(sibling) !== Presence.Active) {
                    continue;
                }
                const recorded = index.entryOf(sibling)?.duplicate;
                if (recorded !== undefined && recorded === pass.isDuplicate(sibling)) {
                    index.settled(sibling);
                    continue;
                }
                flipped.push(sibling);
            }

            for (const sibling of inPartsOrder(owner, flipped)) {
                addSubtree(sibling);
                if (pass.assertsOnNodeEndpoint(sibling)) {
                    reach = widerOf(reach, Reach.NodeEndpoint);
                }
            }
        }

        for (let ancestor = owner; ancestor !== undefined; ancestor = ancestor.owner) {
            affected.add(ancestor);
        }

        if (reach === Reach.None) {
            return { endpoints: [...affected] };
        }

        const nodeEndpoint = pass.nodeEndpointOf(anchor);
        if (nodeEndpoint === undefined) {
            return { endpoints: [...affected] };
        }

        if (reach === Reach.NodeScope) {
            for (const endpoint of pass.nodeScopeOf(nodeEndpoint)) {
                affected.add(endpoint);
            }
            return { endpoints: [...affected], readersOf: nodeEndpoint };
        }

        affected.add(nodeEndpoint);
        if (index.readersJudgedUnder(nodeEndpoint) === conditionsKeyOf(nodeEndpoint, pass)) {
            return { endpoints: [...affected] };
        }
        for (const endpoint of pass.nodeConditionReadersOf(nodeEndpoint)) {
            affected.add(endpoint);
        }
        return { endpoints: [...affected], readersOf: nodeEndpoint };
    }

    /**
     * Whether {@link endpoint} and every ancestor up to the node are {@link Presence.Active active}, so an endpoint of
     * a peer, whose node the node owns without listing it, is not.
     */
    #isSettled(endpoint: Endpoint) {
        for (let current = endpoint; ;) {
            if (this.#facts.presenceOf(current) !== Presence.Active) {
                return false;
            }
            if (current === this.#node) {
                return true;
            }
            const { owner } = current;
            if (owner === undefined) {
                return false;
            }
            current = owner;
        }
    }

    /**
     * Throws unless {@link endpoint} reaches this service's node through owners, none of them
     * {@link Presence.Detached detached}.
     */
    #assertOwn(endpoint: Endpoint) {
        for (let current = endpoint; current !== this.#node;) {
            const { owner } = current;
            if (owner === undefined || this.#facts.presenceOf(current) === Presence.Detached) {
                throw new ImplementationError(`Cannot judge ${endpoint}, which is not a part of ${this.#node}`);
            }
            current = owner;
        }
    }

    #pass() {
        return new DeviceTypeValidationPass(this.#facts, this.#model ?? this.#node.matter, this.#index);
    }
}

const modes: readonly DeviceTypeValidation.Mode[] = ["off", "warn", "strict"];

function modeOf(environment: Environment): DeviceTypeValidation.Mode {
    const value = environment.vars.string("endpoint.validation") ?? "warn";
    const mode = modes.find(mode => mode === value);
    if (mode === undefined) {
        const allowed = modes.map(mode => `"${mode}"`).join(", ");
        throw new ImplementationError(
            `Variable endpoint.validation (environment variable MATTER_ENDPOINT_VALIDATION) is "${value}" but must be one of ${allowed}`,
        );
    }
    return mode;
}

/**
 * Whether {@link endpoint} is constructed on its own rather than as a part of an owner under construction, which
 * constructs it with the owner's tree.
 */
function isConstructionRoot(endpoint: Endpoint) {
    return endpoint.owner === undefined || endpoint.owner.lifecycle.isPartsReady;
}

/**
 * The endpoints a pass judges, and the node endpoint whose condition readers are all among them.
 */
interface Affected {
    endpoints: Iterable<Endpoint>;
    readersOf?: Endpoint;
}

/**
 * The conditions of {@link nodeEndpoint} in {@link pass} as one comparable value.
 */
function conditionsKeyOf(nodeEndpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>) {
    return [...pass.nodeEndpointConditionsOf(nodeEndpoint)].sort().join();
}

/**
 * A change {@link DeviceTypeConformanceService} judges the effects of.
 */
type Change =
    | { kind: "added"; endpoint: Endpoint }
    | { kind: "changed"; endpoint: Endpoint; previous?: NodeScopeIndex.Entry }
    | { kind: "removed"; owner: Endpoint; previous?: NodeScopeIndex.Entry };

function widerOf(a: Reach, b: Reach) {
    return a > b ? a : b;
}

function entryOf(endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>): NodeScopeIndex.Entry {
    const isNodeEndpoint = pass.isNodeEndpoint(endpoint);
    return {
        duplicate: pass.isDuplicate(endpoint),
        isNodeEndpoint,
        reach: isNodeEndpoint ? Reach.None : pass.reachOf(endpoint),
    };
}

/**
 * The widest reach of {@link endpoint} and its descendants in the node scope of its owner.
 */
function subtreeReachOf(endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>): Reach {
    if (pass.isNodeEndpoint(endpoint)) {
        return Reach.None;
    }
    return pass
        .childrenOf(endpoint)
        .reduce((reach, child) => widerOf(reach, subtreeReachOf(child, pass)), pass.reachOf(endpoint));
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

/**
 * {@link parts} in the order {@link owner} lists them.
 */
function inPartsOrder(owner: Endpoint, parts: Endpoint[]) {
    if (parts.length < 2) {
        return parts;
    }
    const included = new Set(parts);
    return [...owner.parts].filter(part => included.has(part));
}

function isEndpoint(value: Endpoint | Iterable<Endpoint>): value is Endpoint {
    return !(Symbol.iterator in value);
}
