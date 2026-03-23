/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { BooleanState as BooleanStateModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the BooleanState cluster.
 */
export namespace BooleanState {
    /**
     * {@link BooleanState} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This represents a boolean state.
             *
             * The semantics of this boolean state are defined by the device type using this cluster. For example, in a
             * Contact Sensor device type, FALSE=open or no contact, TRUE=closed or contact.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.7.4.1
             */
            readonly stateValue: boolean;
        }

        export interface Events {
            /**
             * If this event is supported, it shall be generated when the StateValue attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
             */
            stateChange?: StateChangeEvent;
        }
    }

    /**
     * Attributes that may appear in {@link BooleanState}.
     */
    export interface Attributes {
        /**
         * This represents a boolean state.
         *
         * The semantics of this boolean state are defined by the device type using this cluster. For example, in a
         * Contact Sensor device type, FALSE=open or no contact, TRUE=closed or contact.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.7.4.1
         */
        readonly stateValue: boolean;
    }

    /**
     * Events that may appear in {@link BooleanState}.
     *
     * Devices may not support all of these events.
     */
    export interface Events {
        /**
         * If this event is supported, it shall be generated when the StateValue attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
         */
        stateChange: StateChangeEvent;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes, events: Base.Events }];

    /**
     * If this event is supported, it shall be generated when the StateValue attribute changes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
     */
    export interface StateChangeEvent {
        /**
         * This field shall indicate the new value of the StateValue attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1.1
         */
        stateValue: boolean;
    }

    export const id = ClusterId(0x45);
    export const name = "BooleanState" as const;
    export const revision = 1;
    export const schema = BooleanStateModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export type Cluster = typeof BooleanState;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `BooleanState` instead of `BooleanState.Complete`)
     */
    export type Complete = typeof BooleanState;

    export declare const Complete: Complete;
    export declare const Typing: BooleanState;
}

ClusterNamespace.define(BooleanState);
export type BooleanStateCluster = BooleanState.Cluster;
export const BooleanStateCluster = BooleanState.Cluster;
export interface BooleanState extends ClusterTyping { Attributes: BooleanState.Attributes; Events: BooleanState.Events; Components: BooleanState.Components }
