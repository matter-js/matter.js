/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification, ElementTag } from "../common/index.js";
import { RequirementElement } from "../elements/index.js";
import {
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    FieldModel,
    MatterModel,
    Model,
    RequirementModel,
} from "../models/index.js";
import { ModelTraversal } from "./ModelTraversal.js";

/**
 * Resolves the names a device type requirement's conformance references.
 *
 * A device type declares conditions its requirements may then name, and a requirement inside a cluster requirement may
 * also name a feature of that cluster. Every name resolves in the {@link EndpointScope} of the requirement, the scope
 * of the endpoint the requirement describes.
 *
 * A condition name in conformance resolves regardless of case. That is what lets a caller find the declared spelling
 * of a name the specification's conformance tables spell in another case; whether a name is spelled as declared is a
 * separate question, which model validation answers. A feature code in conformance must match exactly, so below a
 * cluster requirement whose cluster defines the feature `NODE`, the name `NODE` resolves to the feature while `Node`
 * resolves to the Base condition `Node`. {@link featureOf}, which answers what a feature requirement itself names,
 * follows its own rule.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export namespace RequirementResolver {
    /**
     * The scope of the endpoint a requirement describes, in which the names of its conformance resolve.
     */
    export interface EndpointScope {
        /**
         * The device type of the endpoint: the component device type for a requirement nested in a component
         * requirement, otherwise the device type that owns the requirement. Undefined when the requirement belongs to
         * no device type, or when the model does not define the component device type.
         */
        deviceType?: DeviceTypeModel;

        /**
         * The cluster whose features the conformance may name: the cluster of the cluster requirement a requirement
         * is nested in. Undefined for a cluster requirement's own conformance, because the cluster's features cannot
         * decide whether the cluster is required, and when the model does not define the cluster.
         */
        cluster?: ClusterModel;
    }

    /**
     * The {@link EndpointScope} of a requirement.
     *
     * A requirement's own conformance decides whether the requirement applies to its enclosing endpoint, so the scope
     * derives from the requirement's ancestors only.
     */
    export function endpointScopeOf(requirement: RequirementModel): EndpointScope {
        const matter = requirement.owner(MatterModel);
        const scope: EndpointScope = {};
        let clusterFound = false;

        for (let model = requirement.parent; model !== undefined; model = model.parent) {
            if (model instanceof DeviceTypeModel) {
                scope.deviceType = model;
                break;
            }

            if (!(model instanceof RequirementModel)) {
                break;
            }

            if (!clusterFound && isClusterRequirement(model)) {
                clusterFound = true;
                scope.cluster = clusterNamedBy(matter, model);
                continue;
            }

            if (model.element === RequirementElement.ElementType.DeviceType) {
                scope.deviceType = deviceTypeOf(model);
                break;
            }
        }

        return scope;
    }

    /**
     * Every condition the requirements of {@link deviceType} may name, keyed by lowercased name.
     *
     * The model spells a condition as the specification declares it but references it as the specification's
     * conformance tables spell it, which is not always the same case, so names are keyed case-insensitively.
     *
     * A condition is keyed unqualified when the device type or one of its bases declares it, or when it is universal
     * (declared by the base device type). The device type's own conditions win over its bases', and those win over
     * universal ones. Every condition is keyed as `declarer.name` as well, because a requirement asserting a foreign
     * device type's condition names it that way.
     */
    export function conditionsOf(deviceType: DeviceTypeModel): Map<string, ConditionModel> {
        return conditionsIn(deviceType.owner(MatterModel), deviceType);
    }

    /**
     * Resolve one name a requirement's conformance references, in the requirement's {@link EndpointScope}. A
     * qualified name arrives as its segments.
     */
    export function resolve(requirement: RequirementModel, name: string | string[]): Model | undefined {
        const segments = typeof name === "string" ? [name] : name;
        const { deviceType, cluster } = endpointScopeOf(requirement);

        // A feature wins over a condition of the same name, because inside a cluster requirement a name that the
        // cluster defines states what the cluster supports. Features are named in upper case where conditions are
        // not, so an exact match is what keeps a feature and a condition of the same spelling apart
        if (segments.length === 1) {
            const feature = cluster?.features.find(feature => feature.name === segments[0]);
            if (feature !== undefined) {
                return feature;
            }
        }

        return conditionsIn(requirement.owner(MatterModel), deviceType).get(segments.join(".").toLowerCase());
    }

    /**
     * The cluster a requirement belongs to: the one a cluster requirement names, or the one enclosing a requirement
     * nested in a cluster requirement. Undefined for any other requirement or a cluster the model does not define.
     */
    export function clusterOf(requirement: RequirementModel): ClusterModel | undefined {
        if (isClusterRequirement(requirement)) {
            return clusterNamedBy(requirement.owner(MatterModel), requirement);
        }
        return endpointScopeOf(requirement).cluster;
    }

    /**
     * The device type a component requirement names, by its ID and otherwise by its name. Undefined for a requirement
     * that is not a component requirement or a device type the model does not define.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function deviceTypeOf(requirement: RequirementModel): DeviceTypeModel | undefined {
        if (requirement.element !== RequirementElement.ElementType.DeviceType) {
            return undefined;
        }
        return requirement.owner(MatterModel)?.deviceTypes(requirement.id ?? requirement.name);
    }

    /**
     * The feature of its cluster that a feature requirement names, or undefined if it names none or is not a feature
     * requirement.
     *
     * A requirement names a feature by its code or by its title in any case and spacing. The title match holds only
     * while requirement names are not canonicalized to feature codes.
     */
    export function featureOf(requirement: RequirementModel): FieldModel | undefined {
        if (requirement.element !== RequirementElement.ElementType.Feature) {
            return undefined;
        }

        const features = endpointScopeOf(requirement).cluster?.features;
        if (features === undefined) {
            return undefined;
        }

        const code = requirement.name.toLowerCase();
        const byCode = features.find(feature => feature.name.toLowerCase() === code);
        if (byCode !== undefined) {
            return byCode;
        }

        const title = titleKey(requirement.name);
        return features.find(feature => titleKey(feature.title) === title);
    }

    /**
     * The attribute, command or event of its cluster that an element requirement names, or undefined if it names none
     * or is not an attribute, command or event requirement.
     *
     * The name matches exactly and only an element of the kind the requirement states.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function elementOf(requirement: RequirementModel): Model | undefined {
        const tag = elementTagOf(requirement.element);
        if (tag === undefined) {
            return undefined;
        }
        return endpointScopeOf(requirement).cluster?.member(requirement.name, [tag]);
    }

    /**
     * The field of a command of its cluster that a command field requirement names, or undefined if it names none or
     * is not a command field requirement.
     *
     * The specification's tables name a command field by the command's name followed by the field's, with nothing
     * between them, and state it directly in the cluster requirement. Both names match exactly.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function commandFieldOf(requirement: RequirementModel): Model | undefined {
        if (requirement.element !== RequirementElement.ElementType.CommandField) {
            return undefined;
        }

        const { name } = requirement;
        for (const command of endpointScopeOf(requirement).cluster?.commands ?? []) {
            if (!name.startsWith(command.name)) {
                continue;
            }

            const field = command.member(name.slice(command.name.length), [ElementTag.Field]);
            if (field !== undefined) {
                return field;
            }
        }

        return undefined;
    }

    /**
     * The condition a condition requirement asserts, named by its type and otherwise by its name, or undefined if it
     * names none or is not a condition requirement.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.2.6
     */
    export function conditionOf(requirement: RequirementModel): ConditionModel | undefined {
        if (requirement.element !== RequirementElement.ElementType.Condition) {
            return undefined;
        }

        const resolved = resolve(requirement, requirement.type?.split(".") ?? requirement.name);
        return resolved instanceof ConditionModel ? resolved : undefined;
    }

    /**
     * The canonical name a condition requirement asserts, or undefined for a requirement that is not a condition
     * requirement.
     *
     * The name of the condition it resolves to, so conformance referencing the condition in another case still matches.
     * A requirement that resolves to no condition answers its own name, which lets validation report the name the
     * requirement states.
     */
    export function conditionNameOf(requirement: RequirementModel): string | undefined {
        if (requirement.element !== RequirementElement.ElementType.Condition) {
            return undefined;
        }

        return conditionOf(requirement)?.name ?? requirement.name;
    }
}

function conditionsIn(matter: MatterModel | undefined, deviceType: DeviceTypeModel | undefined) {
    const conditions = new Map<string, ConditionModel>();

    for (const declarer of matter?.deviceTypes ?? []) {
        for (const condition of declarer.all(ConditionModel)) {
            conditions.set(qualifiedKey(declarer, condition), condition);
            if (declarer.classification === DeviceClassification.Base) {
                conditions.set(condition.name.toLowerCase(), condition);
            }
        }
    }

    if (deviceType === undefined) {
        return conditions;
    }

    const lineage = new Array<DeviceTypeModel>();
    new ModelTraversal().visitInheritance(deviceType, model => {
        if (model instanceof DeviceTypeModel) {
            lineage.push(model);
        }
    });

    // Farthest base first, so a nearer declaration of the same name overwrites it
    for (const declarer of lineage.reverse()) {
        for (const condition of declarer.all(ConditionModel)) {
            conditions.set(condition.name.toLowerCase(), condition);
            conditions.set(qualifiedKey(declarer, condition), condition);
        }
    }

    return conditions;
}

function qualifiedKey(declarer: DeviceTypeModel, condition: ConditionModel) {
    return `${declarer.name}.${condition.name}`.toLowerCase();
}

function titleKey(title: string | undefined) {
    return title?.toLowerCase().replace(/\s/g, "");
}

function elementTagOf(element: RequirementElement.ElementType) {
    switch (element) {
        case RequirementElement.ElementType.Attribute:
            return ElementTag.Attribute;

        case RequirementElement.ElementType.Command:
            return ElementTag.Command;

        case RequirementElement.ElementType.Event:
            return ElementTag.Event;

        default:
            return undefined;
    }
}

function isClusterRequirement(requirement: RequirementModel) {
    return (
        requirement.element === RequirementElement.ElementType.ServerCluster ||
        requirement.element === RequirementElement.ElementType.ClientCluster
    );
}

function clusterNamedBy(matter: MatterModel | undefined, clusterRequirement: RequirementModel) {
    return matter?.clusters(clusterRequirement.id ?? clusterRequirement.name);
}
