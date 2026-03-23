/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { NodeId } from "../datatype/NodeId.js";
import { GroupId } from "../datatype/GroupId.js";
import { EndpointNumber } from "../datatype/EndpointNumber.js";
import { ClusterId } from "../datatype/ClusterId.js";
import { FabricIndex } from "../datatype/FabricIndex.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { Binding as BindingModel } from "@matter/model";

/**
 * Definitions for the Binding cluster.
 */
export namespace Binding {
    /**
     * {@link Binding} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Each entry shall represent a binding.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.6.6.1
             */
            binding: Target[];
        }
    }

    /**
     * Attributes that may appear in {@link Binding}.
     */
    export interface Attributes {
        /**
         * Each entry shall represent a binding.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.6.1
         */
        binding: Target[];
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.6.5.1
     */
    export interface Target {
        /**
         * This field is the remote target node ID. If the Endpoint field is present, this field shall be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.1
         */
        node?: NodeId;

        /**
         * This field is the target group ID that represents remote endpoints. If the Endpoint field is present, this
         * field shall NOT be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.2
         */
        group?: GroupId;

        /**
         * This field is the remote endpoint that the local endpoint is bound to. If the Group field is present, this
         * field shall NOT be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.3
         */
        endpoint?: EndpointNumber;

        /**
         * This field is the cluster ID (client & server) on the local and target endpoint(s). If this field is present,
         * the client cluster shall also exist on this endpoint (with this Binding cluster). If this field is present,
         * the target shall be this cluster on the target endpoint(s).
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.4
         */
        cluster?: ClusterId;

        fabricIndex: FabricIndex;
    }

    export const id = ClusterId(0x1e);
    export const name = "Binding" as const;
    export const revision = 1;
    export const schema = BindingModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof Binding;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `Binding` instead of `Binding.Complete`)
     */
    export type Complete = typeof Binding;

    export declare const Complete: Complete;
    export declare const Typing: Binding;
}

ClusterNamespace.define(Binding);
export type BindingCluster = Binding.Cluster;
export const BindingCluster = Binding.Cluster;
export interface Binding extends ClusterTyping { Attributes: Binding.Attributes; Components: Binding.Components }
