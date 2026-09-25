/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    ClusterModel,
    Conformance,
    DeviceClassification,
    DeviceTypeModel,
    Model,
    RequirementElement,
    requirementApplicability,
    RequirementModel,
    RequirementResolver,
} from "@matter/model";
import { ConditionAssertions, conditionScopeOf } from "./ConditionAssertions.js";
import { EndpointFacts } from "./EndpointFacts.js";
import { ValidationPass } from "./ValidationPass.js";
import { Violation } from "./Violation.js";

const clusterMemo = new ValidationPass.ModelMemo<RequirementModel, ClusterModel | undefined>();
const referentMemo = new ValidationPass.ModelMemo<RequirementModel, Model | undefined>();
const baseMemo = new ValidationPass.ModelMemo<undefined, DeviceTypeModel[]>();
const aggregatorMemo = new ValidationPass.ModelMemo<undefined, DeviceTypeModel | undefined>();
const knownNameMemo = new ValidationPass.ModelMemo<RequirementModel, KnownNames>();

const componentMemo = new ValidationPass.Memo<Endpoint, Map<DeviceTypeModel, Component[]>>();
const failureMemo = new ValidationPass.Memo<Endpoint, Map<RequirementModel, Violation[]>>();
const singletonMemo = new ValidationPass.Memo<Endpoint, Map<number, Singleton>>();
const declarationMemo = new ValidationPass.Memo<Endpoint, Map<number, Singleton>>();

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
     * Conditions decide what is mandatory but never what is disallowed: only an `X` or a feature term disallows.
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
     * Conditions are those {@link ConditionAssertions.collect} answers for the endpoint's node scope in {@link pass},
     * so one pass collects each scope once. An endpoint in no node scope takes the conditions of its whole tree.
     *
     * @param pass the validation pass the check belongs to, which shares what the checks of several endpoints read and
     * resolves in its model
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function check(endpoint: Endpoint, pass = new ValidationPass()): Violation[] {
        const { model } = pass;
        const violations = new Array<Violation>();
        const facts = EndpointFacts.of(endpoint, pass);
        const collection = ConditionAssertions.collect(
            ConditionAssertions.nodeEndpointOf(endpoint, pass) ?? treeRootOf(endpoint),
            pass,
        );
        const conditions = collection.conditionsOf(endpoint);

        for (const { name, suggestion } of ConditionAssertions.unknownNames(endpoint, pass)) {
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
                ...baseMemo.get(model, undefined, () =>
                    model.deviceTypes.filter(deviceType => deviceType.classification === DeviceClassification.Base),
                ),
            );
        }

        for (const deviceType of deviceTypes) {
            const waived = deviceType.classification === DeviceClassification.Base ? baseWaiversOf(facts, pass) : NONE;
            const context = { violations, facts, deviceType, conditions, pass, waived };
            checkClusters(context, deviceType.requirements);
            checkComposition(context, collection);
        }

        checkComponentOf(violations, facts, collection, pass);
        checkDescendantCounts(violations, endpoint, collection.descendantAssertionsOf(endpoint));
        checkSingletons(violations, facts, pass);

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

    /**
     * The server clusters of {@link endpoint} and its descendants that a device type of an endpoint above them in the
     * same node scope declares a singleton, as {@link check} reports them.
     *
     * Reads the device types of an endpoint whose behaviors have not initialized as configured, and nothing beside the
     * endpoint's ancestors, so it judges an endpoint and its descendants before they are constructed. {@link check}
     * also finds a singleton declared elsewhere in the node scope.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.7.3
     */
    export function misplacedSingletons(endpoint: Endpoint, pass = new ValidationPass()): Violation[] {
        const violations = new Array<Violation>();

        const above = new Array<Endpoint>();
        let scoped = false;
        for (let ancestor = endpoint.owner; ancestor !== undefined; ancestor = ancestor.owner) {
            above.unshift(ancestor);
            if (EndpointFacts.of(ancestor, pass).isNodeEndpoint) {
                scoped = true;
                break;
            }
        }

        const visit = (current: Endpoint, inherited: Map<number, Singleton> | undefined) => {
            const facts = EndpointFacts.of(current, pass);
            const scope = facts.isNodeEndpoint ? new Map<number, Singleton>() : inherited;
            const singletons = scope && withDeclarationsOf(current, scope, pass);
            if (singletons !== undefined) {
                reportMisplaced(violations, facts, singletons);
            }
            if (current.hasParts) {
                for (const child of current.parts) {
                    visit(child, singletons);
                }
            }
        };

        visit(
            endpoint,
            scoped
                ? above.reduce(
                      (scope, ancestor) => withDeclarationsOf(ancestor, scope, pass),
                      new Map<number, Singleton>(),
                  )
                : undefined,
        );
        return violations;
    }

    /**
     * Whether a device type of {@link endpoint} declares a server cluster a singleton, which {@link check} then judges
     * on every endpoint of the endpoint's node scope.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.7.3
     */
    export function declaresSingleton(endpoint: Endpoint, pass = new ValidationPass()) {
        return declarationMemo.get(pass, endpoint, () => singletonsOf([endpoint], pass)).size > 0;
    }

    /**
     * The endpoints other than {@link nodeEndpoint} whose {@link check} verdict can depend on the conditions of
     * {@link nodeEndpoint}: those of its composition scope that list a component device type of its device types.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     */
    export function nodeConditionReadersOf(nodeEndpoint: Endpoint, pass = new ValidationPass()): Endpoint[] {
        const facts = EndpointFacts.of(nodeEndpoint, pass);
        const components = new Set<number>();
        for (const deviceType of facts.deviceTypes) {
            for (const requirement of deviceType.requirements) {
                const component = RequirementResolver.deviceTypeOf(requirement);
                if (component !== undefined) {
                    components.add(component.id);
                }
            }
        }

        return facts.compositionScope.filter(endpoint =>
            EndpointFacts.of(endpoint, pass).deviceTypes.some(deviceType => components.has(deviceType.id)),
        );
    }
}

function treeRootOf(endpoint: Endpoint) {
    let root = endpoint;
    while (root.owner !== undefined) {
        root = root.owner;
    }
    return root;
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
    pass: ValidationPass;

    /**
     * Paths of requirements of {@link deviceType} that are not judged on the endpoint.
     */
    waived: ReadonlySet<string>;
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
    const { pass } = context;
    const cluster = clusterMemo.get(pass.model, requirement, () => RequirementResolver.clusterOf(requirement));
    if (cluster?.id === undefined) {
        return;
    }

    const name = context.facts.clusterName(side, cluster.id);
    const path = side === "client" ? `client:${cluster.name}` : cluster.name;
    const applicability = applicabilityOf(requirement, context.conditions, pass);
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
                referent = referentMemo.get(pass.model, nested, () => RequirementResolver.featureOf(nested));
                present = referent !== undefined && features.has(referent.name);
                break;

            case RequirementElement.ElementType.Attribute:
            case RequirementElement.ElementType.Command:
            case RequirementElement.ElementType.Event:
                referent = referentMemo.get(pass.model, nested, () => RequirementResolver.elementOf(nested));
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
            applicabilityOf(nested, trueNames, pass),
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
    { violations, facts, deviceType, waived }: Context,
    applicability: Conformance.Applicability,
    present: boolean,
    requirement: string,
    subject: string,
) {
    if (waived.has(requirement)) {
        return false;
    }

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
 * The applicability of {@link requirement} with {@link trueNames} true, as the endpoint is judged by it.
 *
 * {@link Conformance.Applicability.None} is answered only when the conformance forbids the element with every
 * condition undecided; one that only a condition forbids is {@link Conformance.Applicability.Conditional}, which is
 * not judged.
 */
function applicabilityOf(requirement: RequirementModel, trueNames: Set<string>, pass: ValidationPass) {
    const { all, features } = knownNamesOf(requirement, pass);
    const applicability = requirementApplicability(requirement, trueNames, all);

    // A condition is a maker's statement, and CHIP never decides one, so only an X or a feature term disallows
    if (
        applicability === Conformance.Applicability.None &&
        requirementApplicability(requirement, trueNames, features) !== Conformance.Applicability.None
    ) {
        return Conformance.Applicability.Conditional;
    }

    return applicability;
}

/**
 * The declared names a requirement's conformance may reference.
 */
interface KnownNames {
    /**
     * The conditions reachable unqualified from the requirement's {@link RequirementResolver.EndpointScope} and the
     * features of its cluster. A name outside them leaves the requirement unjudged.
     */
    all: Set<string>;

    /**
     * The features of the requirement's cluster.
     */
    features: Set<string>;
}

function knownNamesOf(requirement: RequirementModel, pass: ValidationPass) {
    return knownNameMemo.get(pass.model, requirement, () => knownNamesIn(requirement, pass));
}

function knownNamesIn(requirement: RequirementModel, pass: ValidationPass): KnownNames {
    const { deviceType, cluster } = RequirementResolver.endpointScopeOf(requirement);
    const features = new Set((cluster?.features ?? []).map(({ name }) => name));
    const all = new Set(features);

    if (deviceType !== undefined) {
        for (const [key, condition] of conditionScopeOf(deviceType, pass)) {
            // A qualified entry names a condition of any device type, which the requirement cannot reach
            if (!key.includes(".")) {
                all.add(condition.name);
            }
        }
    }

    return { all, features };
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
 * The component requirements of {@link deviceType}, a device type of {@link composing}, grouped by component device
 * type, with their applicability under {@link conditions}, the conditions of {@link composing}.
 */
function componentsOf(
    composing: Endpoint,
    deviceType: DeviceTypeModel,
    conditions: Set<string>,
    pass: ValidationPass,
): Component[] {
    const byDeviceType = componentMemo.get(pass, composing, () => new Map());
    let found = byDeviceType.get(deviceType);
    if (found !== undefined) {
        return found;
    }

    const byId = new Map<number, Component>();
    for (const requirement of deviceType.requirements) {
        const component = RequirementResolver.deviceTypeOf(requirement);
        if (component === undefined) {
            continue;
        }

        const applicability = applicabilityOf(requirement, conditions, pass);
        const entry = byId.get(component.id);
        if (entry === undefined) {
            byId.set(component.id, { deviceType: component, requirements: [requirement], applicability });
        } else {
            entry.requirements.push(requirement);
            entry.applicability = strongerOf(entry.applicability, applicability);
        }
    }

    found = [...byId.values()];
    byDeviceType.set(deviceType, found);
    return found;
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
function candidatesOf(facts: EndpointFacts, component: Component, pass: ValidationPass) {
    return facts.compositionScope
        .map(endpoint => EndpointFacts.of(endpoint, pass))
        .filter(candidate => candidate.deviceTypes.some(deviceType => deviceType.id === component.deviceType.id));
}

/**
 * The departures of {@link candidate} from the requirements nested in {@link instance}, a component requirement of
 * {@link composing}. They are judged with the rules of the endpoint's own cluster requirements and returned rather
 * than reported.
 *
 * The composing endpoint judges them for every candidate and each candidate judges them for itself, so one pass judges
 * each candidate and instance once.
 */
function failuresOf(
    candidate: EndpointFacts,
    instance: RequirementModel,
    composing: DeviceTypeModel,
    collection: ConditionAssertions.Collection,
    pass: ValidationPass,
) {
    const byInstance = failureMemo.get(pass, candidate.endpoint, () => new Map());
    let violations = byInstance.get(instance);
    if (violations === undefined) {
        violations = new Array<Violation>();
        const conditions = collection.conditionsOf(candidate.endpoint);
        checkClusters(
            { violations, facts: candidate, deviceType: composing, conditions, pass, waived: NONE },
            instance.requirements,
        );
        byInstance.set(instance, violations);
    }
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
function checkComposition(context: Context, collection: ConditionAssertions.Collection) {
    const { violations, facts, deviceType, conditions, pass } = context;
    const components = componentsOf(facts.endpoint, deviceType, conditions, pass);
    const candidates = new Map<Component, EndpointFacts[]>();

    for (const component of components) {
        const found = candidatesOf(facts, component, pass);
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
                    checkInstances(context, component, found, collection);
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
    { violations, facts, deviceType, pass }: Context,
    component: Component,
    candidates: EndpointFacts[],
    collection: ConditionAssertions.Collection,
) {
    const failures = component.requirements.map(instance =>
        candidates.map(candidate => failuresOf(candidate, instance, deviceType, collection, pass)),
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
    { violations, facts, deviceType, conditions, pass }: Context,
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

            const applicability = applicabilityOf(requirement, conditions, pass);
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
    collection: ConditionAssertions.Collection,
    pass: ValidationPass,
) {
    const own = new Set(facts.deviceTypes.map(deviceType => deviceType.id));
    if (!own.size || facts.isNodeEndpoint) {
        return;
    }

    for (let composer = facts.endpoint.owner; composer !== undefined; composer = composer.owner) {
        const composerFacts = EndpointFacts.of(composer, pass);
        const conditions = collection.conditionsOf(composer);

        const filled = composerFacts.deviceTypes.flatMap(deviceType =>
            componentsOf(composer, deviceType, conditions, pass)
                .filter(
                    ({ deviceType: component, applicability }) =>
                        own.has(component.id) &&
                        (applicability === Conformance.Applicability.Mandatory ||
                            applicability === Conformance.Applicability.Optional),
                )
                .map(component => ({ deviceType, component })),
        );

        // Checked before the scope walk, so the many children of an aggregator do not each walk its whole family
        if (filled.length && composerFacts.composes(facts.endpoint)) {
            for (const { deviceType, component } of filled) {
                const failures = component.requirements.map(instance =>
                    failuresOf(facts, instance, deviceType, collection, pass),
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

        // A composer beyond the node endpoint has its conditions in another scope, and componentsOf() memoizes per composer
        if (composerFacts.isNodeEndpoint) {
            break;
        }
    }
}

/**
 * Report each of {@link descendantAssertions}, the `Descendant` conditions {@link endpoint} asserts, whose number of
 * endpoints lies outside the range its constraint states.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
function checkDescendantCounts(
    violations: Violation[],
    endpoint: Endpoint,
    descendantAssertions: ConditionAssertions.DescendantAssertion[],
) {
    for (const { requirement, matches } of descendantAssertions) {
        const range = requirement.componentCountRange;
        if (range === undefined || isWithin(range, matches.length)) {
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
function checkSingletons(violations: Violation[], facts: EndpointFacts, pass: ValidationPass) {
    const nodeEndpoint = ConditionAssertions.nodeEndpointOf(facts.endpoint, pass);
    if (nodeEndpoint === undefined) {
        return;
    }

    const singletons = singletonMemo.get(pass, nodeEndpoint, () =>
        singletonsOf(ConditionAssertions.reachingEndpointsOf(nodeEndpoint, pass), pass),
    );
    reportMisplaced(violations, facts, singletons);
}

function reportMisplaced(violations: Violation[], facts: EndpointFacts, singletons: Map<number, Singleton>) {
    for (const [id, { cluster, deviceType, endpoints }] of singletons) {
        if (endpoints.has(facts.endpoint) || facts.clusterName("server", id) === undefined) {
            continue;
        }

        violations.push({
            endpoint: facts.endpoint,
            deviceType,
            requirement: cluster,
            kind: "singletonMisplaced",
            detail: `Server cluster ${cluster} is a singleton of ${deviceType} in this node scope, so it may appear only on an endpoint that lists that device type`,
        });
    }
}

/**
 * The server clusters the device types of {@link declarers} declare singletons, by cluster ID, with the first
 * declaring device type and every declaring endpoint.
 */
function singletonsOf(declarers: Iterable<Endpoint>, pass: ValidationPass) {
    const singletons = new Map<number, Singleton>();

    for (const endpoint of declarers) {
        for (const deviceType of EndpointFacts.of(endpoint, pass).deviceTypes) {
            for (const requirement of deviceType.requirements) {
                if (
                    requirement.element !== RequirementElement.ElementType.ServerCluster ||
                    !requirement.quality.singleton
                ) {
                    continue;
                }

                const cluster = clusterMemo.get(pass.model, requirement, () =>
                    RequirementResolver.clusterOf(requirement),
                );
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

/**
 * {@link singletons} extended by what the device types of {@link endpoint} declare.
 */
function withDeclarationsOf(endpoint: Endpoint, singletons: Map<number, Singleton>, pass: ValidationPass) {
    const declared = declarationMemo.get(pass, endpoint, () => singletonsOf([endpoint], pass));
    if (!declared.size) {
        return singletons;
    }

    const extended = new Map(singletons);
    for (const [id, singleton] of declared) {
        const known = extended.get(id);
        extended.set(
            id,
            known === undefined
                ? singleton
                : { ...known, endpoints: new Set([...known.endpoints, ...singleton.endpoints]) },
        );
    }
    return extended;
}

interface Singleton {
    cluster: string;
    deviceType: string;
    endpoints: Set<Endpoint>;
}

const NONE: ReadonlySet<string> = new Set();

const AGGREGATED: ReadonlySet<string> = new Set(["Descriptor.TAGLIST"]);

/**
 * The paths of Base requirements not judged on the endpoint of {@link facts}.
 *
 * Base requires a TagList of an endpoint that duplicates a sibling unless its device types define another way to
 * disambiguate. Aggregator defines one for its children, the bridged devices' NodeLabel, which the model cannot express.
 *
 * @see {@link MatterSpecification.v16.Device} § 11.2.6
 */
function baseWaiversOf(facts: EndpointFacts, pass: ValidationPass) {
    const { owner } = facts.endpoint;
    const { model } = pass;
    const aggregator = aggregatorMemo.get(model, undefined, () => model.deviceTypes("Aggregator"));
    if (owner === undefined || aggregator === undefined) {
        return NONE;
    }

    const parentAggregates = EndpointFacts.of(owner, pass).deviceTypes.some(({ id }) => id === aggregator.id);
    return parentAggregates ? AGGREGATED : NONE;
}
