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
     * feature, attribute, command and event requirements nested in them, plus the names in
     * {@link Endpoint.deviceConditions} that name no condition.
     *
     * A mandatory requirement is violated when its cluster or element is absent, a disallowed one when it is present.
     * Optional requirements and those whose conformance names something unknown are not judged. A missing or
     * disallowed cluster is the one finding for that cluster; its nested requirements are not judged.
     *
     * @param assertions the conditions that hold per endpoint, as {@link ConditionAssertions.collect} answers them for
     * the endpoint's node scope
     */
    export function check(
        endpoint: Endpoint,
        assertions: Map<Endpoint, Set<string>>,
        model: MatterModel = Matter,
    ): Violation[] {
        const violations = new Array<Violation>();
        const facts = EndpointFacts.of(endpoint, model);
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
            for (const requirement of deviceType.requirements) {
                switch (requirement.element) {
                    case RequirementElement.ElementType.ServerCluster:
                        checkCluster(context, requirement, "server");
                        break;

                    case RequirementElement.ElementType.ClientCluster:
                        checkCluster(context, requirement, "client");
                        break;

                    // A component requirement's nested requirements describe the component's endpoint, not this one
                }
            }
        }

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

interface Context {
    violations: Violation[];
    facts: EndpointFacts;
    deviceType: DeviceTypeModel;
    conditions: Set<string>;
}

function checkCluster(context: Context, requirement: RequirementModel, side: "server" | "client") {
    const cluster = RequirementResolver.clusterOf(requirement);
    if (cluster?.id === undefined) {
        return;
    }

    const name = context.facts.clusterName(side, cluster.id);
    const applicability = requirementApplicability(requirement, context.conditions, knownNamesOf(requirement));
    const departed = judge(context, applicability, name !== undefined, cluster.name, `${side} cluster ${cluster.name}`);

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
            `${cluster.name}.${referent.name}`,
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
    } else if (applicability === Conformance.Applicability.None && present) {
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
