/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { NodeId } from "../datatype/NodeId.js";
import type { FabricIndex } from "../datatype/FabricIndex.js";

/**
 * Definitions for the PowerTopology cluster.
 *
 * The Power Topology Cluster provides a mechanism for expressing how power is flowing between endpoints.
 *
 * @see {@link MatterSpecification.v151.Core} § 11.8
 */
export declare namespace PowerTopology {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x009c;

    /**
     * Textual cluster identifier.
     */
    export const name: "PowerTopology";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the PowerTopology cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link PowerTopology} supports these elements if it supports feature "SetTopology".
     */
    export interface SetTopologyAttributes {
        /**
         * Indicates the list of endpoints capable of providing power to and/or consuming power from the endpoint
         * hosting this server.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.6.1
         */
        availableEndpoints: EndpointNumber[];
    }

    /**
     * {@link PowerTopology} supports these elements if it supports feature "DynamicPowerFlow".
     */
    export interface DynamicPowerFlowAttributes {
        /**
         * Indicates the current list of endpoints currently providing or consuming power to or from the endpoint
         * hosting this server. This list shall be a subset of the value of the AvailableEndpoints attribute.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.6.2
         */
        activeEndpoints: EndpointNumber[];
    }

    /**
     * Attributes that may appear in {@link PowerTopology}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the list of endpoints capable of providing power to and/or consuming power from the endpoint
         * hosting this server.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.6.1
         */
        availableEndpoints: EndpointNumber[];

        /**
         * Indicates the current list of endpoints currently providing or consuming power to or from the endpoint
         * hosting this server. This list shall be a subset of the value of the AvailableEndpoints attribute.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.6.2
         */
        activeEndpoints: EndpointNumber[];
    }

    export type Components = [
        { flags: { setTopology: true }, attributes: SetTopologyAttributes },
        { flags: { dynamicPowerFlow: true }, attributes: DynamicPowerFlowAttributes }
    ];
    export type Features = "NodeTopology" | "TreeTopology" | "SetTopology" | "DynamicPowerFlow";

    /**
     * These are optional features supported by PowerTopologyCluster.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.8.4
     */
    export enum Feature {
        /**
         * NodeTopology (NODE)
         *
         * This endpoint provides or consumes power to/from the entire node
         */
        NodeTopology = "NodeTopology",

        /**
         * TreeTopology (TREE)
         *
         * This endpoint provides or consumes power to/from itself and its child endpoints
         */
        TreeTopology = "TreeTopology",

        /**
         * SetTopology (SET)
         *
         * This endpoint provides or consumes power to/from a specified set of endpoints
         */
        SetTopology = "SetTopology",

        /**
         * DynamicPowerFlow (DYPF)
         *
         * The specified set of endpoints may change
         */
        DynamicPowerFlow = "DynamicPowerFlow"
    }

    /**
     * This indicates a device on the circuit represented by this server.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.8.5.1
     */
    export declare class CircuitNode {
        constructor(values?: Partial<CircuitNode>);

        /**
         * This field shall indicate the ID of a node which is on the electrical circuit represented by this server.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.5.1.1
         */
        node: NodeId;

        /**
         * This field shall indicate the endpoint ID of the indicated node which is on the electrical circuit
         * represented by this server.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.5.1.2
         */
        endpoint?: EndpointNumber;

        /**
         * This field shall indicate a friendly name for the node, to be used when the client does not have access to
         * the node's fabric.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.8.5.1.3
         */
        label?: string;

        fabricIndex: FabricIndex;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link PowerTopology}.
     */
    export const Cluster: typeof PowerTopology;

    /**
     * @deprecated Use {@link PowerTopology}.
     */
    export const Complete: typeof PowerTopology;

    export const Typing: PowerTopology;
}

/**
 * @deprecated Use {@link PowerTopology}.
 */
export declare const PowerTopologyCluster: typeof PowerTopology;

export interface PowerTopology extends ClusterTyping {
    Attributes: PowerTopology.Attributes;
    Features: PowerTopology.Features;
    Components: PowerTopology.Components;
}
