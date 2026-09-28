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
import type { DeviceTypeValidationPass } from "./DeviceTypeValidationPass.js";
import { lookupsFor } from "./ModelLookups.js";
import { FactsContribution, ReachingEndpoints } from "./ReachingEndpoints.js";
import { ResolvedEndpoint } from "./ResolvedEndpoint.js";

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
     * those of the {@link reachingOf reaching endpoints} assert on it. A requirement asserts when its
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
     * declares a singleton.
     *
     * A pass with a {@link DeviceTypeValidationPass.index scope index} reads them from the index, which keeps what each
     * one contributes across passes.
     */
    export function reachingOf<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): ReachingEndpoints<E> {
        return pass.reaching.get(
            nodeEndpoint,
            () =>
                pass.index?.reachingOf(nodeEndpoint, pass) ??
                new ReachingEndpoints(scanReaching(nodeEndpoint, pass).reaching),
        );
    }

    /**
     * The endpoints of the node scope of {@link nodeEndpoint} that declare a singleton, in tree order.
     */
    export function singletonDeclarersOf<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): readonly E[] {
        return reachingOf(nodeEndpoint, pass).declarers(endpoint => factsContributionOf(endpoint, pass), pass.facts);
    }

    /**
     * The {@link reachingOf reaching endpoints} of the node scope of {@link nodeEndpoint} as a walk of the
     * scope finds them, and the node endpoints below it that bound the scope.
     */
    export function scanReaching<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
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
     * Whether {@link endpoint} is in the node scope of {@link nodeEndpoint}, as {@link nodeScopeOf} lists it.
     *
     * An owner lists every endpoint it owns as a part until the endpoint is destroyed, except a peer's node, which is a
     * node endpoint.
     */
    export function isInScope<E>(endpoint: E, nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
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
        const lookups = lookupsFor(pass.model);
        return ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType =>
            lookups
                .requirementsOf(deviceType)
                .some(
                    requirement =>
                        requirement.location === RequirementElement.Location.Root &&
                        lookups.assertedConditionOf(requirement) !== undefined,
                ),
        );
    }

    /**
     * Whether {@link endpoint} reaches its node scope: it {@link reachesNodeScope supports a network interface}, it
     * {@link assertsOnNodeEndpoint asserts a condition on the node endpoint}, or one of its device types states a
     * server cluster requirement with the singleton quality — whether or not that cluster resolves in the model.
     *
     * Reads only device types and server clusters, whose changes the owner of a {@link DeviceTypeScopeIndex} must
     * observe; a kept list stays correct only while that holds.
     */
    export function reaches<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): boolean {
        return (
            reachesNodeScope(endpoint, pass) ||
            assertsOnNodeEndpoint(endpoint, pass) ||
            declaresSingleton(endpoint, pass)
        );
    }

    /**
     * Whether a device type of {@link endpoint} states a server cluster requirement with the singleton quality,
     * whether or not the cluster resolves in the model. `DeviceTypeConformance.check` judges a resolved singleton's
     * placement; this only decides whether the declaration itself makes {@link endpoint} reach its node scope.
     */
    export function declaresSingleton<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): boolean {
        const lookups = lookupsFor(pass.model);
        return ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType =>
            lookups
                .requirementsOf(deviceType)
                .some(
                    requirement =>
                        requirement.element === RequirementElement.ElementType.ServerCluster &&
                        requirement.quality.singleton,
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
        return ConditionAssertions.isInScope(endpoint, this.#nodeEndpoint, this.#pass);
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
            const asserted = ConditionAssertions.reachingOf(endpoint, pass).assertedConditions(
                this.#nodeConditionsOf(),
                asserting => this.#assertedAtRootBy(asserting),
            );
            for (const name of asserted) {
                conditions.add(name);
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
        const lookups = lookupsFor(pass.model);
        assertions = new Array<Assertion>();
        const names = this.#underivedOf(endpoint);
        for (const deviceType of ResolvedEndpoint.of(endpoint, pass).deviceTypes) {
            const knownNames = new Set([...conditionScopeOf(deviceType, pass).values()].map(c => c.name));

            for (const requirement of lookups.requirementsOf(deviceType)) {
                const condition = lookups.assertedConditionOf(requirement);
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

    #assertedAtRootBy(endpoint: E) {
        const names = new Array<string>();
        for (const { requirement, condition } of this.#assertionsOf(endpoint)) {
            if (requirement.location === RequirementElement.Location.Root) {
                names.push(condition.name);
            }
        }
        return names;
    }

    #underivedOf(endpoint: E) {
        let names = this.#underived.get(endpoint);
        if (names === undefined) {
            names = new Set([
                ...structuralConditionsOf(endpoint, this.#pass),
                ...this.#nodeConditionsOf(),
                ...statedConditionsOf(endpoint, this.#pass),
            ]);
            this.#underived.set(endpoint, names);
        }
        return names;
    }

    #nodeConditionsOf() {
        this.#nodeConditions ??= nodeConditionsOf(this.#nodeEndpoint, this.#pass);
        return this.#nodeConditions;
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

        if (lookupsFor(pass.model).componentsDeclaredBy(deviceType)) {
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
function nodeConditionsOf<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
    const conditions = new Set<string>(pass.facts.nodeConditionsOf(nodeEndpoint));
    const interfaces = ConditionAssertions.reachingOf(nodeEndpoint, pass).interfaceConditions(endpoint =>
        factsContributionOf(endpoint, pass),
    );
    for (const condition of interfaces) {
        conditions.add(condition);
    }
    return conditions;
}

/**
 * What {@link endpoint}, a reaching endpoint, contributes to its node scope through its own facts: the network
 * interfaces its NetworkCommissioning server supports and whether it declares a singleton.
 */
function factsContributionOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): FactsContribution {
    const interfaces = new Array<string>();
    for (const feature of ResolvedEndpoint.of(endpoint, pass).features("NetworkCommissioning")) {
        const condition = interfaceConditions.get(feature);
        if (condition !== undefined) {
            interfaces.push(condition);
        }
    }
    return { interfaces, declares: ConditionAssertions.declaresSingleton(endpoint, pass) };
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

    const { index } = pass;
    if (index !== undefined) {
        for (const id of own) {
            let present = 0;
            for (const part of index.partsListing(owner, id)) {
                if (pass.facts.isPresent(part) && ++present > 1) {
                    return true;
                }
            }
        }
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
 * {@link deviceType}'s conditions, resolved once per device type and model instance, shared by every pass resolved
 * in {@link pass}'s model.
 *
 * @internal
 */
export function conditionScopeOf<E>(deviceType: DeviceTypeModel, pass: DeviceTypeValidationPass<E>) {
    return lookupsFor(pass.model).conditionScopeOf(deviceType);
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
