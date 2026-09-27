/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "../../aspects/Conformance.js";
import { DeviceClassification } from "../../common/DeviceClassification.js";
import { RequirementElement } from "../../elements/RequirementElement.js";
import { ConditionModel, DeviceTypeModel, RequirementModel } from "../../models/index.js";
import { requirementApplicability } from "../RequirementApplicability.js";
import { RequirementResolver } from "../RequirementResolver.js";
import { DeviceTypeValidationPass } from "./DeviceTypeValidationPass.js";
import { ResolvedEndpoint } from "./ResolvedEndpoint.js";

const conditionScopes = new DeviceTypeValidationPass.ModelMemo<DeviceTypeModel, Map<string, ConditionModel>>();
const assertedConditions = new DeviceTypeValidationPass.ModelMemo<RequirementModel, ConditionModel | undefined>();

/**
 * The conditions that hold for the endpoints of a node scope.
 *
 * A condition is true for an endpoint when a condition requirement of a device type in the scope asserts it there,
 * when the Base device type's structural definition makes it true, when the node's configuration answers it (see
 * {@link NodeCondition}), or when the endpoint states it in {@link DeviceTypeFacts.statedConditionsOf}. Every other
 * condition is false; stating a name never makes a condition false.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 *
 * @internal
 */
export namespace ConditionAssertions {
    /**
     * A condition requirement with location `Descendant` that a device type of {@link endpoint} asserts.
     *
     * Its {@link RequirementModel.componentCountRange} bounds how many endpoints it must reach, which composition
     * validation checks against {@link matches}.
     */
    export interface DescendantAssertion<E> {
        /**
         * The asserting endpoint.
         */
        endpoint: E;

        /**
         * The condition requirement.
         */
        requirement: RequirementModel;

        /**
         * The endpoints of the condition's declaring device type within the asserting endpoint's composition scope,
         * each of which the condition now holds for.
         */
        matches: E[];
    }

    /**
     * The result of {@link collect}. Each endpoint's conditions are derived on first request.
     */
    export interface Collection<E> {
        /**
         * The declared names of the conditions true for {@link endpoint}; empty for an endpoint outside the node scope.
         */
        conditionsOf(endpoint: E): Set<string>;

        /**
         * The asserted `Descendant` condition requirements of {@link endpoint}; empty for an endpoint outside the node
         * scope.
         */
        descendantAssertionsOf(endpoint: E): DescendantAssertion<E>[];
    }

    /**
     * A name in {@link DeviceTypeFacts.statedConditionsOf} that names no condition in the endpoint's scope.
     */
    export interface UnknownName {
        name: string;

        /**
         * The declared spelling of a condition the name matches regardless of case.
         */
        suggestion?: string;
    }

    /**
     * Collect the conditions true for the endpoints in the node scope of {@link nodeEndpoint}.
     *
     * A condition requirement asserts its condition rather than testing it, and it may assert on another endpoint:
     * on the asserting endpoint itself, on the node endpoint, or on endpoints of the asserting endpoint's composition
     * scope. So an endpoint's conditions are those its own requirements, its ancestors' and, for the node endpoint,
     * those of the {@link reachingEndpointsOf reaching endpoints} assert on it. A requirement asserts when its
     * conformance is mandatory for the structural, node and stated conditions of the asserting endpoint.
     *
     * One {@link pass} collects each node scope once.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function collect<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): Collection<E> {
        return pass.collections.get(nodeEndpoint, () => new ScopeConditions(nodeEndpoint, pass));
    }

    /**
     * The endpoints of the node scope of {@link nodeEndpoint} whose facts enter the judgement of endpoints beyond their
     * own subtree, their ancestors and their siblings: those that {@link reachesNodeScope support a network interface},
     * {@link assertsOnNodeEndpoint assert a condition on the node endpoint} or state a server cluster requirement that
     * declares a singleton. In the order of {@link nodeScopeOf}.
     *
     * A pass with a {@link DeviceTypeValidationPass.memory memory} derives them from the whole node scope only when the
     * memory holds none or a change it noted since may add one: a change to an endpoint that is now one of them, or to
     * a node endpoint below {@link nodeEndpoint} whose subtree may join the scope. An endpoint that has left the scope
     * since is dropped by every pass, and what each one contributes is read again by every pass.
     */
    export function reachingEndpointsOf<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): E[] {
        return pass.reaching.get(nodeEndpoint, () => {
            const { memory, facts } = pass;
            if (memory === undefined) {
                return reachingIn(nodeEndpoint, pass).reaching;
            }

            memory.revise(endpoint => facts.isPresent(endpoint) && reaches(endpoint, pass));

            const held = memory.reaching;
            let reaching = held.get(nodeEndpoint);
            if (reaching === undefined) {
                const walked = reachingIn(nodeEndpoint, pass);
                memory.hold(walked.boundaries);
                reaching = walked.reaching;
                held.set(nodeEndpoint, reaching);
            }

            const inScope = reaching.filter(endpoint => isInScope(endpoint, nodeEndpoint, pass));
            if (inScope.length !== reaching.length) {
                // An endpoint below a new node endpoint returns once that stops being one, which changes no watched
                // endpoint
                held.set(
                    nodeEndpoint,
                    reaching.filter(endpoint => inScope.includes(endpoint) || facts.isAttached(endpoint)),
                );
            }
            return inScope;
        });
    }

    /**
     * Whether the Base `Duplicate` condition holds for {@link endpoint}: it shares an application device type with a
     * sibling.
     *
     * @see {@link MatterSpecification.v16.Device} § 1.1.6.1
     */
    export function isDuplicate<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
        return overlapsSibling(ResolvedEndpoint.of(endpoint, pass), pass);
    }

    /**
     * Whether {@link endpoint} supports a network interface through its NetworkCommissioning server, which enters the
     * conditions {@link collect} answers for every endpoint of the node scope.
     */
    export function reachesNodeScope<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
        for (const feature of ResolvedEndpoint.of(endpoint, pass).features("NetworkCommissioning")) {
            if (interfaceConditions.has(feature)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether a device type of {@link endpoint} states a condition requirement located at the node endpoint, whatever
     * its conformance. Such a requirement enters the conditions {@link collect} answers for the node endpoint and no
     * other endpoint.
     */
    export function assertsOnNodeEndpoint<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
        return ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType =>
            deviceType.requirements.some(
                requirement =>
                    requirement.location === RequirementElement.Location.Root &&
                    assertedConditions.get(pass.model, requirement, () =>
                        RequirementResolver.conditionOf(requirement),
                    ) !== undefined,
            ),
        );
    }

    /**
     * The names in {@link DeviceTypeFacts.statedConditionsOf} that name no condition in the endpoint's scope exactly.
     *
     * A name resolves in the scope of any of the endpoint's device types: their own conditions, their bases', the Base
     * device type's, and any condition qualified by its declarer (e.g. `RootNode.PowerSourceCond`).
     *
     * Two device types on one endpoint may each declare a condition of the same name, such as `PhysicalInputs` for
     * BasicVideoPlayer and CastingVideoPlayer. The name is not ambiguous: conditions hold by name, so stating it makes
     * it true for both, as qualifying it would.
     */
    export function unknownNames<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): UnknownName[] {
        const unknown = new Array<UnknownName>();
        const scopes = conditionScopesOf(endpoint, pass);

        for (const name of pass.facts.statedConditionsOf(endpoint)) {
            const { condition, suggestion } = resolveStated(scopes, name);
            if (condition !== undefined) {
                continue;
            }
            unknown.push(suggestion === undefined ? { name } : { name, suggestion });
        }

        return unknown;
    }

    /**
     * The endpoints of the node scope of {@link nodeEndpoint}: the node endpoint and its descendants, without any node
     * endpoint below it and that node endpoint's descendants.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function nodeScopeOf<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): E[] {
        const scope = [nodeEndpoint];

        const visit = (endpoint: E) => {
            for (const child of ResolvedEndpoint.of(endpoint, pass).children) {
                if (ResolvedEndpoint.of(child, pass).isNodeEndpoint) {
                    continue;
                }
                scope.push(child);
                visit(child);
            }
        };
        visit(nodeEndpoint);

        return scope;
    }

    /**
     * The node endpoint whose node scope {@link endpoint} belongs to: the closest endpoint at or above it whose device
     * type is classified as a node. Undefined when there is none, so the endpoint belongs to no node scope.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function nodeEndpointOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): E | undefined {
        for (let current: E | undefined = endpoint; current !== undefined; current = pass.facts.parentOf(current)) {
            if (ResolvedEndpoint.of(current, pass).isNodeEndpoint) {
                return current;
            }
        }
    }
}

/**
 * The declared names of the Base device type's structural conditions. Conformance matches names exactly, so each
 * must stay spelled as Base declares it.
 *
 * @internal
 */
export enum StructuralCondition {
    Node = "Node",
    App = "App",
    Simple = "Simple",
    Dynamic = "Dynamic",
    Composed = "Composed",
    Client = "Client",
    Server = "Server",
    Duplicate = "Duplicate",
}

/**
 * The declared names of the conditions the node's configuration answers. Conformance matches names exactly, so each
 * must stay spelled as Base or RootNode declares it.
 */
export enum NodeCondition {
    CustomNetworkConfig = "CustomNetworkConfig",
    Ethernet = "Ethernet",
    WiFi = "WiFi",
    Thread = "Thread",
}

const interfaceConditions = new Map<string, NodeCondition>([
    ["WI", NodeCondition.WiFi],
    ["TH", NodeCondition.Thread],
    ["ET", NodeCondition.Ethernet],
]);

/**
 * A condition requirement of an endpoint's device type that asserts its condition, because its conformance is
 * mandatory for the endpoint's underived conditions.
 */
interface Assertion {
    requirement: RequirementModel;
    condition: ConditionModel;
}

/**
 * The conditions of the endpoints of one node scope in one pass, derived per endpoint on first request.
 */
class ScopeConditions<E> implements ConditionAssertions.Collection<E> {
    readonly #nodeEndpoint: E;
    readonly #pass: DeviceTypeValidationPass<E>;
    #nodeConditions?: Set<string>;
    readonly #underived = new Map<E, Set<string>>();
    readonly #assertions = new Map<E, Assertion[]>();
    readonly #conditions = new Map<E, Set<string>>();
    readonly #descendantAssertions = new Map<E, ConditionAssertions.DescendantAssertion<E>[]>();

    constructor(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
        this.#nodeEndpoint = nodeEndpoint;
        this.#pass = pass;
    }

    conditionsOf(endpoint: E) {
        let conditions = this.#conditions.get(endpoint);
        if (conditions === undefined) {
            conditions = this.#isInScope(endpoint) ? this.#assertedOn(endpoint) : new Set<string>();
            this.#conditions.set(endpoint, conditions);
        }
        return conditions;
    }

    descendantAssertionsOf(endpoint: E) {
        let assertions = this.#descendantAssertions.get(endpoint);
        if (assertions === undefined) {
            assertions = new Array<ConditionAssertions.DescendantAssertion<E>>();
            if (this.#isInScope(endpoint)) {
                const facts = ResolvedEndpoint.of(endpoint, this.#pass);
                for (const { requirement, condition } of this.#assertionsOf(endpoint)) {
                    if (requirement.location === RequirementElement.Location.Descendant) {
                        assertions.push({ endpoint, requirement, matches: matchesOf(facts, condition, this.#pass) });
                    }
                }
            }
            this.#descendantAssertions.set(endpoint, assertions);
        }
        return assertions;
    }

    #isInScope(endpoint: E) {
        return isInScope(endpoint, this.#nodeEndpoint, this.#pass);
    }

    /**
     * The underived conditions of {@link endpoint} with those asserted on it: by itself at its own location, by the
     * ancestors whose composition scope covers it at their descendants, and, for the node endpoint, by any reaching
     * endpoint at the node endpoint. An asserted condition never triggers another condition requirement; chains are not
     * followed.
     */
    #assertedOn(endpoint: E) {
        const pass = this.#pass;
        const conditions = new Set(this.#underivedOf(endpoint));

        for (const { requirement, condition } of this.#assertionsOf(endpoint)) {
            if (requirement.location === RequirementElement.Location.Self) {
                conditions.add(condition.name);
            }
        }

        if (endpoint === this.#nodeEndpoint) {
            for (const asserting of ConditionAssertions.reachingEndpointsOf(endpoint, pass)) {
                for (const { requirement, condition } of this.#assertionsOf(asserting)) {
                    if (requirement.location === RequirementElement.Location.Root) {
                        conditions.add(condition.name);
                    }
                }
            }
        }

        // A composition scope never enters a node endpoint, so the walk stops at the collection's own
        const own = new Set(ResolvedEndpoint.of(endpoint, pass).deviceTypes.map(({ id }) => id));
        if (endpoint !== this.#nodeEndpoint) {
            for (
                let composer = pass.facts.parentOf(endpoint);
                composer !== undefined;
                composer = pass.facts.parentOf(composer)
            ) {
                for (const { requirement, condition } of this.#assertionsOf(composer)) {
                    // Interpretation: the specification does not say which descendants the assertion covers when
                    // there are several, so it covers every one
                    const declarer = condition.parent;
                    if (
                        requirement.location === RequirementElement.Location.Descendant &&
                        declarer instanceof DeviceTypeModel &&
                        own.has(declarer.id) &&
                        ResolvedEndpoint.of(composer, pass).composes(endpoint)
                    ) {
                        conditions.add(condition.name);
                    }
                }
                if (composer === this.#nodeEndpoint) {
                    break;
                }
            }
        }

        return conditions;
    }

    #assertionsOf(endpoint: E) {
        let assertions = this.#assertions.get(endpoint);
        if (assertions !== undefined) {
            return assertions;
        }

        const pass = this.#pass;
        assertions = new Array<Assertion>();
        const names = this.#underivedOf(endpoint);
        for (const deviceType of ResolvedEndpoint.of(endpoint, pass).deviceTypes) {
            const knownNames = new Set([...conditionScopeOf(deviceType, pass).values()].map(c => c.name));

            for (const requirement of deviceType.requirements) {
                const condition = assertedConditions.get(pass.model, requirement, () =>
                    RequirementResolver.conditionOf(requirement),
                );
                if (
                    condition !== undefined &&
                    requirementApplicability(requirement, names, knownNames) === Conformance.Applicability.Mandatory
                ) {
                    assertions.push({ requirement, condition });
                }
            }
        }

        this.#assertions.set(endpoint, assertions);
        return assertions;
    }

    #underivedOf(endpoint: E) {
        let names = this.#underived.get(endpoint);
        if (names === undefined) {
            this.#nodeConditions ??= nodeConditionsOf(
                this.#nodeEndpoint,
                ConditionAssertions.reachingEndpointsOf(this.#nodeEndpoint, this.#pass),
                this.#pass,
            );
            names = new Set([
                ...structuralConditionsOf(endpoint, this.#pass),
                ...this.#nodeConditions,
                ...statedConditionsOf(endpoint, this.#pass),
            ]);
            this.#underived.set(endpoint, names);
        }
        return names;
    }
}

/**
 * The endpoints of the composition scope of the endpoint {@link facts} describe that list the device type declaring
 * {@link condition}, each of which a `Descendant` assertion of the condition holds for.
 */
function matchesOf<E>(facts: ResolvedEndpoint<E>, condition: ConditionModel, pass: DeviceTypeValidationPass<E>): E[] {
    const declarer = condition.parent;
    if (!(declarer instanceof DeviceTypeModel)) {
        return [];
    }
    return facts.compositionScope.filter(endpoint =>
        ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType => deviceType.id === declarer.id),
    );
}

/**
 * The {@link ConditionAssertions.reachingEndpointsOf reaching endpoints} of the node scope of {@link nodeEndpoint},
 * and the node endpoints below it that bound the scope.
 */
function reachingIn<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
    const reaching = new Array<E>();
    const boundaries = new Array<E>();

    const visit = (endpoint: E) => {
        if (reaches(endpoint, pass)) {
            reaching.push(endpoint);
        }
        for (const child of ResolvedEndpoint.of(endpoint, pass).children) {
            if (ResolvedEndpoint.of(child, pass).isNodeEndpoint) {
                boundaries.push(child);
            } else {
                visit(child);
            }
        }
    };
    visit(nodeEndpoint);

    return { reaching, boundaries };
}

/**
 * Whether {@link endpoint} is a {@link ConditionAssertions.reachingEndpointsOf reaching endpoint} of its node scope.
 * A server cluster requirement that declares a singleton counts whether or not the cluster resolves, so the caller
 * that reads the declarations decides.
 *
 * Reads only device types and server clusters, whose changes the owner of a memory must note; a kept list stays
 * correct only while that holds.
 */
function reaches<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
    return (
        ConditionAssertions.reachesNodeScope(endpoint, pass) ||
        ConditionAssertions.assertsOnNodeEndpoint(endpoint, pass) ||
        ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType =>
            deviceType.requirements.some(
                requirement =>
                    requirement.element === RequirementElement.ElementType.ServerCluster &&
                    requirement.quality.singleton,
            ),
        )
    );
}

/**
 * Whether {@link endpoint} is in the node scope of {@link nodeEndpoint}, as {@link ConditionAssertions.nodeScopeOf}
 * lists it.
 *
 * An owner lists every endpoint it owns as a part until the endpoint is destroyed, except a peer's node, which is a
 * node endpoint.
 */
function isInScope<E>(endpoint: E, nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
    const { facts } = pass;
    for (let current = endpoint; current !== nodeEndpoint;) {
        const owner = facts.parentOf(current);
        if (owner === undefined || !facts.isPresent(current) || ResolvedEndpoint.of(current, pass).isNodeEndpoint) {
            return false;
        }
        current = owner;
    }
    return true;
}

/**
 * The conditions the Base device type defines in structural terms, so the tree answers them rather than the developer.
 *
 * @see {@link MatterSpecification.v16.Device} § 1.1.5
 * @see {@link MatterSpecification.v16.Device} § 1.1.6
 */
function structuralConditionsOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
    const facts = ResolvedEndpoint.of(endpoint, pass);
    const conditions = new Set<string>();

    for (const deviceType of facts.deviceTypes) {
        switch (deviceType.classification) {
            case DeviceClassification.Node:
                conditions.add(StructuralCondition.Node);
                break;

            case DeviceClassification.Application:
                conditions.add(StructuralCondition.App);
                break;

            case DeviceClassification.Simple:
                conditions.add(StructuralCondition.App);
                conditions.add(StructuralCondition.Simple);
                break;

            case DeviceClassification.Dynamic:
                conditions.add(StructuralCondition.App);
                conditions.add(StructuralCondition.Dynamic);
                break;
        }

        if (deviceType.requirements.some(r => r.element === RequirementElement.ElementType.DeviceType)) {
            conditions.add(StructuralCondition.Composed);
        }
    }

    if (facts.hasApplicationCluster("server")) {
        conditions.add(StructuralCondition.Server);
    }
    if (facts.hasApplicationCluster("client")) {
        conditions.add(StructuralCondition.Client);
    }
    if (overlapsSibling(facts, pass)) {
        conditions.add(StructuralCondition.Duplicate);
    }

    return conditions;
}

/**
 * The conditions the node's configuration answers, which hold for every endpoint of its node scope: those
 * {@link DeviceTypeFacts.nodeConditionsOf} states and the network interfaces of the node scope. Each is read from a
 * fact independent of the requirements the condition gates.
 *
 * Interpretation: the node supports a network interface when a NetworkCommissioning server in its node scope supports
 * that interface.
 *
 * @see {@link MatterSpecification.v16.Device} § 1.1.3.1
 * @see {@link MatterSpecification.v16.Device} § 2.1.3
 */
function nodeConditionsOf<E>(nodeEndpoint: E, reaching: E[], pass: DeviceTypeValidationPass<E>) {
    const conditions = new Set<string>(pass.facts.nodeConditionsOf(nodeEndpoint));

    for (const endpoint of reaching) {
        for (const feature of ResolvedEndpoint.of(endpoint, pass).features("NetworkCommissioning")) {
            const condition = interfaceConditions.get(feature);
            if (condition !== undefined) {
                conditions.add(condition);
            }
        }
    }

    return conditions;
}

/**
 * Whether the endpoint and a sibling share an application device type.
 *
 * @see {@link MatterSpecification.v16.Device} § 1.1.6.1
 */
function overlapsSibling<E>(facts: ResolvedEndpoint<E>, pass: DeviceTypeValidationPass<E>) {
    const owner = pass.facts.parentOf(facts.endpoint);
    if (owner === undefined) {
        return false;
    }

    const own = applicationDeviceTypeIdsOf(facts);
    if (!own.size) {
        return false;
    }

    // Counted once per parent, so the children of an aggregator do not each walk their siblings
    const counts = pass.applicationDeviceTypeCounts.get(owner, () => {
        const tally = new Map<number, number>();
        for (const child of ResolvedEndpoint.of(owner, pass).children) {
            for (const id of applicationDeviceTypeIdsOf(ResolvedEndpoint.of(child, pass))) {
                tally.set(id, (tally.get(id) ?? 0) + 1);
            }
        }
        return tally;
    });

    for (const id of own) {
        if ((counts.get(id) ?? 0) > 1) {
            return true;
        }
    }
    return false;
}

function applicationDeviceTypeIdsOf<E>(facts: ResolvedEndpoint<E>) {
    const ids = new Set<number>();
    for (const deviceType of facts.deviceTypes) {
        switch (deviceType.classification) {
            case DeviceClassification.Application:
            case DeviceClassification.Simple:
            case DeviceClassification.Dynamic:
                ids.add(deviceType.id);
                break;
        }
    }
    return ids;
}

function statedConditionsOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
    const names = new Set<string>();
    const scopes = conditionScopesOf(endpoint, pass);
    for (const name of pass.facts.statedConditionsOf(endpoint)) {
        const { condition } = resolveStated(scopes, name);
        if (condition !== undefined) {
            names.add(condition.name);
        }
    }
    return names;
}

function conditionScopesOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
    let deviceTypes = ResolvedEndpoint.of(endpoint, pass).deviceTypes;
    if (!deviceTypes.length) {
        deviceTypes = pass.model.deviceTypes.filter(
            deviceType => deviceType.classification === DeviceClassification.Base,
        );
    }
    return deviceTypes.map(deviceType => conditionScopeOf(deviceType, pass));
}

/**
 * {@link RequirementResolver.conditionsOf}, which walks every device type of the model, once per device type and
 * model instance.
 *
 * @internal
 */
export function conditionScopeOf<E>(deviceType: DeviceTypeModel, pass: DeviceTypeValidationPass<E>) {
    return conditionScopes.get(pass.model, deviceType, () => RequirementResolver.conditionsOf(deviceType));
}

function resolveStated(scopes: Map<string, ConditionModel>[], name: string) {
    let suggestion: string | undefined;

    for (const scope of scopes) {
        const condition = scope.get(name.toLowerCase());
        if (condition === undefined) {
            continue;
        }

        const declared = name.includes(".") ? `${condition.parent?.name}.${condition.name}` : condition.name;
        if (declared === name) {
            return { condition };
        }
        suggestion ??= declared;
    }

    return { suggestion };
}
