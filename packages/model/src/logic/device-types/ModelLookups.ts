/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceClassification } from "../../common/DeviceClassification.js";
import { EndpointComposition } from "../../common/EndpointComposition.js";
import { RequirementElement } from "../../elements/RequirementElement.js";
import {
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    MatterModel,
    Model,
    RequirementModel,
} from "../../models/index.js";
import { RequirementResolver } from "../RequirementResolver.js";
import { Memo } from "./Memo.js";

const lookups = new WeakMap<MatterModel, ModelLookups>();

/**
 * The lookups {@link model} shares with every `DeviceTypeValidationPass` resolved in it, one instance per model:
 * resolving a requirement to the cluster, feature or element it names, a device type's conditions, and similar. A
 * tree-derived fact never belongs here.
 *
 * Keyed on the model instance, so a model built by {@link MatterModel.withClusters} — a copy, per its contract —
 * never sees another model's entries. The outer table is a {@link WeakMap}, so discarding a model discards its
 * entries with it.
 *
 * @internal
 */
export function lookupsFor(model: MatterModel): ModelLookups {
    let found = lookups.get(model);
    if (found === undefined) {
        found = new ModelLookups(model);
        lookups.set(model, found);
    }
    return found;
}

/**
 * The declared names a requirement's conformance may reference.
 *
 * @internal
 */
export interface KnownNames {
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

/**
 * @internal
 */
class ModelLookups {
    readonly #model: MatterModel;
    readonly #deviceTypes = new Memo<number, DeviceTypeModel | undefined>();
    readonly #clusters = new Memo<RequirementModel, ClusterModel | undefined>();
    readonly #referents = new Memo<RequirementModel, Model | undefined>();
    readonly #conditionScopes = new Memo<DeviceTypeModel, Map<string, ConditionModel>>();
    readonly #assertedConditions = new Memo<RequirementModel, ConditionModel | undefined>();
    readonly #knownNames = new Memo<RequirementModel, KnownNames>();
    readonly #requirements = new Memo<DeviceTypeModel | RequirementModel, RequirementModel[]>();
    readonly #components = new Memo<RequirementModel, DeviceTypeModel | undefined>();
    readonly #composed = new Memo<DeviceTypeModel, boolean>();
    readonly #compositions = new Memo<DeviceTypeModel, EndpointComposition>();
    readonly #base = new Memo<undefined, DeviceTypeModel[]>();
    readonly #aggregator = new Memo<undefined, DeviceTypeModel | undefined>();

    constructor(model: MatterModel) {
        this.#model = model;
    }

    /**
     * The device type {@link id} names, undefined when the model does not define one.
     */
    deviceTypeOf(id: number): DeviceTypeModel | undefined {
        return this.#deviceTypes.get(id, () => this.#model.deviceTypes(id));
    }

    /**
     * The requirements {@link parent}, a device type or a requirement, states directly.
     */
    requirementsOf(parent: DeviceTypeModel | RequirementModel): readonly RequirementModel[] {
        return this.#requirements.get(parent, () => parent.requirements);
    }

    /**
     * The component device type {@link requirement} names, undefined when it is no device type requirement or names
     * no device type of the model.
     */
    componentOf(requirement: RequirementModel): DeviceTypeModel | undefined {
        return this.#components.get(requirement, () => RequirementResolver.deviceTypeOf(requirement));
    }

    /**
     * Whether {@link deviceType} states a device type requirement, which makes its endpoints composed.
     */
    componentsDeclaredBy(deviceType: DeviceTypeModel): boolean {
        return this.#composed.get(deviceType, () =>
            this.requirementsOf(deviceType).some(
                ({ element }) => element === RequirementElement.ElementType.DeviceType,
            ),
        );
    }

    /**
     * {@link DeviceTypeModel.effectiveComposition}, resolved once per device type.
     */
    compositionOf(deviceType: DeviceTypeModel): EndpointComposition {
        return this.#compositions.get(deviceType, () => deviceType.effectiveComposition);
    }

    /**
     * The cluster {@link requirement} names, undefined when it does not resolve in the model.
     */
    clusterOf(requirement: RequirementModel): ClusterModel | undefined {
        return this.#clusters.get(requirement, () => RequirementResolver.clusterOf(requirement));
    }

    /**
     * The feature, attribute, command or event model {@link requirement} names, undefined when it does not resolve.
     */
    referentOf(requirement: RequirementModel): Model | undefined {
        return this.#referents.get(requirement, () =>
            requirement.element === RequirementElement.ElementType.Feature
                ? RequirementResolver.featureOf(requirement)
                : RequirementResolver.elementOf(requirement),
        );
    }

    /**
     * The condition {@link requirement} asserts, undefined when it asserts none.
     */
    assertedConditionOf(requirement: RequirementModel): ConditionModel | undefined {
        return this.#assertedConditions.get(requirement, () => RequirementResolver.conditionOf(requirement));
    }

    /**
     * {@link RequirementResolver.conditionsOf}, resolved once per model and device type.
     */
    conditionScopeOf(deviceType: DeviceTypeModel): Map<string, ConditionModel> {
        return this.#conditionScopes.get(deviceType, () => RequirementResolver.conditionsOf(deviceType));
    }

    /**
     * The declared names {@link requirement}'s conformance may reference.
     */
    knownNamesOf(requirement: RequirementModel): KnownNames {
        return this.#knownNames.get(requirement, () => {
            const { deviceType, cluster } = RequirementResolver.endpointScopeOf(requirement);
            const features = new Set((cluster?.features ?? []).map(({ name }) => name));
            const all = new Set(features);

            if (deviceType !== undefined) {
                for (const [key, condition] of this.conditionScopeOf(deviceType)) {
                    // A qualified entry names a condition of any device type, which the requirement cannot reach
                    if (!key.includes(".")) {
                        all.add(condition.name);
                    }
                }
            }

            return { all, features };
        });
    }

    /**
     * The device types the model classifies as Base, whose requirements apply to every endpoint that lists a device
     * type the model defines.
     */
    get baseDeviceTypes(): readonly DeviceTypeModel[] {
        return this.#base.get(undefined, () =>
            this.#model.deviceTypes.filter(deviceType => deviceType.classification === DeviceClassification.Base),
        );
    }

    /**
     * The Aggregator device type, undefined when the model does not define one.
     */
    get aggregator(): DeviceTypeModel | undefined {
        return this.#aggregator.get(undefined, () => this.#model.deviceTypes("Aggregator"));
    }
}
