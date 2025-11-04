/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Command,
    TlvNoResponse,
    Event,
    OptionalFixedAttribute,
    OptionalWritableAttribute,
    Attribute,
    FixedAttribute,
    OptionalAttribute,
    OptionalEvent
} from "../cluster/Cluster.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt32, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { AccessLevel } from "#model";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { BasicInformation } from "./basic-information.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace BridgedDeviceBasicInformation {
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
     * Input to the BridgedDeviceBasicInformation keepActive command
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.6.1
     */
    export const TlvKeepActiveRequest = TlvObject({
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
        stayActiveDuration: TlvField(0, TlvUInt32),

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
        timeoutMs: TlvField(1, TlvUInt32.bound({ min: 30000, max: 3600000 }))
    });

    /**
     * Input to the BridgedDeviceBasicInformation keepActive command
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.6.1
     */
    export interface KeepActiveRequest extends TypeFromSchema<typeof TlvKeepActiveRequest> {}

    /**
     * Body of the BridgedDeviceBasicInformation activeChanged event
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7.3
     */
    export const TlvActiveChangedEvent = TlvObject({
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
        promisedActiveDuration: TlvField(0, TlvUInt32)
    });

    /**
     * Body of the BridgedDeviceBasicInformation activeChanged event
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7.3
     */
    export interface ActiveChangedEvent extends TypeFromSchema<typeof TlvActiveChangedEvent> {}

    /**
     * Body of the BridgedDeviceBasicInformation startUp event
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7
     */
    export const TlvStartUpEvent = TlvObject({
        /**
         * This field shall be set to the same value as the one available in the SoftwareVersion attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.1.6.1.1
         */
        softwareVersion: TlvField(0, TlvUInt32)
    });

    /**
     * Body of the BridgedDeviceBasicInformation startUp event
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7
     */
    export interface StartUpEvent extends TypeFromSchema<typeof TlvStartUpEvent> {}

    /**
     * Body of the BridgedDeviceBasicInformation reachableChanged event
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7.2
     */
    export const TlvReachableChangedEvent = TlvObject({
        /**
         * This field shall indicate the value of the Reachable attribute after it was changed.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.1.6.4.1
         */
        reachableNewValue: TlvField(0, TlvBoolean)
    });

    /**
     * Body of the BridgedDeviceBasicInformation reachableChanged event
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13.7.2
     */
    export interface ReachableChangedEvent extends TypeFromSchema<typeof TlvReachableChangedEvent> {}

    /**
     * A BridgedDeviceBasicInformationCluster supports these elements if it supports feature BridgedIcdSupport.
     */
    export const BridgedIcdSupportComponent = MutableCluster.Component({
        commands: {
            /**
             * Upon receipt, the server shall attempt to keep the bridged device active for the duration specified by
             * the command, when the device is next active.
             *
             * The implementation of this is best-effort since it may interact with non-native protocols. However,
             * several specific protocol requirements are:
             *
             *   • If the bridged device is a Matter Intermittently Connected Device, then the server shall send a
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
             *   • The server shall enter a "pending active" state for the associated device when the KeepActive command
             *     is received. The server "pending active" state shall expire after the amount of time defined by the
             *     TimeoutMs field, in milliseconds, if no subsequent KeepActive command is received. When a KeepActive
             *     command is received, the "pending active" state is set, the StayActiveDuration is updated to the
             *     greater of the new value and the previously stored value, and the TimeoutMs is updated to the greater
             *     of the new value and the remaining time until the prior "pending active" state expires.
             *
             *   • The server shall only keep the bridged device active once for a request. (The server shall only
             *     consider the operation performed if an associated ActiveChanged event was generated.)
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.6.1
             */
            keepActive: Command(0x80, TlvKeepActiveRequest, 0x80, TlvNoResponse)
        },

        events: {
            /**
             * This event (when supported) shall be generated the next time a bridged device becomes active after a
             * KeepActive command is received.
             *
             * See KeepActive for more details.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.7.3
             */
            activeChanged: Event(0x80, Priority.Info, TlvActiveChangedEvent)
        }
    });

    /**
     * These elements and properties are present in all BridgedDeviceBasicInformation clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x39,
        name: "BridgedDeviceBasicInformation",
        revision: 5,

        features: {
            /**
             * Support bridged ICDs.
             */
            bridgedIcdSupport: BitFlag(20)
        },

        attributes: {
            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            vendorName: OptionalFixedAttribute(0x1, TlvString.bound({ maxLength: 32 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            vendorId: OptionalFixedAttribute(0x2, TlvVendorId),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            productName: OptionalFixedAttribute(0x3, TlvString.bound({ maxLength: 32 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            productId: OptionalFixedAttribute(0x4, TlvUInt16),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            nodeLabel: OptionalWritableAttribute(
                0x5,
                TlvString.bound({ maxLength: 32 }),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            hardwareVersion: OptionalFixedAttribute(0x7, TlvUInt16),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            hardwareVersionString: OptionalFixedAttribute(0x8, TlvString.bound({ minLength: 1, maxLength: 64 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            softwareVersion: OptionalFixedAttribute(0x9, TlvUInt32),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            softwareVersionString: OptionalFixedAttribute(0xa, TlvString.bound({ minLength: 1, maxLength: 64 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            manufacturingDate: OptionalFixedAttribute(0xb, TlvString.bound({ minLength: 8, maxLength: 16 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            partNumber: OptionalFixedAttribute(0xc, TlvString.bound({ maxLength: 32 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            productUrl: OptionalFixedAttribute(0xd, TlvString.bound({ maxLength: 256 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            productLabel: OptionalFixedAttribute(0xe, TlvString.bound({ maxLength: 64 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            serialNumber: OptionalFixedAttribute(0xf, TlvString.bound({ maxLength: 32 })),

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
            reachable: Attribute(0x11, TlvBoolean),

            /**
             * This attribute shall, for a Bridged Device, be updated when the Bridge is factory reset. If the bridged
             * device does not provide some unique id (e.g. in the case of bridging from non-Matter devices, or in case
             * of bridging Matter devices from an earlier revision which were not required to provide a UniqueID
             * attribute), the bridge shall generate a unique id on behalf of the bridged device.
             *
             * NOTE The UniqueID attribute was optional in cluster revisions prior to revision 4.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.5.3
             */
            uniqueId: FixedAttribute(0x12, TlvString.bound({ maxLength: 32 })),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.5
             */
            productAppearance: OptionalFixedAttribute(0x14, BasicInformation.TlvProductAppearance),

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
            configurationVersion: OptionalAttribute(0x18, TlvUInt32.bound({ min: 1 }), { persistent: true })
        },

        events: {
            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.7
             */
            startUp: OptionalEvent(0x0, Priority.Critical, TlvStartUpEvent),

            /**
             * @see {@link MatterSpecification.v142.Core} § 9.13.7
             */
            shutDown: OptionalEvent(0x1, Priority.Critical, TlvNoArguments),

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
            leave: OptionalEvent(0x2, Priority.Critical, TlvNoArguments),

            /**
             * This event shall be generated when there is a change in the Reachable attribute. Its purpose is to
             * provide an indication towards interested parties that the reachability of a bridged device has changed
             * over its native connectivity technology, so they may take appropriate action.
             *
             * After (re)start of a bridge this event may be generated.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.13.7.2
             */
            reachableChanged: Event(0x3, Priority.Critical, TlvReachableChangedEvent)
        },

        /**
         * This metadata controls which BridgedDeviceBasicInformationCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { bridgedIcdSupport: true }, component: BridgedIcdSupportComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides attributes and events for determining basic information about Bridged Nodes.
     *
     * This cluster is derived from the Basic Information cluster and serves two purposes towards a Node communicating
     * with a Bridge:
     *
     *   • Indicate that the functionality on the Endpoint where it is placed (and its Parts) is bridged, and
     *
     *   • Provide a centralized collection of attributes that the Node may collect to aid in conveying information
     *     regarding the Bridged Device to a user, such as the vendor name, the model name, or user-assigned name.
     *
     * This cluster shall be exposed by a Bridge on the Endpoint representing each Bridged Device. When the
     * functionality of a Bridged Device is represented using a set of Endpoints, this cluster shall only be exposed on
     * the Endpoint which is at the top of the hierarchy for the functionality of that Bridged Device.
     *
     * This cluster shall NOT be used on an endpoint that is not in the Descriptor cluster PartsList of an endpoint with
     * an Aggregator device type.
     *
     * This cluster has been derived from the Basic Information Cluster, and provides generic information about the
     * Bridged Device. Not all of the attributes in the Basic Information Cluster are relevant for a Bridged Device
     * (e.g. ProductID since it is not a Matter device). For other attributes, the information which is listed as
     * Mandatory for the Basic Information Cluster, may not be available when the Bridged Device does not provide it to
     * the Bridge, and the Bridge has no other means to determine it. For such cases where the information for a
     * particular attribute is not available, the Bridge SHOULD NOT include the attribute in the cluster for this
     * Bridged Device. See below for Conformance details.
     *
     * BridgedDeviceBasicInformationCluster supports optional features that you can enable with the
     * BridgedDeviceBasicInformationCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.13
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const BIS = { bridgedIcdSupport: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,
        attributes: Cluster.attributes,

        commands: {
            keepActive: MutableCluster.AsConditional(
                BridgedIcdSupportComponent.commands.keepActive,
                { mandatoryIf: [BIS] }
            )
        },

        events: {
            ...Cluster.events,
            activeChanged: MutableCluster.AsConditional(
                BridgedIcdSupportComponent.events.activeChanged,
                { mandatoryIf: [BIS] }
            )
        }
    });

    /**
     * This cluster supports all BridgedDeviceBasicInformation features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type BridgedDeviceBasicInformationCluster = BridgedDeviceBasicInformation.Cluster;
export const BridgedDeviceBasicInformationCluster = BridgedDeviceBasicInformation.Cluster;
ClusterRegistry.register(BridgedDeviceBasicInformation.Complete);
