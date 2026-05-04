/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { PowerThreshold } from "../globals/PowerThreshold.js";

/**
 * Definitions for the MeterIdentification cluster.
 *
 * This Meter Identification Cluster provides attributes for determining advanced information about utility metering
 * device.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 9.10
 */
export declare namespace MeterIdentification {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0b06;

    /**
     * Textual cluster identifier.
     */
    export const name: "MeterIdentification";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the MeterIdentification cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link MeterIdentification} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the Meter type features, decided by manufacturer. If the type is unavailable, this attribute shall
         * be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.1
         */
        meterType: MeterType | null;

        /**
         * Indicates the unique identification of the connection point for the premises for billing purposes. If the
         * point of delivery is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.2
         */
        pointOfDelivery: string | null;

        /**
         * Indicates the serial number of the meter. If the serial number is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.3
         */
        meterSerialNumber: string | null;

        /**
         * Indicates the underlying protocol version to express local market features. If the protocol version is
         * unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.4
         */
        protocolVersion?: string | null;
    }

    /**
     * {@link MeterIdentification} supports these elements if it supports feature "PowerThreshold".
     */
    export interface PowerThresholdAttributes {
        /**
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6
         */
        powerThreshold: PowerThreshold | null;
    }

    /**
     * Attributes that may appear in {@link MeterIdentification}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the Meter type features, decided by manufacturer. If the type is unavailable, this attribute shall
         * be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.1
         */
        meterType: MeterType | null;

        /**
         * Indicates the unique identification of the connection point for the premises for billing purposes. If the
         * point of delivery is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.2
         */
        pointOfDelivery: string | null;

        /**
         * Indicates the serial number of the meter. If the serial number is unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.3
         */
        meterSerialNumber: string | null;

        /**
         * Indicates the underlying protocol version to express local market features. If the protocol version is
         * unavailable, this attribute shall be null.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6.4
         */
        protocolVersion: string | null;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 9.10.6
         */
        powerThreshold: PowerThreshold | null;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { powerThreshold: true }, attributes: PowerThresholdAttributes }
    ];
    export type Features = "PowerThreshold";

    /**
     * These are optional features supported by MeterIdentificationCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.10.4
     */
    export enum Feature {
        /**
         * PowerThreshold (PWRTHLD)
         *
         * Supports information about power threshold
         */
        PowerThreshold = "PowerThreshold"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 9.10.5.1
     */
    export enum MeterType {
        /**
         * Utility Meter
         */
        Utility = 0,

        /**
         * Private Meter
         */
        Private = 1,

        /**
         * Generic Meter
         */
        Generic = 2
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link MeterIdentification}.
     */
    export const Cluster: ClusterType.WithCompat<typeof MeterIdentification, MeterIdentification>;

    /**
     * @deprecated Use {@link MeterIdentification}.
     */
    export const Complete: typeof MeterIdentification;

    export const Typing: MeterIdentification;
}

/**
 * @deprecated Use {@link MeterIdentification}.
 */
export declare const MeterIdentificationCluster: typeof MeterIdentification;

export interface MeterIdentification extends ClusterTyping {
    Attributes: MeterIdentification.Attributes;
    Features: MeterIdentification.Features;
    Components: MeterIdentification.Components;
}
