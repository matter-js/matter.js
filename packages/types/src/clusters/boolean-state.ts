/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalEvent } from "../cluster/Cluster.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { Identity } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { BooleanState as BooleanStateModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the BooleanState cluster.
 */
export namespace BooleanState {
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
        stateValue: boolean;
    }

    export namespace Attributes {
        export type Components = [{ flags: {}, mandatory: "stateValue" }];
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

    export namespace Events {
        export type Components = [{ flags: {}, optional: "stateChange" }];
    }

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

    /**
     * Body of the BooleanState stateChange event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
     */
    export const TlvStateChangeEvent = TlvObject({
        /**
         * This field shall indicate the new value of the StateValue attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1.1
         */
        stateValue: TlvField(0, TlvBoolean)
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x45,
        name: "BooleanState",
        revision: 1,

        attributes: {
            /**
             * This represents a boolean state.
             *
             * The semantics of this boolean state are defined by the device type using this cluster. For example, in a
             * Contact Sensor device type, FALSE=open or no contact, TRUE=closed or contact.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.7.4.1
             */
            stateValue: Attribute(0x0, TlvBoolean)
        },

        events: {
            /**
             * If this event is supported, it shall be generated when the StateValue attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
             */
            stateChange: OptionalEvent(0x0, Priority.Info, TlvStateChangeEvent)
        }
    });

    /**
     * This cluster provides an interface to a boolean state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x45);
    export const name = "BooleanState" as const;
    export const revision = 1;
    export const schema = BooleanStateModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const Typing: BooleanState;
}

export type BooleanStateCluster = BooleanState.Cluster;
export const BooleanStateCluster = BooleanState.Cluster;
ClusterNamespace.define(BooleanState);
export interface BooleanState extends ClusterTyping { Attributes: BooleanState.Attributes & { Components: BooleanState.Attributes.Components }; Events: BooleanState.Events & { Components: BooleanState.Events.Components } }
