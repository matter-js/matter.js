/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "../../aspects/Conformance.js";
import { DeviceClassification } from "../../common/DeviceClassification.js";
import { RequirementElement } from "../../elements/RequirementElement.js";
import { DeviceTypeModel, MatterModel, Model, RequirementModel, ValueModel } from "../../models/index.js";
import { requirementApplicability } from "../RequirementApplicability.js";
import { ConditionAssertions } from "./ConditionAssertions.js";
import type { DeviceTypeValidationPass } from "./DeviceTypeValidationPass.js";
import { DeviceTypeViolation } from "./DeviceTypeViolation.js";
import { lookupsFor } from "./ModelLookups.js";
import { ReachingEndpoints } from "./ReachingEndpoints.js";
import { ResolvedEndpoint } from "./ResolvedEndpoint.js";

/**
 * Judges endpoints against the device types they declare. It reads the tree only through its pass and returns what it
 * finds.
 *
 * What is checked, the rules applied and the limits: `docs/DEVICE_TYPE_VALIDATION.md`.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2
 */
export namespace DeviceTypeConformance {
    /**
     * The departures of {@link endpoint} from the requirements of its device types and of Base: cluster and element
     * requirements, component device types, singleton placement and `Descendant` condition counts, plus each name in
     * {@link DeviceTypeFacts.statedConditionsOf} that names no condition. Each departure is reported once by its
     * {@link DeviceTypeViolation.keyOf key}.
     *
     * An endpoint in no node scope takes the conditions of its whole tree.
     *
     * @param pass the validation pass the check belongs to, which shares what the checks of several endpoints read and
     * resolves in its model
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2
     * @see {@link MatterSpecification.v16.Core} § 7.3
     */
    export function check<E>(endpoint: E, pass: DeviceTypeValidationPass<E>): DeviceTypeViolation[] {
        const { model } = pass;
        const violations = new Array<DeviceTypeViolation>();
        const facts = ResolvedEndpoint.of(endpoint, pass);
        const collection = ConditionAssertions.collect(
            ConditionAssertions.nodeEndpointOf(endpoint, pass) ?? treeRootOf(endpoint, pass),
            pass,
        );
        const conditions = collection.conditionsOf(endpoint);

        for (const { name, suggestion } of ConditionAssertions.unknownNames(endpoint, pass)) {
            violations.push({
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
            deviceTypes.push(...lookupsFor(model).baseDeviceTypes);
        }

        for (const deviceType of deviceTypes) {
            const waived = deviceType.classification === DeviceClassification.Base ? baseWaiversOf(facts, pass) : NONE;
            const context = { violations, facts, deviceType, conditions, pass, waived };
            checkClusters(context, lookupsFor(model).requirementsOf(deviceType));
            checkComposition(context, collection);
        }

        checkComponentOf(violations, facts, collection, pass);
        checkDescendantCounts(violations, collection.descendantAssertionsOf(endpoint), model);
        checkSingletons(violations, facts, pass);

        // Several device types, Base included, may state the same requirement; the first report is kept, never Base's
        const unique = new Map<string, DeviceTypeViolation>();
        for (const violation of violations) {
            const key = DeviceTypeViolation.keyOf(violation);
            if (!unique.has(key)) {
                unique.set(key, violation);
            }
        }
        return [...unique.values()];
    }

    /**
     * The server clusters of {@link endpoint} and its descendants that a device type of an endpoint above them in the
     * same node scope declares a singleton, as {@link check} reports them, by endpoint in tree order. An endpoint with none
     * is absent.
     *
     * Reads nothing beside {@link endpoint}, its descendants and its ancestors, so it can judge a subtree before it is
     * constructed. {@link check} also finds a singleton declared elsewhere in the node scope.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.7.3
     */
    export function misplacedSingletons<E>(
        endpoint: E,
        pass: DeviceTypeValidationPass<E>,
    ): Map<E, DeviceTypeViolation[]> {
        const misplaced = new Map<E, DeviceTypeViolation[]>();

        const above = new Array<E>();
        let scoped = false;
        for (
            let ancestor = pass.facts.parentOf(endpoint);
            ancestor !== undefined;
            ancestor = pass.facts.parentOf(ancestor)
        ) {
            above.unshift(ancestor);
            if (ResolvedEndpoint.of(ancestor, pass).isNodeEndpoint) {
                scoped = true;
                break;
            }
        }

        const visit = (current: E, inherited: Map<number, Singleton<E>> | undefined) => {
            const facts = ResolvedEndpoint.of(current, pass);
            const scope = facts.isNodeEndpoint ? new Map<number, Singleton<E>>() : inherited;
            const singletons = scope && withDeclarationsOf(current, scope, pass);
            if (singletons !== undefined) {
                const violations = new Array<DeviceTypeViolation>();
                reportMisplaced(violations, facts, singletons, pass);
                if (violations.length) {
                    misplaced.set(current, violations);
                }
            }
            for (const child of pass.facts.partsOf(current)) {
                visit(child, singletons);
            }
        };

        visit(
            endpoint,
            scoped
                ? above.reduce(
                      (scope, ancestor) => withDeclarationsOf(ancestor, scope, pass),
                      new Map<number, Singleton<E>>(),
                  )
                : undefined,
        );
        return misplaced;
    }

    /**
     * The endpoints other than {@link nodeEndpoint} whose {@link check} verdict can depend on the conditions of
     * {@link nodeEndpoint}: those of its composition scope that list a component device type of its device types.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.3
     *
     * @internal
     */
    export function nodeConditionReadersOf<E>(nodeEndpoint: E, pass: DeviceTypeValidationPass<E>): E[] {
        const components = componentIdsOf(nodeEndpoint, pass);
        if (!components.size) {
            return [];
        }
        return ResolvedEndpoint.of(nodeEndpoint, pass).compositionScope.filter(endpoint =>
            ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType => components.has(deviceType.id)),
        );
    }

    /**
     * Whether {@link endpoint} lists a component device type of the device types of {@link nodeEndpoint}, as every
     * {@link nodeConditionReadersOf condition reader} of {@link nodeEndpoint} does.
     *
     * @internal
     */
    export function mayReadNodeConditions<E>(endpoint: E, nodeEndpoint: E, pass: DeviceTypeValidationPass<E>) {
        const components = componentIdsOf(nodeEndpoint, pass);
        return (
            components.size > 0 &&
            ResolvedEndpoint.of(endpoint, pass).deviceTypes.some(deviceType => components.has(deviceType.id))
        );
    }
}

/**
 * The IDs of the component device types the device types of {@link endpoint} require.
 */
function componentIdsOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
    const lookups = lookupsFor(pass.model);
    const components = new Set<number>();
    for (const deviceType of ResolvedEndpoint.of(endpoint, pass).deviceTypes) {
        for (const requirement of lookups.requirementsOf(deviceType)) {
            const component = lookups.componentOf(requirement);
            if (component !== undefined) {
                components.add(component.id);
            }
        }
    }
    return components;
}

function treeRootOf<E>(endpoint: E, pass: DeviceTypeValidationPass<E>) {
    let root = endpoint;
    for (let owner = pass.facts.parentOf(root); owner !== undefined; owner = pass.facts.parentOf(root)) {
        root = owner;
    }
    return root;
}

/**
 * What cluster requirements are judged against: the endpoint {@link facts} describe, the device type whose
 * requirements they are and the conditions true for the endpoint. Violations go to {@link violations}.
 */
interface Context<E> {
    violations: DeviceTypeViolation[];
    facts: ResolvedEndpoint<E>;
    deviceType: DeviceTypeModel;
    conditions: Set<string>;
    pass: DeviceTypeValidationPass<E>;

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
function checkClusters<E>(context: Context<E>, requirements: readonly RequirementModel[]) {
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

function checkCluster<E>(context: Context<E>, requirement: RequirementModel, side: "server" | "client") {
    const { pass } = context;
    const lookups = lookupsFor(pass.model);
    const cluster = lookups.clusterOf(requirement);
    if (cluster?.id === undefined) {
        return;
    }

    const name = context.facts.clusterName(side, cluster.id);
    const path = side === "client" ? `client:${cluster.name}` : cluster.name;
    const applicability = applicabilityOf(requirement, context.conditions, pass);
    const departed = judge(
        context,
        applicability,
        name !== undefined,
        cluster,
        path,
        `${side} cluster ${cluster.name}`,
    );

    if (departed || name === undefined || side === "client") {
        return;
    }

    const features = context.facts.features(name);
    const trueNames = new Set([...context.conditions, ...features]);

    for (const nested of lookups.requirementsOf(requirement)) {
        let referent: Model | undefined;
        let present: boolean;

        switch (nested.element) {
            case RequirementElement.ElementType.Feature:
                referent = lookups.referentOf(nested);
                present = referent !== undefined && features.has(referent.name);
                break;

            case RequirementElement.ElementType.Attribute:
            case RequirementElement.ElementType.Command:
            case RequirementElement.ElementType.Event:
                referent = lookups.referentOf(nested);
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
            referent,
            `${path}.${referent.name}`,
            `${nested.element} ${referent.name} of ${cluster.name}`,
        );
    }
}

/**
 * Record the violation {@link applicability} and {@link present} amount to for {@link definition}, the model of the
 * required cluster or element, and answer whether there is one.
 */
function judge<E>(
    { violations, deviceType, waived }: Context<E>,
    applicability: Conformance.Applicability,
    present: boolean,
    definition: Model,
    requirement: string,
    subject: string,
) {
    if (waived.has(requirement)) {
        return false;
    }

    let kind: DeviceTypeViolation.Kind;
    let detail: string;
    if (applicability === Conformance.Applicability.Mandatory && !present && !isProvisional(definition)) {
        kind = "missing";
        detail = `Mandatory ${subject} is missing`;
    } else if (
        applicability === Conformance.Applicability.None &&
        present &&
        // Base's requirements are duties, not restrictions: presence beyond them is never disallowed
        deviceType.classification !== DeviceClassification.Base
    ) {
        kind = "disallowed";
        detail = `Disallowed ${subject} is present`;
    } else {
        return false;
    }

    violations.push({ deviceType: deviceType.name, requirement, kind, detail });
    return true;
}

/**
 * Whether {@link definition} is provisional in its own conformance, whatever the requirement for it states.
 *
 * A cluster model carries no conformance, so a cluster is never provisional here.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.3.5
 */
function isProvisional(definition: Model) {
    return definition instanceof ValueModel && definition.conformance.isProvisional;
}

/**
 * The applicability of {@link requirement} with {@link trueNames} true, as the endpoint is judged by it.
 *
 * {@link Conformance.Applicability.None} is answered only when the conformance forbids the element with every
 * condition undecided; one that only a condition forbids is {@link Conformance.Applicability.Conditional}, which is
 * not judged.
 */
function applicabilityOf<E>(requirement: RequirementModel, trueNames: Set<string>, pass: DeviceTypeValidationPass<E>) {
    const { all, features } = lookupsFor(pass.model).knownNamesOf(requirement);
    const applicability = requirementApplicability(requirement, trueNames, all);

    // matter.js cannot know every condition that holds, so a condition alone never disallows
    if (
        applicability === Conformance.Applicability.None &&
        requirementApplicability(requirement, trueNames, features) !== Conformance.Applicability.None
    ) {
        return Conformance.Applicability.Conditional;
    }

    return applicability;
}

/**
 * One requirement of a device type for a component device type, with the applicability it has under the conditions
 * of the composing endpoint.
 */
export interface ComponentInstance {
    requirement: RequirementModel;
    applicability: Conformance.Applicability;
}

/**
 * The requirements of one device type for one component device type: one per instance, or a single one.
 */
export interface Component {
    deviceType: DeviceTypeModel;

    /**
     * Every requirement for {@link deviceType}, each judged by its own applicability.
     */
    instances: ComponentInstance[];

    /**
     * Whether every one of {@link instances} is disallowed, so no endpoint of {@link deviceType} may fill it.
     */
    disallowed: boolean;
}

/**
 * Whether the instance applies: it is mandatory or optional under the conditions it was judged with.
 */
function applies({ applicability }: ComponentInstance) {
    return (
        applicability === Conformance.Applicability.Mandatory || applicability === Conformance.Applicability.Optional
    );
}

/**
 * Whether the instance is tolerated: a condition that is not stated decides it, so an endpoint may fill it but nothing
 * requires it, and a verdict that would depend on that condition takes the outcome that reports nothing.
 */
function isTolerated({ applicability }: ComponentInstance) {
    return applicability === Conformance.Applicability.Conditional;
}

/**
 * The component requirements of {@link deviceType}, a device type of {@link composing}, grouped by component device
 * type, each with its applicability under {@link conditions}, the conditions of {@link composing}.
 */
function componentsOf<E>(
    composing: E,
    deviceType: DeviceTypeModel,
    conditions: Set<string>,
    pass: DeviceTypeValidationPass<E>,
): Component[] {
    const byDeviceType = pass.components.get(composing, () => new Map());
    let found = byDeviceType.get(deviceType);
    if (found !== undefined) {
        return found;
    }

    const lookups = lookupsFor(pass.model);
    const byId = new Map<number, Component>();
    for (const requirement of lookups.requirementsOf(deviceType)) {
        const component = lookups.componentOf(requirement);
        if (component === undefined) {
            continue;
        }

        const applicability = applicabilityOf(requirement, conditions, pass);
        let entry = byId.get(component.id);
        if (entry === undefined) {
            entry = { deviceType: component, instances: [], disallowed: true };
            byId.set(component.id, entry);
        }
        entry.instances.push({ requirement, applicability });
        if (applicability !== Conformance.Applicability.None) {
            entry.disallowed = false;
        }
    }

    found = [...byId.values()];
    byDeviceType.set(deviceType, found);
    return found;
}

/**
 * The endpoints that may fill {@link component}: those of the composing endpoint's composition scope that list the
 * component device type.
 *
 * The device type ID must match exactly, so an endpoint of a device type that derives from the component is not a
 * candidate.
 */
function candidatesOf<E>(facts: ResolvedEndpoint<E>, component: Component, pass: DeviceTypeValidationPass<E>) {
    const { index } = pass;
    const nodeEndpoint =
        index && facts.composesFullFamily ? ConditionAssertions.nodeEndpointOf(facts.endpoint, pass) : undefined;
    if (
        index !== undefined &&
        nodeEndpoint !== undefined &&
        ConditionAssertions.isInScope(facts.endpoint, nodeEndpoint, pass)
    ) {
        // A full-family composition scope is every endpoint of the node scope below the composing endpoint
        const below = new Array<E>();
        for (const endpoint of index.scopeListing(nodeEndpoint, component.deviceType.id, pass)) {
            if (isBelow(endpoint, facts.endpoint, pass)) {
                below.push(endpoint);
            }
        }
        return ReachingEndpoints.inTreeOrder(below, pass.facts).map(endpoint => ResolvedEndpoint.of(endpoint, pass));
    }

    return facts.compositionScope
        .map(endpoint => ResolvedEndpoint.of(endpoint, pass))
        .filter(candidate => candidate.deviceTypes.some(deviceType => deviceType.id === component.deviceType.id));
}

function isBelow<E>(endpoint: E, ancestor: E, pass: DeviceTypeValidationPass<E>) {
    for (let current = pass.facts.parentOf(endpoint); current !== undefined; current = pass.facts.parentOf(current)) {
        if (current === ancestor) {
            return true;
        }
    }
    return false;
}

/**
 * The departures of {@link candidate} from the requirements nested in {@link instance}, a component requirement of
 * {@link composing}. They are judged with the rules of the endpoint's own cluster requirements and returned rather
 * than reported.
 */
function failuresOf<E>(
    candidate: ResolvedEndpoint<E>,
    instance: RequirementModel,
    composing: DeviceTypeModel,
    collection: ConditionAssertions.Collection<E>,
    pass: DeviceTypeValidationPass<E>,
) {
    const byInstance = pass.failures.get(candidate.endpoint, () => new Map());
    let violations = byInstance.get(instance);
    if (violations === undefined) {
        violations = new Array<DeviceTypeViolation>();
        const conditions = collection.conditionsOf(candidate.endpoint);
        checkClusters(
            { violations, facts: candidate, deviceType: composing, conditions, pass, waived: NONE },
            lookupsFor(pass.model).requirementsOf(instance),
        );
        byInstance.set(instance, violations);
    }
    return violations;
}

/**
 * Judge the endpoint of {@link context} as the composing endpoint of the component device types its device type
 * requires.
 *
 * Each component requirement is judged by its own applicability. A mandatory one needs as many endpoints as its
 * constraint states, at least one when it states none, and a distinct endpoint of its own. An optional one needs
 * none, but its constraint applies once there is one. A component whose every requirement is disallowed may have no
 * endpoint. A requirement whose conformance depends on something unknown is not judged.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.3
 */
function checkComposition<E>(context: Context<E>, collection: ConditionAssertions.Collection<E>) {
    const { violations, facts, deviceType, conditions, pass } = context;
    const components = componentsOf(facts.endpoint, deviceType, conditions, pass);
    const candidates = new Map<Component, ResolvedEndpoint<E>[]>();

    for (const component of components) {
        const found = candidatesOf(facts, component, pass);
        candidates.set(component, found);

        if (component.disallowed) {
            if (found.length) {
                violations.push({
                    deviceType: deviceType.name,
                    requirement: `device:${component.deviceType.name}`,
                    kind: "disallowed",
                    detail: `Disallowed component device type ${component.deviceType.name} is present on ${found.length} endpoint(s)`,
                });
            }
            continue;
        }

        checkCount(context, component, found.length);
        if (found.length) {
            checkInstances(context, component, found, collection);
        }
    }

    checkChoices(context, components, candidates);
}

/**
 * Report a number of endpoints of {@link component} outside the range an applying requirement's constraint states.
 * A mandatory requirement that states none implies at least one; an optional one is judged only once there is one.
 */
function checkCount<E>({ violations, deviceType }: Context<E>, component: Component, count: number) {
    for (const { requirement, applicability } of component.instances) {
        let range;
        if (applicability === Conformance.Applicability.Mandatory) {
            range = requirement.componentCountRange ?? { min: 1 };
        } else if (applicability === Conformance.Applicability.Optional && count > 0) {
            range = requirement.componentCountRange;
        }

        if (range === undefined || isWithin(range, count)) {
            continue;
        }

        violations.push({
            deviceType: deviceType.name,
            requirement: `device:${component.deviceType.name}`,
            kind: "instanceCount",
            detail: `Component device type ${component.deviceType.name} requires ${describeRange(range)} endpoint(s) in the composition; found ${count}`,
        });
    }
}

/**
 * Match the mandatory instances of {@link component} to distinct {@link candidates} that satisfy them, and report each
 * one left unmatched with what it requires that no candidate offers. Other instances may go unfilled.
 */
function checkInstances<E>(
    { violations, deviceType, pass }: Context<E>,
    component: Component,
    candidates: ResolvedEndpoint<E>[],
    collection: ConditionAssertions.Collection<E>,
) {
    const mandatory = component.instances
        .filter(({ applicability }) => applicability === Conformance.Applicability.Mandatory)
        .map(({ requirement }) => requirement);
    const failures = mandatory.map(instance =>
        candidates.map(candidate => failuresOf(candidate, instance, deviceType, collection, pass)),
    );
    const matched = matchInstances(failures.map(row => row.map(failed => !failed.length)));

    mandatory.forEach((instance, index) => {
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
 * Judge choice conformance across the component requirements that name the same choice: the number of their
 * component device types with endpoints in range must meet the choice's count. A choice is judged once one of its
 * members applies. A tolerated member counts when it is satisfied but is never needed, so the choice is reported only
 * when no subset of its tolerated members meets the count. A disallowed requirement is no member. A choice counts only
 * at the top of a conformance.
 *
 * A member counts as satisfied when it has endpoints in the ranges of its choice requirements, whether or not they
 * meet its nested requirements, because each endpoint that does not is reported on itself. The ranges of a member that
 * applies come only from its applying choice requirements.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.3.14
 */
function checkChoices<E>(
    { violations, deviceType }: Context<E>,
    components: Component[],
    candidates: Map<Component, ResolvedEndpoint<E>[]>,
) {
    const choices = new Map<string, { choice: Conformance.Ast.Choice; members: Map<Component, ChoiceMember> }>();

    for (const component of components) {
        for (const instance of component.instances) {
            const { ast } = instance.requirement.conformance;
            if (ast.type !== Conformance.Special.Choice || !(applies(instance) || isTolerated(instance))) {
                continue;
            }

            let entry = choices.get(ast.param.name);
            if (entry === undefined) {
                entry = { choice: ast.param, members: new Map() };
                choices.set(ast.param.name, entry);
            }

            const applying = applies(instance);
            let member = entry.members.get(component);
            if (member === undefined || (applying && !member.applies)) {
                member = { applies: applying, ranges: new Array<RequirementModel.CountRange>() };
                entry.members.set(component, member);
            } else if (!applying && member.applies) {
                continue;
            }
            const range = instance.requirement.componentCountRange;
            if (range !== undefined) {
                member.ranges.push(range);
            }
        }
    }

    for (const { choice, members } of choices.values()) {
        let satisfied = 0;
        let tolerated = 0;
        let judged = false;
        for (const [component, { applies, ranges }] of members) {
            judged ||= applies;
            const count = candidates.get(component)?.length ?? 0;
            if (count > 0 && ranges.every(range => isWithin(range, count))) {
                if (applies) {
                    satisfied++;
                } else {
                    tolerated++;
                }
            }
        }
        if (!judged) {
            continue;
        }

        const { num, orMore, orLess } = choice;
        const most = satisfied + tolerated;
        if (orMore ? most >= num : orLess ? satisfied <= num : satisfied <= num && most >= num) {
            continue;
        }

        const names = [...members.keys()].map(component => component.deviceType.name);
        const bound = orMore ? "at least" : orLess ? "at most" : "exactly";
        violations.push({
            deviceType: deviceType.name,
            requirement: `device:${names.join("|")}`,
            kind: "instanceCount",
            detail: `Requires ${bound} ${num} of component device types ${names.join(", ")}; found ${satisfied}`,
        });
    }
}

/**
 * A component device type named by a choice, and whether it is a member because one of its requirements applies or
 * only tolerated.
 */
interface ChoiceMember {
    applies: boolean;
    ranges: RequirementModel.CountRange[];
}

/**
 * Report {@link facts}'s endpoint where it fills a component requirement of an endpoint that composes it but
 * satisfies the nested requirements of none of its instances. A tolerated instance the endpoint satisfies is enough,
 * but only an applying instance makes the endpoint a component to judge. The violation names the instance it comes
 * closest to and carries the composing device type.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.3
 */
function checkComponentOf<E>(
    violations: DeviceTypeViolation[],
    facts: ResolvedEndpoint<E>,
    collection: ConditionAssertions.Collection<E>,
    pass: DeviceTypeValidationPass<E>,
) {
    const own = new Set(facts.deviceTypes.map(deviceType => deviceType.id));
    if (!own.size || facts.isNodeEndpoint) {
        return;
    }

    for (
        let composer = pass.facts.parentOf(facts.endpoint);
        composer !== undefined;
        composer = pass.facts.parentOf(composer)
    ) {
        const composerFacts = ResolvedEndpoint.of(composer, pass);
        const conditions = collection.conditionsOf(composer);

        const filled = composerFacts.deviceTypes.flatMap(deviceType =>
            componentsOf(composer, deviceType, conditions, pass).flatMap(component => {
                const instances = own.has(component.deviceType.id)
                    ? component.instances.filter(instance => applies(instance) || isTolerated(instance))
                    : [];
                return instances.some(applies) ? [{ deviceType, component, instances }] : [];
            }),
        );

        // Checked before the scope walk, so the many children of an aggregator do not each walk its whole family
        if (filled.length && composerFacts.composes(facts.endpoint)) {
            for (const { deviceType, component, instances } of filled) {
                const failures = instances.map(({ requirement }) =>
                    failuresOf(facts, requirement, deviceType, collection, pass),
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
                const instance = instances[closest].requirement;
                const failed = failures[closest].map(({ requirement }) => requirement).join(", ");
                const role = `component ${component.deviceType.name} of ${deviceType.name} ${pass.facts.describe(composer)}`;

                violations.push({
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
 * Report each of {@link descendantAssertions}, the `Descendant` conditions an endpoint asserts, whose number of
 * endpoints lies outside the range its constraint states.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
function checkDescendantCounts<E>(
    violations: DeviceTypeViolation[],
    descendantAssertions: ConditionAssertions.DescendantAssertion<E>[],
    model: MatterModel,
) {
    for (const { requirement, matches } of descendantAssertions) {
        const range = requirement.componentCountRange;
        if (range === undefined || isWithin(range, matches.length)) {
            continue;
        }

        const condition = lookupsFor(model).assertedConditionOf(requirement);
        violations.push({
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
    const number =
        instance.instanceNumber ?? component.instances.findIndex(({ requirement }) => requirement === instance) + 1;
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
 * The quality lets the declaring endpoint carry the cluster and forbids it on every other endpoint of the scope whose
 * device types do not list it. It does not make the cluster required on the declaring endpoint; conformance decides
 * that. An endpoint in no node scope is not judged.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.7.3
 */
function checkSingletons<E>(
    violations: DeviceTypeViolation[],
    facts: ResolvedEndpoint<E>,
    pass: DeviceTypeValidationPass<E>,
) {
    const nodeEndpoint = ConditionAssertions.nodeEndpointOf(facts.endpoint, pass);
    if (nodeEndpoint === undefined) {
        return;
    }

    const singletons = pass.singletons.get(nodeEndpoint, () =>
        singletonsOf(ConditionAssertions.singletonDeclarersOf(nodeEndpoint, pass), pass),
    );
    reportMisplaced(violations, facts, singletons, pass);
}

/**
 * Report each server cluster of the endpoint of {@link facts} that {@link singletons} holds and that neither a
 * declaring endpoint nor a device type of the endpoint's own lists.
 *
 * A device type listing the cluster as a server cluster, with any conformance, admits it on its endpoint. This reading
 * lets a Bridged Node carry the RootNode singletons it lists, such as the AdministratorCommissioning a Fabric
 * Synchronized bridged node requires; it is interim until the spec settles whether a Bridged Node is a node scope of
 * its own.
 */
function reportMisplaced<E>(
    violations: DeviceTypeViolation[],
    facts: ResolvedEndpoint<E>,
    singletons: Map<number, Singleton<E>>,
    pass: DeviceTypeValidationPass<E>,
) {
    let listed: Set<number> | undefined;
    for (const [id, { cluster, deviceType, endpoints }] of singletons) {
        if (endpoints.has(facts.endpoint) || facts.clusterName("server", id) === undefined) {
            continue;
        }
        listed ??= listedServerClustersOf(facts, pass);
        if (listed.has(id)) {
            continue;
        }

        violations.push({
            deviceType,
            requirement: cluster,
            kind: "singletonMisplaced",
            detail: `Server cluster ${cluster} is a singleton of ${deviceType} in this node scope, so it may appear only on an endpoint that lists that device type or a device type listing the cluster`,
        });
    }
}

/**
 * The IDs of the server clusters the device types of the endpoint of {@link facts} list, with any conformance.
 */
function listedServerClustersOf<E>(facts: ResolvedEndpoint<E>, pass: DeviceTypeValidationPass<E>) {
    const lookups = lookupsFor(pass.model);
    const listed = new Set<number>();
    for (const deviceType of facts.deviceTypes) {
        for (const requirement of lookups.requirementsOf(deviceType)) {
            if (requirement.element !== RequirementElement.ElementType.ServerCluster) {
                continue;
            }
            const id = lookups.clusterOf(requirement)?.id;
            if (id !== undefined) {
                listed.add(id);
            }
        }
    }
    return listed;
}

/**
 * The server clusters the device types of {@link declarers} declare singletons, by cluster ID, with the first
 * declaring device type and every declaring endpoint.
 */
function singletonsOf<E>(declarers: Iterable<E>, pass: DeviceTypeValidationPass<E>) {
    const singletons = new Map<number, Singleton<E>>();

    for (const endpoint of declarers) {
        for (const deviceType of ResolvedEndpoint.of(endpoint, pass).deviceTypes) {
            for (const requirement of lookupsFor(pass.model).requirementsOf(deviceType)) {
                if (
                    requirement.element !== RequirementElement.ElementType.ServerCluster ||
                    !requirement.quality.singleton
                ) {
                    continue;
                }

                const cluster = lookupsFor(pass.model).clusterOf(requirement);
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
function withDeclarationsOf<E>(endpoint: E, singletons: Map<number, Singleton<E>>, pass: DeviceTypeValidationPass<E>) {
    const declared = pass.declarations.get(endpoint, () => singletonsOf([endpoint], pass));
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

export interface Singleton<E> {
    cluster: string;
    deviceType: string;
    endpoints: Set<E>;
}

const NONE: ReadonlySet<string> = new Set();

const AGGREGATED: ReadonlySet<string> = new Set(["Descriptor.TAGLIST"]);

/**
 * The paths of Base requirements not judged on the endpoint of {@link facts}.
 *
 * Base requires a TagList of an endpoint that duplicates a sibling unless its device types define another way to
 * disambiguate. Aggregator defines one for its children, the bridged devices' NodeLabel, which the model cannot express.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.9
 * @see {@link MatterSpecification.v16.Device} § 11.2.6
 */
function baseWaiversOf<E>(facts: ResolvedEndpoint<E>, pass: DeviceTypeValidationPass<E>) {
    const owner = pass.facts.parentOf(facts.endpoint);
    const aggregator = lookupsFor(pass.model).aggregator;
    if (owner === undefined || aggregator === undefined) {
        return NONE;
    }

    const parentAggregates = ResolvedEndpoint.of(owner, pass).deviceTypes.some(({ id }) => id === aggregator.id);
    return parentAggregates ? AGGREGATED : NONE;
}
