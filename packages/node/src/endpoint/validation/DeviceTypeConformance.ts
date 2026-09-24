/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    Conformance,
    DeviceClassification,
    DeviceTypeModel,
    Matter,
    MatterModel,
    Model,
    RequirementElement,
    requirementApplicability,
    RequirementModel,
    RequirementResolver,
} from "@matter/model";
import { ConditionAssertions } from "./ConditionAssertions.js";
import { EndpointFacts } from "./EndpointFacts.js";
import { Violation } from "./Violation.js";

/**
 * Judge a constructed endpoint against the device types it declares.
 *
 * Pure: it reads the endpoint and the model and returns what it found.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export namespace DeviceTypeConformance {
    /**
     * The departures of {@link endpoint} from the server and client cluster requirements of its device types and the
     * feature, attribute, command and event requirements nested in them, from the component device types they
     * require, plus the names in {@link Endpoint.deviceConditions} that name no condition.
     *
     * A mandatory requirement is violated when its cluster or element is absent, a disallowed one when it is present.
     * A server cluster that a device type in the endpoint's node scope declares a singleton is violated on every
     * endpoint of that scope but the declaring ones.
     * Optional requirements and those whose conformance names something unknown are not judged. A missing or
     * disallowed cluster is the one finding for that cluster; its nested requirements are not judged.
     *
     * Composition is judged from both ends. On the composing endpoint: the number of endpoints of each component
     * device type, one distinct endpoint per instance, and choice conformance across the component requirements that
     * share a choice. On a component endpoint: that it satisfies the nested requirements of at least one instance of
     * each component requirement it fills. A `Descendant` condition is judged on the asserting endpoint against the
     * number of endpoints it reached.
     *
     * @param collection the conditions of the endpoint's node scope, as {@link ConditionAssertions.collect} answers
     * them
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function check(
        endpoint: Endpoint,
        collection: ConditionAssertions.Collection,
        model: MatterModel = Matter,
    ): Violation[] {
        const violations = new Array<Violation>();
        const facts = EndpointFacts.of(endpoint, model);
        const assertions = collection.conditions;
        const conditions = assertions.get(endpoint) ?? new Set<string>();

        for (const { name, suggestion } of ConditionAssertions.unknownNames(endpoint, model)) {
            violations.push({
                endpoint,
                deviceType: facts.deviceTypes[0]?.name ?? "",
                requirement: name,
                kind: "unknownCondition",
                detail:
                    suggestion === undefined
                        ? `Unknown condition "${name}"`
                        : `Unknown condition "${name}"; did you mean "${suggestion}"?`,
            });
        }

        const deviceTypes = [...facts.deviceTypes];
        if (deviceTypes.length) {
            // Every device type derives from Base, so its requirements apply once per endpoint rather than once per
            // device type
            deviceTypes.push(
                ...model.deviceTypes.filter(deviceType => deviceType.classification === DeviceClassification.Base),
            );
        }

        for (const deviceType of deviceTypes) {
            const context = { violations, facts, deviceType, conditions };
            checkClusters(context, deviceType.requirements);
            checkComposition(context, assertions, model);
        }

        checkComponentOf(violations, facts, assertions, model);
        checkDescendantCounts(violations, endpoint, collection.descendantAssertions);
        checkSingletons(violations, facts, model);

        // Base and a device type may state the same requirement; the device type's own report is kept
        const unique = new Map<string, Violation>();
        for (const violation of violations) {
            const key = `${violation.kind} ${violation.requirement}`;
            if (!unique.has(key)) {
                unique.set(key, violation);
            }
        }
        return [...unique.values()];
    }
}

/**
 * What cluster requirements are judged against: the endpoint {@link facts} describe, the device type whose
 * requirements they are and the conditions true for the endpoint. Violations go to {@link violations}.
 */
interface Context {
    violations: Violation[];
    facts: EndpointFacts;
    deviceType: DeviceTypeModel;
    conditions: Set<string>;
}

/**
 * Judge the server and client cluster requirements among {@link requirements} against the endpoint of the context.
 *
 * The requirements are a device type's own, judged against its endpoint, or those nested in a component requirement,
 * judged against an endpoint of the component device type.
 */
function checkClusters(context: Context, requirements: RequirementModel[]) {
    for (const requirement of requirements) {
        switch (requirement.element) {
            case RequirementElement.ElementType.ServerCluster:
                checkCluster(context, requirement, "server");
                break;

            case RequirementElement.ElementType.ClientCluster:
                checkCluster(context, requirement, "client");
                break;
        }
    }
}

function checkCluster(context: Context, requirement: RequirementModel, side: "server" | "client") {
    const cluster = RequirementResolver.clusterOf(requirement);
    if (cluster?.id === undefined) {
        return;
    }

    const name = context.facts.clusterName(side, cluster.id);
    const path = side === "client" ? `client:${cluster.name}` : cluster.name;
    const applicability = requirementApplicability(requirement, context.conditions, knownNamesOf(requirement));
    const departed = judge(context, applicability, name !== undefined, path, `${side} cluster ${cluster.name}`);

    if (departed || name === undefined || side === "client") {
        return;
    }

    const features = context.facts.features(name);
    const trueNames = new Set([...context.conditions, ...features]);

    for (const nested of requirement.requirements) {
        let referent: Model | undefined;
        let present: boolean;

        switch (nested.element) {
            case RequirementElement.ElementType.Feature:
                referent = RequirementResolver.featureOf(nested);
                present = referent !== undefined && features.has(referent.name);
                break;

            case RequirementElement.ElementType.Attribute:
            case RequirementElement.ElementType.Command:
            case RequirementElement.ElementType.Event:
                referent = RequirementResolver.elementOf(nested);
                present = referent !== undefined && context.facts.supports(name, referent);
                break;

            default:
                continue;
        }

        if (referent === undefined) {
            continue;
        }

        judge(
            context,
            requirementApplicability(nested, trueNames, knownNamesOf(nested)),
            present,
            `${path}.${referent.name}`,
            `${nested.element} ${referent.name} of ${cluster.name}`,
        );
    }
}

/**
 * Record the violation {@link applicability} and {@link present} amount to, and answer whether there is one.
 */
function judge(
    { violations, facts, deviceType }: Context,
    applicability: Conformance.Applicability,
    present: boolean,
    requirement: string,
    subject: string,
) {
    let kind: Violation.Kind;
    let detail: string;
    if (applicability === Conformance.Applicability.Mandatory && !present) {
        kind = "missing";
        detail = `Mandatory ${subject} is missing`;
    } else if (
        applicability === Conformance.Applicability.None &&
        present &&
        // Base only adds duties: CHIP does not judge Base, and its reference apps carry Binding on non-client endpoints
        deviceType.classification !== DeviceClassification.Base
    ) {
        kind = "disallowed";
        detail = `Disallowed ${subject} is present`;
    } else {
        return false;
    }

    violations.push({ endpoint: facts.endpoint, deviceType: deviceType.name, requirement, kind, detail });
    return true;
}

/**
 * The declared names a requirement's conformance may reference: the conditions reachable unqualified from its
 * {@link RequirementResolver.EndpointScope} and the features of its cluster. A name outside them leaves the requirement
 * unjudged.
 */
function knownNamesOf(requirement: RequirementModel) {
    const { deviceType, cluster } = RequirementResolver.endpointScopeOf(requirement);
    const names = new Set<string>();

    if (deviceType !== undefined) {
        for (const [key, condition] of RequirementResolver.conditionsOf(deviceType)) {
            // A qualified entry names a condition of any device type, which the requirement cannot reach
            if (!key.includes(".")) {
                names.add(condition.name);
            }
        }
    }

    for (const feature of cluster?.features ?? []) {
        names.add(feature.name);
    }

    return names;
}

/**
 * The requirements of one device type for one component device type: one per instance, or a single one.
 */
interface Component {
    deviceType: DeviceTypeModel;
    requirements: RequirementModel[];
    applicability: Conformance.Applicability;
}

/**
 * The component requirements of {@link deviceType}, grouped by component device type, with their applicability under
 * {@link conditions}, the conditions of the composing endpoint.
 */
function componentsOf(deviceType: DeviceTypeModel, conditions: Set<string>) {
    const components = new Map<number, Component>();

    for (const requirement of deviceType.requirements) {
        const component = RequirementResolver.deviceTypeOf(requirement);
        if (component === undefined) {
            continue;
        }

        const applicability = requirementApplicability(requirement, conditions, knownNamesOf(requirement));
        const entry = components.get(component.id);
        if (entry === undefined) {
            components.set(component.id, { deviceType: component, requirements: [requirement], applicability });
        } else {
            entry.requirements.push(requirement);
            entry.applicability = strongerOf(entry.applicability, applicability);
        }
    }

    return [...components.values()];
}

/**
 * The applicability of a component whose instances state {@link a} and {@link b}: required when any instance is,
 * disallowed only when every instance is.
 */
function strongerOf(a: Conformance.Applicability, b: Conformance.Applicability) {
    const { Mandatory, Optional, Conditional, None } = Conformance.Applicability;
    for (const applicability of [Mandatory, Optional, Conditional]) {
        if (a === applicability || b === applicability) {
            return applicability;
        }
    }
    return None;
}

/**
 * The endpoints that may fill {@link component}: those of the composing endpoint's composition scope that list the
 * component device type.
 *
 * The device type ID must match exactly, so an endpoint of a device type that derives from the component is not a
 * candidate.
 */
function candidatesOf(facts: EndpointFacts, component: Component, model: MatterModel) {
    return facts.compositionScope
        .map(endpoint => EndpointFacts.of(endpoint, model))
        .filter(candidate => candidate.deviceTypes.some(deviceType => deviceType.id === component.deviceType.id));
}

/**
 * The departures of {@link candidate} from the requirements nested in {@link instance}, a component requirement of
 * {@link composing}. They are judged with the rules of the endpoint's own cluster requirements and returned rather
 * than reported.
 */
function failuresOf(
    candidate: EndpointFacts,
    instance: RequirementModel,
    composing: DeviceTypeModel,
    assertions: Map<Endpoint, Set<string>>,
) {
    const violations = new Array<Violation>();
    const conditions = assertions.get(candidate.endpoint) ?? new Set<string>();
    checkClusters({ violations, facts: candidate, deviceType: composing, conditions }, instance.requirements);
    return violations;
}

/**
 * Judge the endpoint of {@link context} as the composing endpoint of the component device types its device type
 * requires.
 *
 * A mandatory component needs as many endpoints as its constraint states, at least one when it states none, and one
 * distinct endpoint per instance. An optional component needs none, but the constraint applies once there is one. A
 * disallowed component may have none. A component whose conformance depends on something unknown is not judged.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.3
 */
function checkComposition(context: Context, assertions: Map<Endpoint, Set<string>>, model: MatterModel) {
    const { violations, facts, deviceType, conditions } = context;
    const components = componentsOf(deviceType, conditions);
    const candidates = new Map<Component, EndpointFacts[]>();

    for (const component of components) {
        const found = candidatesOf(facts, component, model);
        candidates.set(component, found);
        const requirement = `device:${component.deviceType.name}`;

        switch (component.applicability) {
            case Conformance.Applicability.None:
                if (found.length) {
                    violations.push({
                        endpoint: facts.endpoint,
                        deviceType: deviceType.name,
                        requirement,
                        kind: "disallowed",
                        detail: `Disallowed component device type ${component.deviceType.name} is present on ${found.length} endpoint(s)`,
                    });
                }
                continue;

            case Conformance.Applicability.Optional:
                if (found.length) {
                    checkCount(context, component, found.length, undefined);
                }
                continue;

            case Conformance.Applicability.Mandatory:
                checkCount(context, component, found.length, { min: 1 });
                if (found.length) {
                    checkInstances(context, component, found, assertions);
                }
                continue;
        }
    }

    checkChoices(context, components, candidates);
}

/**
 * Report a number of endpoints of {@link component} outside the range its constraint states, or outside
 * {@link implied} when it states none.
 */
function checkCount(
    { violations, facts, deviceType }: Context,
    component: Component,
    count: number,
    implied: RequirementModel.CountRange | undefined,
) {
    for (const requirement of component.requirements) {
        const range = requirement.componentCountRange ?? implied;
        if (range === undefined || isWithin(range, count)) {
            continue;
        }

        violations.push({
            endpoint: facts.endpoint,
            deviceType: deviceType.name,
            requirement: `device:${component.deviceType.name}`,
            kind: "instanceCount",
            detail: `Component device type ${component.deviceType.name} requires ${describeRange(range)} endpoint(s) in the composition; found ${count}`,
        });
    }
}

/**
 * Match the instances of {@link component} to distinct {@link candidates} that satisfy them, and report each instance
 * left unmatched with what it requires that no candidate offers.
 */
function checkInstances(
    { violations, facts, deviceType }: Context,
    component: Component,
    candidates: EndpointFacts[],
    assertions: Map<Endpoint, Set<string>>,
) {
    const failures = component.requirements.map(instance =>
        candidates.map(candidate => failuresOf(candidate, instance, deviceType, assertions)),
    );
    const matched = matchInstances(failures.map(row => row.map(failed => !failed.length)));

    component.requirements.forEach((instance, index) => {
        if (matched[index] !== undefined) {
            return;
        }

        const row = failures[index];
        const paths = row.map(failed => new Set(failed.map(({ requirement }) => requirement)));
        const unoffered = [...paths[0]].filter(path => paths.every(set => set.has(path)));
        const subject = describeInstance(component, instance);

        let reason;
        if (row.some(failed => !failed.length)) {
            reason = "every endpoint that satisfies it fills another instance";
        } else if (unoffered.length) {
            reason = `no candidate offers ${unoffered.join(", ")}`;
        } else {
            reason = "no candidate satisfies it";
        }

        violations.push({
            endpoint: facts.endpoint,
            deviceType: deviceType.name,
            requirement: pathOf(component, instance),
            kind: "instanceCount",
            detail: `No endpoint fills ${subject}: ${reason}`,
        });
    });
}

/**
 * Assign each instance a distinct candidate it accepts, by augmenting paths, and answer the candidate index per
 * instance, undefined for an instance left unmatched.
 */
function matchInstances(accepts: boolean[][]) {
    const owners = new Map<number, number>();

    const assign = (instance: number, visited: Set<number>): boolean => {
        for (let candidate = 0; candidate < accepts[instance].length; candidate++) {
            if (!accepts[instance][candidate] || visited.has(candidate)) {
                continue;
            }
            visited.add(candidate);

            const owner = owners.get(candidate);
            if (owner === undefined || assign(owner, visited)) {
                owners.set(candidate, instance);
                return true;
            }
        }
        return false;
    };

    for (let instance = 0; instance < accepts.length; instance++) {
        assign(instance, new Set());
    }

    const matched = new Array<number | undefined>(accepts.length).fill(undefined);
    for (const [candidate, instance] of owners) {
        matched[instance] = candidate;
    }
    return matched;
}

/**
 * Judge choice conformance across the component requirements that name the same choice: once any of them applies,
 * the number of them with endpoints in range must meet the choice's count. A choice counts only at the top of a
 * conformance.
 *
 * A member counts as satisfied when it has endpoints in range, whether or not they meet its nested requirements,
 * because each endpoint that does not is reported on itself.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.3
 */
function checkChoices(
    { violations, facts, deviceType, conditions }: Context,
    components: Component[],
    candidates: Map<Component, EndpointFacts[]>,
) {
    const choices = new Map<string, { choice: Conformance.Ast.Choice; members: Component[]; applies: boolean }>();

    for (const component of components) {
        for (const requirement of component.requirements) {
            const { ast } = requirement.conformance;
            if (ast.type !== Conformance.Special.Choice) {
                continue;
            }

            let entry = choices.get(ast.param.name);
            if (entry === undefined) {
                entry = { choice: ast.param, members: [], applies: false };
                choices.set(ast.param.name, entry);
            }
            if (!entry.members.includes(component)) {
                entry.members.push(component);
            }

            const applicability = requirementApplicability(requirement, conditions, knownNamesOf(requirement));
            if (
                applicability === Conformance.Applicability.Mandatory ||
                applicability === Conformance.Applicability.Optional
            ) {
                entry.applies = true;
            }
        }
    }

    for (const { choice, members, applies } of choices.values()) {
        if (!applies) {
            continue;
        }

        const satisfied = members.filter(component => {
            const count = candidates.get(component)?.length ?? 0;
            return (
                count > 0 &&
                component.requirements.every(({ componentCountRange }) =>
                    componentCountRange === undefined ? true : isWithin(componentCountRange, count),
                )
            );
        }).length;

        const { num, orMore, orLess } = choice;
        if (orMore ? satisfied >= num : orLess ? satisfied <= num : satisfied === num) {
            continue;
        }

        const names = members.map(component => component.deviceType.name);
        const bound = orMore ? "at least" : orLess ? "at most" : "exactly";
        violations.push({
            endpoint: facts.endpoint,
            deviceType: deviceType.name,
            requirement: `device:${names.join("|")}`,
            kind: "instanceCount",
            detail: `Requires ${bound} ${num} of component device types ${names.join(", ")}; found ${satisfied}`,
        });
    }
}

/**
 * Report {@link facts}'s endpoint where it fills a component requirement of an endpoint that composes it but
 * satisfies the nested requirements of none of its instances. The violation names the instance it comes closest to
 * and carries the composing device type.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.3
 */
function checkComponentOf(
    violations: Violation[],
    facts: EndpointFacts,
    assertions: Map<Endpoint, Set<string>>,
    model: MatterModel,
) {
    const own = new Set(facts.deviceTypes.map(deviceType => deviceType.id));
    if (!own.size || facts.isNodeEndpoint) {
        return;
    }

    for (let composer = facts.endpoint.owner; composer !== undefined; composer = composer.owner) {
        const composerFacts = EndpointFacts.of(composer, model);
        const conditions = assertions.get(composer) ?? new Set<string>();

        const filled = composerFacts.deviceTypes.flatMap(deviceType =>
            componentsOf(deviceType, conditions)
                .filter(
                    ({ deviceType: component, applicability }) =>
                        own.has(component.id) &&
                        (applicability === Conformance.Applicability.Mandatory ||
                            applicability === Conformance.Applicability.Optional),
                )
                .map(component => ({ deviceType, component })),
        );

        // Checked before the scope walk, so the many children of an aggregator do not each walk its whole family
        if (filled.length && composerFacts.compositionScope.includes(facts.endpoint)) {
            for (const { deviceType, component } of filled) {
                const failures = component.requirements.map(instance =>
                    failuresOf(facts, instance, deviceType, assertions),
                );
                if (failures.some(failed => !failed.length)) {
                    continue;
                }

                let closest = 0;
                failures.forEach((failed, index) => {
                    if (failed.length < failures[closest].length) {
                        closest = index;
                    }
                });
                const instance = component.requirements[closest];
                const failed = failures[closest].map(({ requirement }) => requirement).join(", ");
                const role = `component ${component.deviceType.name} of ${deviceType.name} ${composer.toString()}`;

                violations.push({
                    endpoint: facts.endpoint,
                    deviceType: deviceType.name,
                    requirement: `device:${deviceType.name}/${component.deviceType.name}`,
                    kind: failures[closest][0].kind,
                    detail:
                        instance.instanceNumber === undefined
                            ? `Endpoint is ${role} but fails ${failed}`
                            : `Endpoint is ${role} but satisfies none of its instances; instance ${instance.instanceNumber}, the closest, fails ${failed}`,
                });
            }
        }

        if (composerFacts.isNodeEndpoint) {
            break;
        }
    }
}

/**
 * Report each `Descendant` condition {@link endpoint} asserts whose number of endpoints lies outside the range its
 * constraint states.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
function checkDescendantCounts(
    violations: Violation[],
    endpoint: Endpoint,
    descendantAssertions: ConditionAssertions.DescendantAssertion[],
) {
    for (const { endpoint: asserting, requirement, matches } of descendantAssertions) {
        const range = requirement.componentCountRange;
        if (asserting !== endpoint || range === undefined || isWithin(range, matches.length)) {
            continue;
        }

        const condition = RequirementResolver.conditionOf(requirement);
        violations.push({
            endpoint,
            deviceType: requirement.parent?.name ?? "",
            requirement: `condition:${requirement.name}`,
            kind: "instanceCount",
            detail: `Condition ${requirement.name} must hold for ${describeRange(range)} endpoint(s) of ${condition?.parent?.name ?? "its declaring device type"} in the composition; found ${matches.length}`,
        });
    }
}

function isWithin({ min, max }: RequirementModel.CountRange, count: number) {
    return (min === undefined || count >= min) && (max === undefined || count <= max);
}

function describeRange({ min, max }: RequirementModel.CountRange) {
    if (min !== undefined && max !== undefined) {
        return min === max ? `exactly ${min}` : `${min} to ${max}`;
    }
    return min !== undefined ? `min ${min}` : `max ${max}`;
}

/**
 * The path of one instance, which always carries a number so it never equals the path of the component's count.
 */
function pathOf(component: Component, instance: RequirementModel) {
    const number = instance.instanceNumber ?? component.requirements.indexOf(instance) + 1;
    return `device:${component.deviceType.name}#${number}`;
}

function describeInstance(component: Component, instance: RequirementModel) {
    const subject = `component device type ${component.deviceType.name}`;
    const number = instance.instanceNumber;
    return number === undefined ? subject : `instance ${number} of ${subject}`;
}

/**
 * Report each server cluster of the endpoint that a device type elsewhere in its node scope declares a singleton.
 *
 * The quality lets the declaring endpoint carry the cluster and forbids it on every other endpoint of the scope. It
 * does not make the cluster required on the declaring endpoint; conformance decides that. An endpoint in no node scope
 * is not judged.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.7.3
 */
function checkSingletons(violations: Violation[], facts: EndpointFacts, model: MatterModel) {
    const nodeEndpoint = ConditionAssertions.nodeEndpointOf(facts.endpoint, model);
    if (nodeEndpoint === undefined) {
        return;
    }

    for (const [id, { cluster, deviceType, endpoints }] of singletonsOf(nodeEndpoint, model)) {
        if (endpoints.has(facts.endpoint) || facts.clusterName("server", id) === undefined) {
            continue;
        }

        violations.push({
            endpoint: facts.endpoint,
            deviceType,
            requirement: cluster,
            kind: "singletonMisplaced",
            detail: `Server cluster ${cluster} is a singleton of ${deviceType} in this node scope, so it may appear only on the endpoint of that device type`,
        });
    }
}

/**
 * The server clusters declared singletons in the node scope of {@link nodeEndpoint}, by cluster ID, with the first
 * declaring device type and every declaring endpoint.
 */
function singletonsOf(nodeEndpoint: Endpoint, model: MatterModel) {
    const singletons = new Map<number, { cluster: string; deviceType: string; endpoints: Set<Endpoint> }>();

    for (const endpoint of ConditionAssertions.nodeScopeOf(nodeEndpoint, model)) {
        for (const deviceType of EndpointFacts.of(endpoint, model).deviceTypes) {
            for (const requirement of deviceType.requirements) {
                if (
                    requirement.element !== RequirementElement.ElementType.ServerCluster ||
                    !requirement.quality.singleton
                ) {
                    continue;
                }

                const cluster = RequirementResolver.clusterOf(requirement);
                if (cluster?.id === undefined) {
                    continue;
                }

                let singleton = singletons.get(cluster.id);
                if (singleton === undefined) {
                    singleton = { cluster: cluster.name, deviceType: deviceType.name, endpoints: new Set() };
                    singletons.set(cluster.id, singleton);
                }
                singleton.endpoints.add(endpoint);
            }
        }
    }

    return singletons;
}
