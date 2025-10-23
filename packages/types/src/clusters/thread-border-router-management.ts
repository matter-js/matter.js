/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, TlvNoResponse, Attribute, FixedAttribute } from "../cluster/Cluster.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvByteString, TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvUInt16, TlvUInt64 } from "../tlv/TlvNumber.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ThreadBorderRouterManagement {
    /**
     * These are optional features supported by ThreadBorderRouterManagementCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.4
     */
    export enum Feature {
        /**
         * PanChange (PC)
         *
         * This feature shall indicate the ability of the Border Router to change its already configured PAN to another,
         * by setting a pending dataset.
         *
         * > [!NOTE]
         *
         * > This feature flag can be used to protect an already-configured network from accidental configuration
         *   change, e.g. when the Thread Border Router serves non-Matter devices that do not support PAN change for an
         *   implementation-specific reason.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.3.4.1
         */
        PanChange = "PanChange"
    }

    /**
     * Input to the ThreadBorderRouterManagement setPendingDatasetRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.5
     */
    export const TlvSetPendingDatasetRequest = TlvObject({
        pendingDataset: TlvField(0, TlvByteString.bound({ maxLength: 254 }))
    });

    /**
     * Input to the ThreadBorderRouterManagement setPendingDatasetRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.5
     */
    export interface SetPendingDatasetRequest extends TypeFromSchema<typeof TlvSetPendingDatasetRequest> {}

    /**
     * This command is sent in response to GetActiveDatasetRequest or GetPendingDatasetRequest command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.3
     */
    export const TlvDatasetResponse = TlvObject({
        /**
         * If no dataset (active or pending as requested) is configured, this field shall be set to empty.
         *
         * Otherwise, this field shall contain the active or pending dataset of the Thread network to which the Border
         * Router is connected as an octet string containing the raw Thread TLV value of the dataset, as defined in the
         * Thread specification.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.3.1
         */
        dataset: TlvField(0, TlvByteString.bound({ maxLength: 254 }))
    });

    /**
     * This command is sent in response to GetActiveDatasetRequest or GetPendingDatasetRequest command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.3
     */
    export interface DatasetResponse extends TypeFromSchema<typeof TlvDatasetResponse> {}

    /**
     * Input to the ThreadBorderRouterManagement setActiveDatasetRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.4
     */
    export const TlvSetActiveDatasetRequest = TlvObject({
        /**
         * This field shall contain the active dataset to set of the Thread network to configure in the Border Router as
         * an octet string containing the raw Thread TLV value of the dataset, as defined in the Thread specification.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.4.1
         */
        activeDataset: TlvField(0, TlvByteString.bound({ maxLength: 254 })),

        /**
         * See Breadcrumb Attribute section of General Commissioning Cluster in [MatterCore] for usage.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.4.2
         */
        breadcrumb: TlvOptionalField(1, TlvUInt64)
    });

    /**
     * Input to the ThreadBorderRouterManagement setActiveDatasetRequest command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.4
     */
    export interface SetActiveDatasetRequest extends TypeFromSchema<typeof TlvSetActiveDatasetRequest> {}

    /**
     * A ThreadBorderRouterManagementCluster supports these elements if it supports feature PanChange.
     */
    export const PanChangeComponent = MutableCluster.Component({
        commands: {
            /**
             * This command shall be used to set or update the pending Dataset of the Thread network to which the Border
             * Router is connected, if the Border Router supports PAN Change.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * This PendingDataset field shall contain the pending dataset to which the Thread network should be
             * updated. The format of the data shall be an octet string containing the raw Thread TLV value of the
             * pending dataset, as defined in the Thread specification.
             *
             * If any of the parameters in the PendingDataset is invalid, the command shall fail with a status of
             * INVALID_COMMAND.
             *
             * Otherwise, this command shall configure the pending dataset of the Thread network to which the Border
             * Router is connected, with the value given in the PendingDataset parameter. The Border Router will manage
             * activation of the pending dataset as defined in the Thread specification.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.5
             */
            setPendingDatasetRequest: Command(
                0x4,
                TlvSetPendingDatasetRequest,
                0x4,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage, timed: true }
            )
        }
    });

    /**
     * These elements and properties are present in all ThreadBorderRouterManagement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x452,
        name: "ThreadBorderRouterManagement",
        revision: 1,

        features: {
            /**
             * This feature shall indicate the ability of the Border Router to change its already configured PAN to
             * another, by setting a pending dataset.
             *
             * > [!NOTE]
             *
             * > This feature flag can be used to protect an already-configured network from accidental configuration
             *   change, e.g. when the Thread Border Router serves non-Matter devices that do not support PAN change for
             *   an implementation-specific reason.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.4.1
             */
            panChange: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates a user-friendly name identifying the device model or product of the Border Router in MeshCOP
             * (DNS-SD service name) as defined in the Thread specification, and has the following recommended format:
             * <VendorName> <ProductName>._meshcop._udp. An example name would be ACME Border Router
             * (74be)._meshcop._udp.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.5.1
             */
            borderRouterName: Attribute(0x0, TlvString.bound({ minLength: 1, maxLength: 63 })),

            /**
             * Indicates a 16-byte globally unique ID for a Thread Border Router device. This ID is
             * manufacturer-specific, and it is created and managed by the border router’s implementation.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.5.2
             */
            borderAgentId: Attribute(0x1, TlvByteString.bound({ length: 16 })),

            /**
             * Indicates the Thread version supported by the Thread interface configured by the cluster instance.
             *
             * The format shall match the value mapping defined in the "Version TLV" section of the Thread
             * specification. For example, Thread 1.3.0 would have ThreadVersion set to 4.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.5.3
             */
            threadVersion: FixedAttribute(0x2, TlvUInt16),

            /**
             * Indicates whether the associated IEEE 802.15.4 Thread interface is enabled or disabled.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.5.4
             */
            interfaceEnabled: Attribute(0x3, TlvBoolean, { persistent: true }),

            /**
             * Null if the Thread Border Router has no dataset configured, otherwise it shall be the timestamp value
             * extracted from the Active Dataset value configured by the Thread Node to which the border router is
             * connected. This attribute shall be updated when a new Active dataset is configured on the Thread network
             * to which the border router is connected.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.5.5
             */
            activeDatasetTimestamp: Attribute(0x4, TlvNullable(TlvUInt64), { persistent: true }),

            /**
             * Null if the Thread Border Router has no Pending dataset configured, otherwise it shall be the timestamp
             * value extracted from the Pending Dataset value configured by the Thread Node to which the border router
             * is connected. This attribute shall be updated when a new Pending dataset is configured on the Thread
             * network to which the border router is connected.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.5.6
             */
            pendingDatasetTimestamp: Attribute(0x5, TlvNullable(TlvUInt64), { persistent: true })
        },

        commands: {
            /**
             * This command shall be used to request the active operational dataset of the Thread network to which the
             * border router is connected.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * If an internal error occurs, then this command shall fail with a FAILURE status code sent back to the
             * initiator.
             *
             * Otherwise, this shall generate a DatasetResponse command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.1
             */
            getActiveDatasetRequest: Command(
                0x0,
                TlvNoArguments,
                0x2,
                TlvDatasetResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall be used to request the pending dataset of the Thread network to which the border
             * router is connected.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * If an internal error occurs, then this command shall fail with a FAILURE status code sent back to the
             * initiator.
             *
             * Otherwise, this shall generate a DatasetResponse command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.2
             */
            getPendingDatasetRequest: Command(
                0x1,
                TlvNoArguments,
                0x2,
                TlvDatasetResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall be used to set the active Dataset of the Thread network to which the Border Router is
             * connected, when there is no active dataset already.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 10.3.6.4
             */
            setActiveDatasetRequest: Command(
                0x3,
                TlvSetActiveDatasetRequest,
                0x3,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage, timed: true }
            )
        },

        /**
         * This metadata controls which ThreadBorderRouterManagementCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { panChange: true }, component: PanChangeComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for managing a Thread Border Router and the Thread network that it belongs to.
     * Privileged nodes within the same fabric as a Thread Border Router can use these interfaces to request and set
     * credentials information to the Thread network.
     *
     * ThreadBorderRouterManagementCluster supports optional features that you can enable with the
     * ThreadBorderRouterManagementCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 10.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const PC = { panChange: true };

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
            ...Cluster.commands,
            setPendingDatasetRequest: MutableCluster.AsConditional(
                PanChangeComponent.commands.setPendingDatasetRequest,
                { mandatoryIf: [PC] }
            )
        }
    });

    /**
     * This cluster supports all ThreadBorderRouterManagement features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ThreadBorderRouterManagementCluster = ThreadBorderRouterManagement.Cluster;
export const ThreadBorderRouterManagementCluster = ThreadBorderRouterManagement.Cluster;
ClusterRegistry.register(ThreadBorderRouterManagement.Complete);
