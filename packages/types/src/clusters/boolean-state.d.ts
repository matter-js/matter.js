/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the BooleanState cluster.
 *
 * This cluster provides an interface to a boolean state.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.7
 */
export declare namespace BooleanState {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0045;

    /**
     * Textual cluster identifier.
     */
    export const name: "BooleanState";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the BooleanState cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link BooleanState} always supports these elements.
     */
    export interface BaseAttributes {
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

    /**
     * {@link BooleanState} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * If this event is supported, it shall be generated when the StateValue attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
         */
        stateChange?: StateChangeEvent;
    }

    /**
     * Events that may appear in {@link BooleanState}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Events {
        /**
         * If this event is supported, it shall be generated when the StateValue attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.7.5.1
         */
        stateChange: StateChangeEvent;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes, events: BaseEvents }];

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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterNamespace.EventObjects<Events>;

    /**
     * @deprecated Use {@link BooleanState}.
     */
    export const Cluster: typeof BooleanState;

    /**
     * @deprecated Use {@link BooleanState}.
     */
    export const Complete: typeof BooleanState;

    export const Typing: BooleanState;
}

/**
 * @deprecated Use {@link BooleanState}.
 */
export declare const BooleanStateCluster: typeof BooleanState;

export interface BooleanState extends ClusterTyping {
    Attributes: BooleanState.Attributes;
    Events: BooleanState.Events;
    Components: BooleanState.Components;
}
