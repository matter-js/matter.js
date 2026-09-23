/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "../common/index.js";
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

/**
 * Resolves the names a device type requirement's conformance references.
 *
 * A device type declares conditions its requirements may then name, and a requirement inside a cluster requirement may
 * also name a feature of that cluster.  The definition validator and runtime validation both resolve names here, so
 * the two cannot disagree on what a name means.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export namespace RequirementResolver {
    /**
     * Every condition the requirements of {@link deviceType} may name, keyed by lowercased name.
     *
     * The model spells a condition as the specification declares it but references it as the specification's
     * conformance tables spell it, which is not always the same case, so names are keyed case-insensitively.
     *
     * A condition is keyed unqualified when the device type itself declares it, or when it is universal (declared by
     * the base device type).  Every condition is keyed as `declarer.name` as well, because a requirement asserting a
     * foreign device type's condition names it that way.
     */
    export function conditionsOf(deviceType: DeviceTypeModel): Map<string, ConditionModel> {
        const conditions = new Map<string, ConditionModel>();

        for (const declarer of deviceType.owner(MatterModel)?.deviceTypes ?? []) {
            for (const condition of declarer.all(ConditionModel)) {
                conditions.set(qualifiedKey(declarer, condition), condition);
                if (declarer.classification === DeviceClassification.Base) {
                    conditions.set(condition.name.toLowerCase(), condition);
                }
            }
        }

        // Last, so a condition the device type declares itself wins over a universal one of the same name
        for (const condition of deviceType.all(ConditionModel)) {
            conditions.set(condition.name.toLowerCase(), condition);
            conditions.set(qualifiedKey(deviceType, condition), condition);
        }

        return conditions;
    }

    /**
     * Resolve one name a requirement's conformance references.  A qualified name arrives as its segments.
     */
    export function resolve(requirement: RequirementModel, name: string | string[]): Model | undefined {
        const segments = typeof name === "string" ? [name] : name;

        // A feature wins over a condition of the same name, because inside a cluster requirement a name that the
        // cluster defines states what the cluster supports
        if (segments.length === 1) {
            const feature = featureNamed(requirement, segments[0]);
            if (feature !== undefined) {
                return feature;
            }
        }

        const deviceType = requirement.owner(DeviceTypeModel);
        if (deviceType === undefined) {
            return undefined;
        }

        return conditionsOf(deviceType).get(segments.join(".").toLowerCase());
    }

    /**
     * The cluster a requirement belongs to: the one a cluster requirement names, or the one enclosing a requirement
     * nested in a cluster requirement.  Undefined for any other requirement or a cluster the model does not define.
     */
    export function clusterOf(requirement: RequirementModel): ClusterModel | undefined {
        const clusterRequirement = clusterRequirementOf(requirement);
        if (clusterRequirement === undefined) {
            return undefined;
        }

        return requirement.owner(MatterModel)?.clusters(clusterRequirement.id ?? clusterRequirement.name);
    }

    /**
     * The feature of its cluster that a feature requirement names, or undefined if it names none or is no feature
     * requirement.
     *
     * A requirement names a feature by its code or by its title in any case and spacing.  The title match holds only
     * while requirement names are not canonicalized to feature codes.
     */
    export function featureOf(requirement: RequirementModel): FieldModel | undefined {
        if (requirement.element !== RequirementElement.ElementType.Feature) {
            return undefined;
        }

        const features = clusterOf(requirement)?.features;
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
     * The canonical name a condition requirement asserts, or undefined for a requirement that is no condition.
     *
     * The name of the condition it resolves to, so conformance referencing the condition in another case still matches.
     * A requirement that resolves to no condition answers its own name, which lets validation report the name the
     * requirement states.
     */
    export function conditionNameOf(requirement: RequirementModel): string | undefined {
        if (requirement.element !== RequirementElement.ElementType.Condition) {
            return undefined;
        }

        const resolved = resolve(requirement, requirement.type?.split(".") ?? requirement.name);

        return resolved?.name ?? requirement.name;
    }
}

function qualifiedKey(declarer: DeviceTypeModel, condition: ConditionModel) {
    return `${declarer.name}.${condition.name}`.toLowerCase();
}

/**
 * The feature of the cluster a requirement qualifies.  Features are named in upper case where conditions are not, so
 * an exact match is what keeps a feature and a condition of the same spelling apart.
 */
function featureNamed(requirement: RequirementModel, name: string): FieldModel | undefined {
    return RequirementResolver.clusterOf(requirement)?.features.find(feature => feature.name === name);
}

function titleKey(title: string | undefined) {
    return title?.toLowerCase().replace(/\s/g, "");
}

function clusterRequirementOf(requirement: RequirementModel): RequirementModel | undefined {
    for (let model: Model | undefined = requirement; model instanceof RequirementModel; model = model.parent) {
        if (
            model.element === RequirementElement.ElementType.ServerCluster ||
            model.element === RequirementElement.ElementType.ClientCluster
        ) {
            return model;
        }
    }

    return undefined;
}
