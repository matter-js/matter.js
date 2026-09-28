/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceTypeModel, MatterModel, RequirementModel } from "../../models/index.js";
import { ConditionAssertions } from "./ConditionAssertions.js";
import { DeviceTypeConformance, type Component, type Singleton } from "./DeviceTypeConformance.js";
import type { DeviceTypeFacts } from "./DeviceTypeFacts.js";
import type { DeviceTypeScopeIndex } from "./DeviceTypeScopeIndex.js";
import type { DeviceTypeViolation } from "./DeviceTypeViolation.js";
import { Memo } from "./Memo.js";
import { ResolvedEndpoint } from "./ResolvedEndpoint.js";

/**
 * One run of device type validation over one or more endpoints that {@link facts} describes, resolved in
 * {@link model}.
 *
 * The checks of a pass share what several endpoints read from the tree: the facts of each endpoint, the conditions
 * of each node scope and the composition facts of each composing endpoint. Judging the endpoints of a node scope one
 * by one otherwise repeats that work per endpoint.
 *
 * A pass must not outlive one synchronous run. The tree may change between runs, and nothing a pass memoizes of it is
 * invalidated. A lookup that reads only {@link model} — the cluster, feature or element a requirement names, for
 * example — outlives the pass and is shared with every other pass resolved in the same model; see
 * `ModelLookups`. A pass created with an {@link index} reads the reaching endpoints of a node scope and the device
 * types of siblings from it rather than from the tree.
 *
 * Mutating a model in place after it has validated an endpoint is unsupported: `ModelLookups` keys its entries by
 * model instance, not content, so a mutated model keeps serving lookups from before the mutation. Build a new model
 * instead, e.g. with {@link MatterModel.withClusters}, which already returns a copy.
 */
export class DeviceTypeValidationPass<E> {
    readonly facts: DeviceTypeFacts<E>;
    readonly model: MatterModel;

    /** @internal */
    readonly index?: DeviceTypeScopeIndex<E>;

    /** @internal */
    readonly resolved = new Memo<E, ResolvedEndpoint<E>>();

    /** @internal */
    readonly collections = new Memo<E, ConditionAssertions.Collection<E>>();

    /** @internal */
    readonly reaching = new Memo<E, readonly E[]>();

    /** @internal */
    readonly applicationDeviceTypeCounts = new Memo<E, Map<number, number>>();

    /** @internal */
    readonly components = new Memo<E, Map<DeviceTypeModel, Component[]>>();

    /** @internal */
    readonly failures = new Memo<E, Map<RequirementModel, DeviceTypeViolation<E>[]>>();

    /** @internal */
    readonly singletons = new Memo<E, Map<number, Singleton<E>>>();

    /** @internal */
    readonly declarations = new Memo<E, Map<number, Singleton<E>>>();

    /**
     * @param index internal to matter.js
     */
    constructor(facts: DeviceTypeFacts<E>, model: MatterModel = MatterModel.standard, index?: DeviceTypeScopeIndex<E>) {
        this.facts = facts;
        this.model = model;
        this.index = index;
    }

    /**
     * The closest endpoint at or above {@link endpoint} whose device type is classified as a node.
     *
     * @internal
     */
    nodeEndpointOf(endpoint: E) {
        return ConditionAssertions.nodeEndpointOf(endpoint, this);
    }

    /**
     * The node endpoint {@link nodeEndpoint} and its descendants, without a node endpoint below it and its subtree.
     *
     * @internal
     */
    nodeScopeOf(nodeEndpoint: E) {
        return ConditionAssertions.nodeScopeOf(nodeEndpoint, this);
    }

    /**
     * The parts of {@link endpoint} that are {@link DeviceTypeFacts.isPresent present}.
     *
     * @internal
     */
    childrenOf(endpoint: E) {
        return ResolvedEndpoint.of(endpoint, this).children;
    }

    /**
     * @internal
     */
    isNodeEndpoint(endpoint: E) {
        return ResolvedEndpoint.of(endpoint, this).isNodeEndpoint;
    }

    /**
     * Whether the Base `Duplicate` condition holds for {@link endpoint}.
     *
     * @internal
     */
    isDuplicate(endpoint: E) {
        return ConditionAssertions.isDuplicate(endpoint, this);
    }

    /**
     * Whether a device type of {@link endpoint} states a condition requirement located at the node endpoint.
     *
     * @internal
     */
    assertsOnNodeEndpoint(endpoint: E) {
        return ConditionAssertions.assertsOnNodeEndpoint(endpoint, this);
    }

    /**
     * How far beyond its own subtree, its ancestors and its siblings the facts of {@link endpoint} enter the judgement
     * of other endpoints of its node scope.
     *
     * @internal
     */
    reachOf(endpoint: E): DeviceTypeValidationPass.Reach {
        if (
            ConditionAssertions.reachesNodeScope(endpoint, this) ||
            ConditionAssertions.declaresSingleton(endpoint, this)
        ) {
            return DeviceTypeValidationPass.Reach.NodeScope;
        }
        return ConditionAssertions.assertsOnNodeEndpoint(endpoint, this)
            ? DeviceTypeValidationPass.Reach.NodeEndpoint
            : DeviceTypeValidationPass.Reach.None;
    }

    /**
     * The endpoints of the node scope of {@link nodeEndpoint} whose {@link reachOf reach} is not `None`, in tree order,
     * and the node endpoints below it that bound the scope.
     *
     * @internal
     */
    scanReaching(nodeEndpoint: E) {
        return ConditionAssertions.scanReaching(nodeEndpoint, this);
    }

    /**
     * Whether {@link endpoint} is in the node scope of {@link nodeEndpoint}, as {@link nodeScopeOf} lists it.
     *
     * @internal
     */
    isInScope(endpoint: E, nodeEndpoint: E) {
        return ConditionAssertions.isInScope(endpoint, nodeEndpoint, this);
    }

    /**
     * The endpoints other than {@link nodeEndpoint} whose verdict can depend on the conditions of
     * {@link nodeEndpoint}.
     *
     * @internal
     */
    nodeConditionReadersOf(nodeEndpoint: E) {
        return DeviceTypeConformance.nodeConditionReadersOf(nodeEndpoint, this);
    }
}

export namespace DeviceTypeValidationPass {
    /**
     * How far beyond its own subtree, its ancestors and its siblings an endpoint's facts enter the judgement of other
     * endpoints of its node scope. Ordered, so the wider of two is the greater.
     *
     * @internal
     */
    export enum Reach {
        None,

        /**
         * The node endpoint and its condition readers, through a condition the endpoint asserts on the node endpoint.
         */
        NodeEndpoint,

        /**
         * Every endpoint of the node scope, through a network interface or a singleton declaration.
         */
        NodeScope,
    }
}
