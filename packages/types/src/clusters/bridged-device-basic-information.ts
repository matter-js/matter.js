/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { VendorId } from "../datatype/VendorId.js";
import { BasicInformation } from "./basic-information.js";
import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { BridgedDeviceBasicInformation as BridgedDeviceBasicInformationModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the BridgedDeviceBasicInformation cluster.
 */
export namespace BridgedDeviceBasicInformation {
    /**
     * {@link BridgedDeviceBasicInformation} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall be used to indicate whether the bridged device is reachable by the bridge, so a
             * Matter Node which wants to communicate with a bridged device can get an indication that this might fail
             * (when the attribute is False). Determination of reachability might not be perfect (e.g. depending on
             * technology employed), so the Matter Node SHOULD be aware of the risk of false positives and negatives on
             * reachability determination. For example, a bridged device may be marked as unreachable while it could
             * actually be reached, and vice-versa. Also, detection (and indication) that a bridged device is not longer
             * reachable may be delayed due to the technique employed (e.g. detecting that a number of expected messages
             * from the bridged device did not arrive). Also see event ReachableChanged below.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.5.2
             */
            readonly reachable: boolean;

            /**
             * This attribute shall, for a Bridged Device, be updated when the Bridge is factory reset. If the bridged
             * device does not provide some unique id (e.g. in the case of bridging from non-Matter devices, or in case
             * of bridging Matter devices from an earlier revision which were not required to provide a UniqueID
             * attribute), the bridge shall generate a unique id on behalf of the bridged device.
             *
             * > [!NOTE]
             *
             * > The UniqueID attribute was optional in cluster revisions prior to revision 4.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.5.3
             */
            readonly uniqueId: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly vendorName?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly vendorId?: VendorId;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly productName?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly productId?: number;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            nodeLabel?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly hardwareVersion?: number;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly hardwareVersionString?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly softwareVersion?: number;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly softwareVersionString?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly manufacturingDate?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly partNumber?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly productUrl?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly productLabel?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly serialNumber?: string;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            readonly productAppearance?: BasicInformation.ProductAppearance;

            /**
             * This attribute shall contain the current version number for the configuration of the bridged device.
             *
             * If the bridge detects a change on a bridged device, which it deems as a change in the configuration of
             * the bridged device, it shall increase this attribute as described in Section 9.2.9, “Node Configuration
             * Changes”.
             *
             * The ability and the method used to detect such a change on a bridged device is manufacturer specific.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.5.4
             */
            readonly configurationVersion?: number;
        }

        export interface Events {
            /**
             * This event shall be generated when there is a change in the Reachable attribute. Its purpose is to
             * provide an indication towards interested parties that the reachability of a bridged device has changed
             * over its native connectivity technology, so they may take appropriate action. After (re)start of a bridge
             * this event may be generated.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.7.2
             */
            reachableChanged: ReachableChangedEvent;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.7
             */
            startUp?: StartUpEvent;

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.7
             */
            shutDown?: void;

            /**
             * The Leave event SHOULD be generated by the bridge when it detects that the associated device has left the
             * non-Matter network.
             *
             * > [!NOTE]
             *
             * > The FabricIndex field has the X conformance, indicating it shall NOT be present. This event, in the
             *   context of Bridged Device Basic Information cluster, has no usable fields, but the original Basic
             *   Information cluster’s field definition is kept for completeness.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.7.1
             */
            leave?: void;
        }
    }

    /**
     * {@link BridgedDeviceBasicInformation} supports these elements if it supports feature "BridgedIcdSupport".
     */
    export namespace BridgedIcdSupportComponent {
        export interface Commands {
            /**
             * Upon receipt, the server shall attempt to keep the bridged device active for the duration specified by
             * the command, when the device is next active.
             *
             * The implementation of this is best-effort since it may interact with non-native protocols. However,
             * several specific protocol requirements are:
             *
             *   - If the bridged device is a Matter Intermittently Connected Device, then the server shall send a
             *     StayActiveRequest command with the StayActiveDuration field set to value of the StayActiveDuration
             *     field in the received command to the bridged device when the bridged device next sends a checks-in
             *     message or subscription report. See Intermittently Connected Devices Behavior for details on ICD
             *     state management.
             *
             * When the bridge detects that the bridged device goes into an active state, an ActiveChanged event shall
             * be generated.
             *
             * In order to avoid unnecessary power consumption in the bridged device:
             *
             *   - The server shall enter a "pending active" state for the associated device when the KeepActive command
             *     is received. The server "pending active" state shall expire after the amount of time defined by the
             *     TimeoutMs field, in milliseconds, if no subsequent KeepActive command is received. When a KeepActive
             *     command is received, the "pending active" state is set, the StayActiveDuration is updated to the
             *     greater of the new value and the previously stored value, and the TimeoutMs is updated to the greater
             *     of the new value and the remaining time until the prior "pending active" state expires.
             *
             *   - The server shall only keep the bridged device active once for a request. (The server shall only
             *     consider the operation performed if an associated ActiveChanged event was generated.)
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.6.1
             */
            keepActive(request: KeepActiveRequest): MaybePromise;
        }

        export interface Events {
            /**
             * This event (when supported) shall be generated the next time a bridged device becomes active after a
             * KeepActive command is received. See KeepActive for more details.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.7.3
             */
            activeChanged: ActiveChangedEvent;
        }
    }

    /**
     * Attributes that may appear in {@link BridgedDeviceBasicInformation}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall be used to indicate whether the bridged device is reachable by the bridge, so a Matter
         * Node which wants to communicate with a bridged device can get an indication that this might fail (when the
         * attribute is False). Determination of reachability might not be perfect (e.g. depending on technology
         * employed), so the Matter Node SHOULD be aware of the risk of false positives and negatives on reachability
         * determination. For example, a bridged device may be marked as unreachable while it could actually be reached,
         * and vice-versa. Also, detection (and indication) that a bridged device is not longer reachable may be delayed
         * due to the technique employed (e.g. detecting that a number of expected messages from the bridged device did
         * not arrive). Also see event ReachableChanged below.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.5.2
         */
        readonly reachable: boolean;

        /**
         * This attribute shall, for a Bridged Device, be updated when the Bridge is factory reset. If the bridged
         * device does not provide some unique id (e.g. in the case of bridging from non-Matter devices, or in case of
         * bridging Matter devices from an earlier revision which were not required to provide a UniqueID attribute),
         * the bridge shall generate a unique id on behalf of the bridged device.
         *
         * > [!NOTE]
         *
         * > The UniqueID attribute was optional in cluster revisions prior to revision 4.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.5.3
         */
        readonly uniqueId: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly vendorName: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly vendorId: VendorId;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly productName: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly productId: number;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        nodeLabel: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly hardwareVersion: number;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly hardwareVersionString: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly softwareVersion: number;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly softwareVersionString: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly manufacturingDate: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly partNumber: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly productUrl: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly productLabel: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly serialNumber: string;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.5
         */
        readonly productAppearance: BasicInformation.ProductAppearance;

        /**
         * This attribute shall contain the current version number for the configuration of the bridged device.
         *
         * If the bridge detects a change on a bridged device, which it deems as a change in the configuration of the
         * bridged device, it shall increase this attribute as described in Section 9.2.9, “Node Configuration Changes”.
         *
         * The ability and the method used to detect such a change on a bridged device is manufacturer specific.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.5.4
         */
        readonly configurationVersion: number;
    }

    export interface Commands extends BridgedIcdSupportComponent.Commands {}

    /**
     * Events that may appear in {@link BridgedDeviceBasicInformation}.
     *
     * Devices may not support all of these events. Device support for events may also be affected by a device's
     * supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when there is a change in the Reachable attribute. Its purpose is to provide an
         * indication towards interested parties that the reachability of a bridged device has changed over its native
         * connectivity technology, so they may take appropriate action. After (re)start of a bridge this event may be
         * generated.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.7.2
         */
        reachableChanged: ReachableChangedEvent;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.7
         */
        startUp: StartUpEvent;

        /**
         * @see {@link MatterSpecification.v142.Core} § 9.13.7
         */
        shutDown: void;

        /**
         * The Leave event SHOULD be generated by the bridge when it detects that the associated device has left the
         * non-Matter network.
         *
         * > [!NOTE]
         *
         * > The FabricIndex field has the X conformance, indicating it shall NOT be present. This event, in the context
         *   of Bridged Device Basic Information cluster, has no usable fields, but the original Basic Information
         *   cluster’s field definition is kept for completeness.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.7.1
         */
        leave: void;

        /**
         * This event (when supported) shall be generated the next time a bridged device becomes active after a
         * KeepActive command is received. See KeepActive for more details.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.7.3
         */
        activeChanged: ActiveChangedEvent;
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        {
            flags: { bridgedIcdSupport: true },
            commands: BridgedIcdSupportComponent.Commands,
            events: BridgedIcdSupportComponent.Events
        }
    ];

    export type Features = "BridgedIcdSupport";

    /**
     * These are optional features supported by BridgedDeviceBasicInformationCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.4
     */
    export enum Feature {
        /**
         * BridgedIcdSupport (BIS)
         *
         * Support bridged ICDs.
         */
        BridgedIcdSupport = "BridgedIcdSupport"
    }

    /**
     * This event shall be generated when there is a change in the Reachable attribute. Its purpose is to provide an
     * indication towards interested parties that the reachability of a bridged device has changed over its native
     * connectivity technology, so they may take appropriate action. After (re)start of a bridge this event may be
     * generated.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7.2
     */
    export interface ReachableChangedEvent {
        /**
         * This field shall indicate the value of the Reachable attribute after it was changed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.1.6.4.1
         */
        reachableNewValue: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.13.7
     */
    export interface StartUpEvent {
        /**
         * This field shall be set to the same value as the one available in the SoftwareVersion attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.1.6.1.1
         */
        softwareVersion: number;
    }

    /**
     * Upon receipt, the server shall attempt to keep the bridged device active for the duration specified by the
     * command, when the device is next active.
     *
     * The implementation of this is best-effort since it may interact with non-native protocols. However, several
     * specific protocol requirements are:
     *
     *   - If the bridged device is a Matter Intermittently Connected Device, then the server shall send a
     *     StayActiveRequest command with the StayActiveDuration field set to value of the StayActiveDuration field in
     *     the received command to the bridged device when the bridged device next sends a checks-in message or
     *     subscription report. See Intermittently Connected Devices Behavior for details on ICD state management.
     *
     * When the bridge detects that the bridged device goes into an active state, an ActiveChanged event shall be
     * generated.
     *
     * In order to avoid unnecessary power consumption in the bridged device:
     *
     *   - The server shall enter a "pending active" state for the associated device when the KeepActive command is
     *     received. The server "pending active" state shall expire after the amount of time defined by the TimeoutMs
     *     field, in milliseconds, if no subsequent KeepActive command is received. When a KeepActive command is
     *     received, the "pending active" state is set, the StayActiveDuration is updated to the greater of the new
     *     value and the previously stored value, and the TimeoutMs is updated to the greater of the new value and the
     *     remaining time until the prior "pending active" state expires.
     *
     *   - The server shall only keep the bridged device active once for a request. (The server shall only consider the
     *     operation performed if an associated ActiveChanged event was generated.)
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.6.1
     */
    export interface KeepActiveRequest {
        /**
         * This field shall indicate the duration, in milliseconds, that the device is requested to remain active, once
         * the device becomes active again.
         *
         * The value of this field may be longer than the value supported by the bridged device and would, typically, be
         * used by the client to request the server of the bridged device to stay active and responsive for this period
         * to allow a sequence of message exchanges during that period.
         *
         * The client may slightly overestimate the duration it wants the bridged device to be active for, in order to
         * account for network delays.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.6.1.1
         */
        stayActiveDuration: number;

        /**
         * This field shall indicate the period, in milliseconds, that the server will wait before the "pending active"
         * state expires. See the KeepActive Command description for details.
         *
         * > [!NOTE]
         *
         * > TimeoutMs is a timeout for the request, NOT the time the device will be awake for. The server will wait for
         *   up to TimeoutMs for the device. If after TimeoutMs the ICD device does NOT check-in, the server will not
         *   perform any actions.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.6.1.2
         */
        timeoutMs: number;
    }

    /**
     * This event (when supported) shall be generated the next time a bridged device becomes active after a KeepActive
     * command is received. See KeepActive for more details.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7.3
     */
    export interface ActiveChangedEvent {
        /**
         * This field shall indicate the minimum duration, in milliseconds, that the bridged device will remain active
         * after receiving the initial request from the KeepActive processing steps.
         *
         * If the bridged device is a Matter Intermittently Connected Device, PromisedActiveDuration shall be set to the
         * PromisedActiveDuration value returned in the StayActiveResponse command.
         *
         * If the bridged device is not a Matter Intermittently Connected Device, the implementation of this is
         * best-effort since it may interact with non-native protocol.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.13.7.3.1
         */
        promisedActiveDuration: number;
    }

    export const id = ClusterId(0x39);
    export const name = "BridgedDeviceBasicInformation" as const;
    export const revision = 5;
    export const schema = BridgedDeviceBasicInformationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof BridgedDeviceBasicInformation;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `BridgedDeviceBasicInformation` instead of
     * `BridgedDeviceBasicInformation.Complete`)
     */
    export type Complete = typeof BridgedDeviceBasicInformation;

    export declare const Complete: Complete;
    export declare const Typing: BridgedDeviceBasicInformation;
}

ClusterNamespace.define(BridgedDeviceBasicInformation);
export type BridgedDeviceBasicInformationCluster = BridgedDeviceBasicInformation.Cluster;
export const BridgedDeviceBasicInformationCluster = BridgedDeviceBasicInformation.Cluster;
export interface BridgedDeviceBasicInformation extends ClusterTyping { Attributes: BridgedDeviceBasicInformation.Attributes; Commands: BridgedDeviceBasicInformation.Commands; Events: BridgedDeviceBasicInformation.Events; Features: BridgedDeviceBasicInformation.Features; Components: BridgedDeviceBasicInformation.Components }
