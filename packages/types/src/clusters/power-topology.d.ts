/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { PowerTopology as PowerTopologyModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the PowerTopology cluster.
 */
export declare namespace PowerTopology {
    /**
     * {@link PowerTopology} supports these elements if it supports feature "SetTopology".
     */
    export namespace SetTopologyComponent {
        export interface Attributes {
            /**
             * Indicates the list of endpoints capable of providing power to and/or consuming power from the endpoint
             * hosting this server.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.8.5.1
             */
            readonly availableEndpoints: EndpointNumber[];
        }
    }

    /**
     * {@link PowerTopology} supports these elements if it supports feature "DynamicPowerFlow".
     */
    export namespace DynamicPowerFlowComponent {
        export interface Attributes {
            /**
             * Indicates the current list of endpoints currently providing or consuming power to or from the endpoint
             * hosting this server. This list shall be a subset of the value of the AvailableEndpoints attribute.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.8.5.2
             */
            readonly activeEndpoints: EndpointNumber[];
        }
    }

    export interface Attributes extends Partial<SetTopologyComponent.Attributes>, Partial<DynamicPowerFlowComponent.Attributes> {}
    export type Components = [
        { flags: { setTopology: true }, attributes: SetTopologyComponent.Attributes },
        { flags: { dynamicPowerFlow: true }, attributes: DynamicPowerFlowComponent.Attributes }
    ];
    export type Features = "NodeTopology" | "TreeTopology" | "SetTopology" | "DynamicPowerFlow";

    /**
     * These are optional features supported by PowerTopologyCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.8.4
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

    export const id: ClusterId;
    export const name: "PowerTopology";
    export const revision: 1;
    export const schema: typeof PowerTopologyModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof PowerTopology;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `PowerTopology` instead of `PowerTopology.Complete`)
     */
    export const Complete: typeof PowerTopology;

    export const Typing: PowerTopology;
}

export declare const PowerTopologyCluster: typeof PowerTopology;
export interface PowerTopology extends ClusterTyping { Attributes: PowerTopology.Attributes; Features: PowerTopology.Features; Components: PowerTopology.Components }
