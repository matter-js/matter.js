/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalEvent } from "../cluster/Cluster.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace BooleanState {
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
     * Body of the BooleanState stateChange event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
     */
    export interface StateChangeEvent extends TypeFromSchema<typeof TlvStateChangeEvent> {}

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
             * The semantics of this boolean state are defined by the device type using this cluster.
             *
             * For example, in a Contact Sensor device type, FALSE=open or no contact, TRUE=closed or contact.
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
}

export type BooleanStateCluster = BooleanState.Cluster;
export const BooleanStateCluster = BooleanState.Cluster;
ClusterRegistry.register(BooleanState.Complete);
