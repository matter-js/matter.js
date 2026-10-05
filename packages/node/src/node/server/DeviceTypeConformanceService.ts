/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import { BindingServer } from "#behaviors/binding";
import { DescriptorServer } from "#behaviors/descriptor";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Diagnostic, Environment, ImplementationError, InternalError, Logger, ObserverGroup } from "@matter/general";
import { DeviceTypeConformance, DeviceTypeValidationPass, DeviceTypeViolation, MatterModel } from "@matter/model";
import { DeviceTypeConformanceError, DeviceTypeViolationError } from "./DeviceTypeConformanceError.js";
import { DeviceTypeValidation } from "./DeviceTypeValidation.js";
import { NodeScopeIndex } from "./NodeScopeIndex.js";
import { Presence, ServerEndpointFacts } from "./ServerEndpointFacts.js";

import Reach = DeviceTypeValidationPass.Reach;

/**
 * Validates the endpoints of a server node against the device types they declare. Each server node has one, in its
 * environment.
 *
 * Behaviour, modes and limits: `docs/DEVICE_TYPE_VALIDATION.md`.
 *
 * @see {@link MatterSpecification.v161.Core} § 9.2
 */
export class DeviceTypeConformanceService implements DeviceTypeValidation {
    readonly #node: ServerNode;
    readonly #mode: DeviceTypeValidation.Mode;
    readonly #model?: MatterModel;
    readonly #logger: Logger;
    readonly #facts = new ServerEndpointFacts();
    #reported = new WeakMap<Endpoint, Map<string, DeviceTypeViolation>>();
    readonly #index?: NodeScopeIndex;
    readonly #followed = new Map<Endpoint, ObserverGroup>();
    readonly #destroying = new WeakSet<Endpoint>();

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
     * The mode `endpoint.validation` set when the node was created.
     */
    get mode() {
        return this.#mode;
    }

    /**
     * Judge {@link endpoints} in one pass and report the violations not already reported for each. An endpoint in no
     * node scope is not judged.
     *
     * With {@link DeviceTypeValidation.ValidateOptions.refuse refuse} on, the default, an endpoint with a new misplaced
     * singleton, or with any new violation in mode `"strict"`, is refused: the error carries its new violations, which
     * are neither logged nor recorded. Every other endpoint with new violations logs one warning listing them.
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
     * {@link validate} every endpoint of the node scope {@link endpoint} belongs to, in one pass. A pass that refuses
     * an endpoint records and logs nothing.
     *
     * @returns the violations of each judged endpoint, none when {@link endpoint} is in no node scope
     * @throws {ImplementationError} when {@link endpoint} is not a part of this service's node
     */
    validateNodeScope(endpoint: Endpoint, options?: DeviceTypeValidation.ValidateOptions) {
        this.#assertOwn(endpoint);
        const pass = this.#pass();
        const nodeEndpoint = pass.nodeEndpointOf(endpoint);
        if (nodeEndpoint === undefined) {
            return new Map<Endpoint, DeviceTypeViolation[]>();
        }
        return this.#validate(
            { endpoints: pass.nodeScopeOf(nodeEndpoint), readersOf: nodeEndpoint },
            pass,
            options,
            true,
        );
    }

    /**
     * The violations recorded for {@link endpoint}: those the last pass that judged it and recorded found. Always empty
     * in mode `"off"`.
     */
    violationsOf(endpoint: Endpoint): DeviceTypeViolation[] {
        return [...(this.#reported.get(endpoint)?.values() ?? [])];
    }

    /**
     * Prepare {@link endpoint}, a server endpoint about to initialize its behaviors.
     *
     * Add the default server for each server cluster the Base device type mandates that the endpoint lacks, judged
     * as {@link validate} judges it, whatever the mode, unless the endpoint already supports a behavior with that
     * server's id. Only Binding has one; Descriptor is added to every endpoint before.
     *
     * For an endpoint constructed on its own rather than with its owner's tree, refuse it when it or a descendant
     * carries a server cluster that a device type of an endpoint above it in the same node scope declares a
     * singleton. This runs before their behaviors initialize, because a behavior that works only on the node endpoint
     * otherwise fails with an untyped error. The first misplacing endpoint is named. Nothing is recorded.
     *
     * Unless the mode is `"off"`, follow the endpoint's `DeviceTypeList` from here on, and for the node endpoint the
     * lifecycle of every endpoint of the node.
     *
     * @throws {DeviceTypeConformanceError} when a singleton is misplaced
     *
     * @internal
     */
    constructing(endpoint: Endpoint) {
        this.#addBaseServers(endpoint);
        if (isConstructionRoot(endpoint)) {
            this.#assertPlacement(endpoint);
        }
        if (this.#index !== undefined) {
            this.#follow(endpoint);
        }
    }

    /**
     * Judge the tree whose construction {@link endpoint} completes once its parts are initialized: the whole node
     * scope for the node endpoint, or what an endpoint added to a constructed tree may change. An endpoint constructed
     * with its owner's tree is judged with that tree. Judges nothing in mode `"off"`.
     *
     * An endpoint is refused only for a violation not recorded before. A pass that refuses an endpoint records and logs
     * nothing.
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
     * @internal tests only
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
        switch (change) {
            case EndpointLifecycle.Change.Destroying:
                this.#destroying.add(endpoint);
                break;

            case EndpointLifecycle.Change.ServersChanged:
                this.#index?.invalidate(endpoint);
                break;
        }

        this.#index?.noteChanged(endpoint);
        if (change === EndpointLifecycle.Change.Destroyed) {
            this.#endpointDestroyed(endpoint);
        }
    }

    /**
     * Whether {@link endpoint} or an ancestor is being destroyed.
     */
    #isInDestruction(endpoint: Endpoint) {
        for (let current: Endpoint | undefined = endpoint; current !== undefined; current = current.owner) {
            if (this.#destroying.has(current)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Report the violations a change to the `DeviceTypeList` of {@link endpoint} causes, in one pass over what the
     * change may alter. Never refuses. Judges nothing while {@link endpoint} or an
     * ancestor is not constructed, has crashed or is being destroyed.
     */
    #deviceTypesChanged(endpoint: Endpoint) {
        const index = this.#index;
        if (index === undefined) {
            return;
        }

        // The emitter is the commit of the change, which must not fail for a report
        try {
            const previous = index.invalidate(endpoint);
            index.noteChanged(endpoint);
            if (!this.#isSettled(endpoint)) {
                return;
            }

            const pass = this.#pass();
            const change: Change = { kind: "changed", endpoint, previous };
            this.#validate(this.#affectedBy(change, pass, index), pass, { refuse: false }, false);
        } catch (error) {
            this.#logger.error(`Cannot judge the device types of ${endpoint} after they changed:`, error);
        }
    }

    /**
     * Forget {@link endpoint}, which is being destroyed, and report what its removal changes, in one pass once its
     * owner no longer lists it.
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
            // The emitter is the destruction, which must not fail for a report
            try {
                const pass = this.#pass();
                this.#validate(
                    this.#affectedBy({ kind: "removed", owner, previous }, pass, index),
                    pass,
                    { refuse: false },
                    false,
                );
            } catch (error) {
                this.#logger.error(`Cannot judge what the removal of ${endpoint} from ${owner} changes:`, error);
            }
        });
    }

    /**
     * Stop following {@link endpoint}, which a rollback, a factory reset or its deletion returns to its unconstructed
     * state. A factory reset constructs it again, which follows it again.
     *
     * An endpoint being destroyed keeps its recorded entry until it is destroyed, because its removal must answer for
     * what the recorded judgements read of it.
     */
    #endpointReset(endpoint: Endpoint) {
        this.#release(endpoint);
        if (!this.#isInDestruction(endpoint)) {
            this.#index?.removed(endpoint);
        }
    }

    #addBaseServers(endpoint: Endpoint) {
        const pass = new DeviceTypeValidationPass(new ServerEndpointFacts(endpoint), this.#model ?? this.#node.matter);
        for (const requirement of DeviceTypeConformance.missingBaseServersOf(endpoint, pass)) {
            const server = baseServerOf(requirement.id);
            if (server !== undefined && !endpoint.behaviors.has(server.id)) {
                endpoint.behaviors.inject(server, undefined, false);
            }
        }
    }

    #assertPlacement(endpoint: Endpoint) {
        const [first] = DeviceTypeConformance.misplacedSingletons(endpoint, this.#pass());
        if (first === undefined) {
            return;
        }

        const [misplacing, [violation, ...others]] = first;
        throw new DeviceTypeConformanceError([
            new DeviceTypeViolationError(misplacing, violation),
            ...others.map(other => new DeviceTypeViolationError(misplacing, other)),
        ]);
    }

    #validate(
        { endpoints, readersOf }: Affected,
        pass: DeviceTypeValidationPass<Endpoint>,
        options: DeviceTypeValidation.ValidateOptions | undefined,
        atomic: boolean,
    ): DeviceTypeValidation.Verdict {
        const refuse = options?.refuse ?? true;
        const refused = new Array<Judged>();
        const judged = new Array<Judged & { current: Map<string, DeviceTypeViolation> }>();

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

        const current = new Map(violations.map(violation => [DeviceTypeViolation.keyOf(violation), violation]));
        const previous = this.#reported.get(endpoint);
        const fresh = violations.filter(violation => !previous?.has(DeviceTypeViolation.keyOf(violation)));

        return { fresh, current };
    }

    /**
     * The endpoints whose judgement {@link change} may alter, in the order a pass judges them.
     *
     * A judgement of an endpoint reads the endpoint, its composition, its ancestors, its siblings only through the Base
     * `Duplicate` condition, and the facts of its node scope that the endpoints'
     * {@link DeviceTypeValidationPass.reachOf reach} names. So a change judges:
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
     *   endpoint whose `DeviceTypeList` changed or that was removed, or a destroyed descendant, has no recorded
     *   judgement.
     *
     * A sibling's facts that reach the node scope do not depend on its conditions, so a flipped `Duplicate` condition
     * changes only what the sibling asserts. A missing entry counts as changed. Only the index's
     * {@link NodeScopeIndex.suspectsOf suspects} are compared; every other sibling's entry matches it.
     *
     * Of these, an endpoint still under construction is left to the pass of its construction root, which judges the
     * root's whole tree once it is constructed; only the endpoints an addition adds are judged regardless.
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

        const added = change.kind === "added" ? new Set(affected) : undefined;
        const judged = () =>
            [...affected].filter(endpoint => added?.has(endpoint) || !this.#isUnderConstruction(endpoint));

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
            return { endpoints: judged() };
        }

        const nodeEndpoint = pass.nodeEndpointOf(anchor);
        if (nodeEndpoint === undefined) {
            return { endpoints: judged() };
        }

        if (reach === Reach.NodeScope) {
            for (const endpoint of pass.nodeScopeOf(nodeEndpoint)) {
                affected.add(endpoint);
            }
            return { endpoints: judged(), readersOf: nodeEndpoint };
        }

        affected.add(nodeEndpoint);
        if (index.readersJudgedUnder(nodeEndpoint) === conditionsKeyOf(nodeEndpoint, pass)) {
            return { endpoints: judged() };
        }
        for (const endpoint of pass.nodeConditionReadersOf(nodeEndpoint)) {
            affected.add(endpoint);
        }
        return { endpoints: judged(), readersOf: nodeEndpoint };
    }

    #isUnderConstruction(endpoint: Endpoint) {
        const presence = this.#facts.presenceOf(endpoint);
        return presence === Presence.Pending || presence === Presence.Constructing;
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

/**
 * The default server of {@link clusterId}, a cluster the Base device type may mandate, if matter.js has one to add.
 */
function baseServerOf(clusterId: number | undefined): Behavior.Type | undefined {
    return clusterId === BindingServer.cluster.id ? BindingServer : undefined;
}

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
    fresh: DeviceTypeViolation[];
}

/**
 * The error refusing {@link refused}, each of which has a new violation.
 */
function refusalOf(refused: Judged[]) {
    const [first, ...others] = refused.flatMap(({ endpoint, fresh }) =>
        fresh.map(violation => new DeviceTypeViolationError(endpoint, violation)),
    );
    if (first === undefined) {
        throw new InternalError("A refusal names no violation");
    }
    return new DeviceTypeConformanceError([first, ...others]);
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
