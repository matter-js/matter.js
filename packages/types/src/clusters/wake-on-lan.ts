/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Bytes } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { WakeOnLan as WakeOnLanModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the WakeOnLan cluster.
 */
export namespace WakeOnLan {
    /**
     * {@link WakeOnLan} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the current MAC address of the device. Only 48-bit MAC Addresses shall be used for this
             * attribute as required by the Wake on LAN protocol.
             *
             * Format of this attribute shall be an upper-case hex-encoded string representing the hex address, like
             * 12345678ABCD.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.12.4.1
             */
            readonly macAddress?: string;

            /**
             * Indicates the current link-local address of the device. Only 128-bit IPv6 link-local addresses shall be
             * used for this attribute.
             *
             * > [!NOTE]
             *
             * > Some companies may consider MAC Address to be protected data subject to PII handling considerations and
             *   will therefore choose not to include it or read it. The MAC Address can often be determined using ARP
             *   in IPv4 or NDP in IPv6.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.12.4.2
             */
            readonly linkLocalAddress?: Bytes;
        }
    }

    /**
     * Attributes that may appear in {@link WakeOnLan}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * Indicates the current MAC address of the device. Only 48-bit MAC Addresses shall be used for this attribute
         * as required by the Wake on LAN protocol.
         *
         * Format of this attribute shall be an upper-case hex-encoded string representing the hex address, like
         * 12345678ABCD.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.12.4.1
         */
        readonly macAddress: string;

        /**
         * Indicates the current link-local address of the device. Only 128-bit IPv6 link-local addresses shall be used
         * for this attribute.
         *
         * > [!NOTE]
         *
         * > Some companies may consider MAC Address to be protected data subject to PII handling considerations and
         *   will therefore choose not to include it or read it. The MAC Address can often be determined using ARP in
         *   IPv4 or NDP in IPv6.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.12.4.2
         */
        readonly linkLocalAddress: Bytes;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id = ClusterId(0x503);
    export const name = "WakeOnLan" as const;
    export const revision = 1;
    export const schema = WakeOnLanModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof WakeOnLan;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `WakeOnLan` instead of `WakeOnLan.Complete`)
     */
    export type Complete = typeof WakeOnLan;

    export declare const Complete: Complete;
    export declare const Typing: WakeOnLan;
}

ClusterNamespace.define(WakeOnLan);
export type WakeOnLanCluster = WakeOnLan.Cluster;
export const WakeOnLanCluster = WakeOnLan.Cluster;
export interface WakeOnLan extends ClusterTyping { Attributes: WakeOnLan.Attributes; Components: WakeOnLan.Components }
