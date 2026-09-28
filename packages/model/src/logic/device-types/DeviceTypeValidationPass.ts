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
import type { ReachingEndpoints } from "./ReachingEndpoints.js";
import { ResolvedEndpoint } from "./ResolvedEndpoint.js";

/**
 * One run of device type validation over endpoints that {@link facts} describes, resolved in {@link model}.
 *
 * The checks of a pass share what several endpoints read from the tree: the facts of each endpoint, the conditions of
 * each node scope and the composition facts of each composing endpoint.
 *
 * A pass must not outlive one synchronous run: the tree may change between runs, and nothing a pass keeps of it is
 * invalidated. Lookups that read only {@link model}, such as the cluster a requirement names, are shared by every pass
 * resolved in the same model instance, so mutating a model after it has validated an endpoint is unsupported. Build a
 * new model instead, e.g. with {@link MatterModel.withClusters}.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2
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
    readonly reaching = new Memo<E, ReachingEndpoints<E>>();

    /** @internal */
    readonly applicationDeviceTypeCounts = new Memo<E, Map<number, number>>();

    /** @internal */
    readonly components = new Memo<E, Map<DeviceTypeModel, Component[]>>();

    /** @internal */
    readonly failures = new Memo<E, Map<RequirementModel, DeviceTypeViolation[]>>();

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

    /**
     * Whether {@link endpoint} may be one of the {@link nodeConditionReadersOf condition readers} of
     * {@link nodeEndpoint}.
     *
     * @internal
     */
    mayReadNodeConditions(endpoint: E, nodeEndpoint: E) {
        return DeviceTypeConformance.mayReadNodeConditions(endpoint, nodeEndpoint, this);
    }

    /**
     * The conditions true for {@link nodeEndpoint}, a node endpoint.
     *
     * @internal
     */
    nodeEndpointConditionsOf(nodeEndpoint: E): ReadonlySet<string> {
        return ConditionAssertions.collect(nodeEndpoint, this).conditionsOf(nodeEndpoint);
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
