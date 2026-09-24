/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    ConditionModel,
    Conformance,
    DeviceClassification,
    DeviceTypeModel,
    RequirementElement,
    requirementApplicability,
    RequirementModel,
    RequirementResolver,
} from "@matter/model";
import { EndpointFacts } from "./EndpointFacts.js";
import { ValidationPass } from "./ValidationPass.js";

const collections = new ValidationPass.Memo<Endpoint, ConditionAssertions.Collection>();
const conditionScopes = new ValidationPass.Memo<DeviceTypeModel, Map<string, ConditionModel>>();
const assertedConditions = new ValidationPass.Memo<RequirementModel, ConditionModel | undefined>();
const applicationDeviceTypeCounts = new ValidationPass.Memo<Endpoint, Map<number, number>>();

/**
 * The conditions that hold for the endpoints of a node scope.
 *
 * A condition is true for an endpoint when a condition requirement of a device type in the scope asserts it there,
 * when the Base device type's structural definition makes it true, or when the endpoint states it in
 * {@link Endpoint.deviceConditions}. Every other condition is false.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export namespace ConditionAssertions {
    /**
     * A condition requirement with location `Descendant` that a device type of {@link endpoint} asserts.
     *
     * Its {@link RequirementModel.componentCountRange} bounds how many endpoints it must reach, which composition
     * validation checks against {@link matches}.
     */
    export interface DescendantAssertion {
        /**
         * The asserting endpoint.
         */
        endpoint: Endpoint;

        /**
         * The condition requirement.
         */
        requirement: RequirementModel;

        /**
         * The endpoints of the condition's declaring device type within the asserting endpoint's composition scope,
         * each of which the condition now holds for.
         */
        matches: Endpoint[];
    }

    /**
     * The result of {@link collect}.
     */
    export interface Collection {
        /**
         * The declared names of the conditions true for each endpoint of the node scope.
         */
        conditions: Map<Endpoint, Set<string>>;

        /**
         * Every asserted `Descendant` condition requirement in the node scope.
         */
        descendantAssertions: DescendantAssertion[];
    }

    /**
     * A name in {@link Endpoint.deviceConditions} that names no condition in the endpoint's scope.
     */
    export interface UnknownName {
        name: string;

        /**
         * The declared spelling of a condition the name matches regardless of case.
         */
        suggestion?: string;
    }

    /**
     * Collect the conditions true for every endpoint in the node scope of {@link nodeEndpoint}.
     *
     * A condition requirement asserts its condition rather than testing it, and it may assert on another endpoint, so
     * the whole scope is collected before any requirement is judged. A requirement asserts when its conformance is
     * mandatory for the structural and stated conditions of the asserting endpoint.
     *
     * One {@link pass} collects each node scope once.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function collect(nodeEndpoint: Endpoint, pass = new ValidationPass()): Collection {
        return collections.get(pass, nodeEndpoint, () => collectScope(nodeEndpoint, pass));
    }

    function collectScope(nodeEndpoint: Endpoint, pass: ValidationPass): Collection {
        const scope = nodeScopeOf(nodeEndpoint, pass);

        const underived = new Map<Endpoint, Set<string>>();
        const conditions = new Map<Endpoint, Set<string>>();
        for (const endpoint of scope) {
            const names = new Set([...structuralConditionsOf(endpoint, pass), ...statedConditionsOf(endpoint, pass)]);
            underived.set(endpoint, names);
            conditions.set(endpoint, new Set(names));
        }

        const descendantAssertions = new Array<DescendantAssertion>();
        for (const [endpoint, names] of underived) {
            const facts = EndpointFacts.of(endpoint, pass);
            for (const deviceType of facts.deviceTypes) {
                const knownNames = new Set([...conditionScopeOf(deviceType, pass).values()].map(c => c.name));

                for (const requirement of deviceType.requirements) {
                    const condition = assertedConditions.get(pass, requirement, () =>
                        RequirementResolver.conditionOf(requirement),
                    );
                    if (condition === undefined) {
                        continue;
                    }

                    // An asserted condition never triggers another condition requirement; chains are not followed
                    const applicability = requirementApplicability(requirement, names, knownNames);
                    if (applicability !== Conformance.Applicability.Mandatory) {
                        continue;
                    }

                    const targets = targetsOf(facts, nodeEndpoint, requirement, condition, pass);
                    if (requirement.location === RequirementElement.Location.Descendant) {
                        descendantAssertions.push({ endpoint, requirement, matches: targets });
                    }
                    for (const target of targets) {
                        conditions.get(target)?.add(condition.name);
                    }
                }
            }
        }

        return { conditions, descendantAssertions };
    }

    /**
     * The names in {@link Endpoint.deviceConditions} that name no condition in the endpoint's scope exactly.
     *
     * A name resolves in the scope of any of the endpoint's device types: their own conditions, their bases', the Base
     * device type's, and any condition qualified by its declarer (e.g. `RootNode.PowerSourceCond`).
     *
     * Two device types on one endpoint may each declare a condition of the same name, such as `PhysicalInputs` for
     * BasicVideoPlayer and CastingVideoPlayer. The name is not ambiguous: conditions hold by name, so stating it makes
     * it true for both, as qualifying it would.
     */
    export function unknownNames(endpoint: Endpoint, pass = new ValidationPass()): UnknownName[] {
        const unknown = new Array<UnknownName>();
        const scopes = conditionScopesOf(endpoint, pass);

        for (const name of endpoint.deviceConditions) {
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
    export function nodeScopeOf(nodeEndpoint: Endpoint, pass = new ValidationPass()): Endpoint[] {
        const scope = [nodeEndpoint];

        const visit = (endpoint: Endpoint) => {
            for (const child of EndpointFacts.of(endpoint, pass).children) {
                if (EndpointFacts.of(child, pass).isNodeEndpoint) {
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
    export function nodeEndpointOf(endpoint: Endpoint, pass = new ValidationPass()): Endpoint | undefined {
        for (let current: Endpoint | undefined = endpoint; current !== undefined; current = current.owner) {
            if (EndpointFacts.of(current, pass).isNodeEndpoint) {
                return current;
            }
        }
    }
}

/**
 * The declared names of the Base device type's structural conditions. Conformance matches names exactly, so each
 * must stay spelled as Base declares it.
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

function targetsOf(
    facts: EndpointFacts,
    nodeEndpoint: Endpoint,
    requirement: RequirementModel,
    condition: ConditionModel,
    pass: ValidationPass,
): Endpoint[] {
    switch (requirement.location) {
        case RequirementElement.Location.Root:
            // Within one node scope the closest node endpoint above any endpoint is the scope's own
            return [nodeEndpoint];

        case RequirementElement.Location.Self:
            return [facts.endpoint];

        case RequirementElement.Location.Descendant: {
            // Interpretation: the specification does not say which descendants the assertion covers when there are
            // several, so it covers every one
            const declarer = condition.parent;
            if (!(declarer instanceof DeviceTypeModel)) {
                return [];
            }
            return facts.compositionScope.filter(endpoint =>
                EndpointFacts.of(endpoint, pass).deviceTypes.some(deviceType => deviceType.id === declarer.id),
            );
        }

        default:
            return [];
    }
}

/**
 * The conditions the Base device type defines in structural terms, so the tree answers them rather than the developer.
 *
 * @see {@link MatterSpecification.v16.Device} § 1.1.5
 * @see {@link MatterSpecification.v16.Device} § 1.1.6
 */
function structuralConditionsOf(endpoint: Endpoint, pass: ValidationPass) {
    const facts = EndpointFacts.of(endpoint, pass);
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
 * Whether the endpoint and a sibling share an application device type.
 *
 * @see {@link MatterSpecification.v16.Device} § 1.1.6.1
 */
function overlapsSibling(facts: EndpointFacts, pass: ValidationPass) {
    const { owner } = facts.endpoint;
    if (owner === undefined) {
        return false;
    }

    const own = applicationDeviceTypeIdsOf(facts);
    if (!own.size) {
        return false;
    }

    // Counted once per parent, so the children of an aggregator do not each walk their siblings
    const counts = applicationDeviceTypeCounts.get(pass, owner, () => {
        const tally = new Map<number, number>();
        for (const child of EndpointFacts.of(owner, pass).children) {
            for (const id of applicationDeviceTypeIdsOf(EndpointFacts.of(child, pass))) {
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

function applicationDeviceTypeIdsOf(facts: EndpointFacts) {
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

function statedConditionsOf(endpoint: Endpoint, pass: ValidationPass) {
    const names = new Set<string>();
    const scopes = conditionScopesOf(endpoint, pass);
    for (const name of endpoint.deviceConditions) {
        const { condition } = resolveStated(scopes, name);
        if (condition !== undefined) {
            names.add(condition.name);
        }
    }
    return names;
}

function conditionScopesOf(endpoint: Endpoint, pass: ValidationPass) {
    let deviceTypes = EndpointFacts.of(endpoint, pass).deviceTypes;
    if (!deviceTypes.length) {
        deviceTypes = pass.model.deviceTypes.filter(
            deviceType => deviceType.classification === DeviceClassification.Base,
        );
    }
    return deviceTypes.map(deviceType => conditionScopeOf(deviceType, pass));
}

/**
 * {@link RequirementResolver.conditionsOf}, which walks every device type of the model, once per device type and pass.
 */
export function conditionScopeOf(deviceType: DeviceTypeModel, pass: ValidationPass) {
    return conditionScopes.get(pass, deviceType, () => RequirementResolver.conditionsOf(deviceType));
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
