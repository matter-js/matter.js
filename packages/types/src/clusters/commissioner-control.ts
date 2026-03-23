/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, Event } from "../cluster/Cluster.js";
import { TlvUInt32, TlvBitmap, TlvUInt64, TlvUInt16, TlvEnum } from "../tlv/TlvNumber.js";
import { AccessLevel, CommissionerControl as CommissionerControlModel } from "@matter/model";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvVendorId, VendorId } from "../datatype/VendorId.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { Priority } from "../globals/Priority.js";
import { TlvNodeId, NodeId } from "../datatype/NodeId.js";
import { Status } from "../globals/Status.js";
import { TlvFabricIndex, FabricIndex } from "../datatype/FabricIndex.js";
import { Identity, Bytes, MaybePromise } from "@matter/general";
import { BitFlag } from "../schema/BitmapSchema.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the CommissionerControl cluster.
 */
export namespace CommissionerControl {
    /**
     * {@link CommissionerControl} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the device categories specified in SupportedDeviceCategoryBitmap that are supported by this
             * Commissioner Control Cluster server.
             *
             * A client shall NOT send the RequestCommissioningApproval command if the intended node to be commissioned
             * does not conform to any of the values specified in SupportedDeviceCategories.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.5.1
             */
            readonly supportedDeviceCategories: SupportedDeviceCategory;
        }

        export interface Commands {
            /**
             * This command is sent by a client to request approval for a future CommissionNode call. This is required
             * to be a separate step in order to provide the server time for interacting with a user before informing
             * the client that the CommissionNode operation may be successful.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * The server may request approval from the user, but it is not required.
             *
             * The server shall always return SUCCESS to a correctly formatted RequestCommissioningApproval command, and
             * then generate a CommissioningRequestResult event associated with the command’s accessing fabric once the
             * result is ready.
             *
             * Clients SHOULD avoid using the same RequestID. If the RequestID and client NodeID of a
             * RequestCommissioningApproval match a previously received RequestCommissioningApproval and the server has
             * not returned an error or completed commissioning of a device for the prior request, then the server
             * SHOULD return FAILURE.
             *
             * The parameters for RequestCommissioningApproval command are as follows:
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.6.1
             */
            requestCommissioningApproval(request: RequestCommissioningApprovalRequest): MaybePromise;

            /**
             * This command is sent by a client to request that the server begins commissioning a previously approved
             * request.
             *
             * The server shall return FAILURE if the CommissionNode command is not sent from the same NodeID and on the
             * same fabric as the RequestCommissioningApproval or if the provided RequestID to CommissionNode does not
             * match the value provided to RequestCommissioningApproval.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * Upon receipt, the server shall respond with ReverseOpenCommissioningWindow if CommissioningRequestResult
             * was generated with StatusCode of SUCCESS for the matching RequestID field and NodeID of the client.
             *
             * The server shall return FAILURE if the CommissionNode command is received after the server has already
             * responded to a client with ReverseOpenCommissioningWindow for a matching RequestID field and NodeID of
             * the client unless the client has sent another RequestCommissioningApproval and received an additional
             * CommissioningRequestResult.
             *
             * The parameters for CommissionNode command are as follows:
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.6.5
             */
            commissionNode(request: CommissionNodeRequest): MaybePromise<ReverseOpenCommissioningWindowResponse>;
        }

        export interface Events {
            /**
             * This event shall be generated by the server following a RequestCommissioningApproval command which the
             * server responded to with SUCCESS.
             *
             * > [!NOTE]
             *
             * > The approval is valid for a period determined by the manufacturer and characteristics of the node
             *   presenting the Commissioner Control Cluster. Clients SHOULD send the CommissionNode command immediately
             *   upon receiving a CommissioningRequestResult event.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.7.1
             */
            commissioningRequestResult: CommissioningRequestResultEvent;
        }
    }

    /**
     * Attributes that may appear in {@link CommissionerControl}.
     */
    export interface Attributes {
        /**
         * Indicates the device categories specified in SupportedDeviceCategoryBitmap that are supported by this
         * Commissioner Control Cluster server.
         *
         * A client shall NOT send the RequestCommissioningApproval command if the intended node to be commissioned does
         * not conform to any of the values specified in SupportedDeviceCategories.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.26.5.1
         */
        readonly supportedDeviceCategories: SupportedDeviceCategory;
    }

    export interface Commands extends Base.Commands {}

    /**
     * Events that may appear in {@link CommissionerControl}.
     */
    export interface Events {
        /**
         * This event shall be generated by the server following a RequestCommissioningApproval command which the server
         * responded to with SUCCESS.
         *
         * > [!NOTE]
         *
         * > The approval is valid for a period determined by the manufacturer and characteristics of the node
         *   presenting the Commissioner Control Cluster. Clients SHOULD send the CommissionNode command immediately
         *   upon receiving a CommissioningRequestResult event.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.26.7.1
         */
        commissioningRequestResult: CommissioningRequestResultEvent;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes, commands: Base.Commands, events: Base.Events }];

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.26.4.1
     */
    export const SupportedDeviceCategory = {
        /**
         * Aggregators which support Fabric Synchronization may be commissioned.
         *
         * The FabricSynchronization bit shall be set to 1 if and only if the server supports commissioning nodes that
         * support Fabric Synchronization.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.26.4.1.1
         */
        fabricSynchronization: BitFlag(0)
    };

    export interface SupportedDeviceCategory {
        /**
         * Aggregators which support Fabric Synchronization may be commissioned.
         *
         * The FabricSynchronization bit shall be set to 1 if and only if the server supports commissioning nodes that
         * support Fabric Synchronization.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.26.4.1.1
         */
        fabricSynchronization?: boolean;
    }

    /**
     * This command is sent by a client to request approval for a future CommissionNode call. This is required to be a
     * separate step in order to provide the server time for interacting with a user before informing the client that
     * the CommissionNode operation may be successful.
     *
     * If the command is not executed via a CASE session, the command shall fail with a status code of
     * UNSUPPORTED_ACCESS.
     *
     * The server may request approval from the user, but it is not required.
     *
     * The server shall always return SUCCESS to a correctly formatted RequestCommissioningApproval command, and then
     * generate a CommissioningRequestResult event associated with the command’s accessing fabric once the result is
     * ready.
     *
     * Clients SHOULD avoid using the same RequestID. If the RequestID and client NodeID of a
     * RequestCommissioningApproval match a previously received RequestCommissioningApproval and the server has not
     * returned an error or completed commissioning of a device for the prior request, then the server SHOULD return
     * FAILURE.
     *
     * The parameters for RequestCommissioningApproval command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.6.1
     */
    export interface RequestCommissioningApprovalRequest {
        requestId: number | bigint;
        vendorId: VendorId;
        productId: number;
        label?: string;
    }

    /**
     * This command is sent by a client to request that the server begins commissioning a previously approved request.
     *
     * The server shall return FAILURE if the CommissionNode command is not sent from the same NodeID and on the same
     * fabric as the RequestCommissioningApproval or if the provided RequestID to CommissionNode does not match the
     * value provided to RequestCommissioningApproval.
     *
     * If the command is not executed via a CASE session, the command shall fail with a status code of
     * UNSUPPORTED_ACCESS.
     *
     * Upon receipt, the server shall respond with ReverseOpenCommissioningWindow if CommissioningRequestResult was
     * generated with StatusCode of SUCCESS for the matching RequestID field and NodeID of the client.
     *
     * The server shall return FAILURE if the CommissionNode command is received after the server has already responded
     * to a client with ReverseOpenCommissioningWindow for a matching RequestID field and NodeID of the client unless
     * the client has sent another RequestCommissioningApproval and received an additional CommissioningRequestResult.
     *
     * The parameters for CommissionNode command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.6.5
     */
    export interface CommissionNodeRequest {
        requestId: number | bigint;
        responseTimeoutSeconds: number;
    }

    /**
     * When received within the timeout specified by ResponseTimeoutSeconds in the CommissionNode command, the client
     * shall open a commissioning window on a node which matches the VendorID and ProductID provided in the associated
     * RequestCommissioningApproval command.
     *
     * When commissioning this node, the server shall check that the VendorID and ProductID fields provided in the
     * RequestCommissioningApproval command match the VendorID and ProductID attributes of the Basic Information Cluster
     * which have already been verified during the Device Attestation Procedure. If they do not match, the server shall
     * NOT complete commissioning and SHOULD indicate an error to the user.
     *
     * > [!NOTE]
     *
     * > This is an alias onto the OpenCommissioningWindow command within the Administrator Commissioning Cluster. Refer
     *   to the OpenCommissioningWindow command for a description of the command behavior and parameters.
     *
     * The parameters for ReverseOpenCommissioningWindow command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.6.8
     */
    export interface ReverseOpenCommissioningWindowResponse {
        commissioningTimeout: number;
        pakePasscodeVerifier: Bytes;
        discriminator: number;
        iterations: number;
        salt: Bytes;
    }

    /**
     * This event shall be generated by the server following a RequestCommissioningApproval command which the server
     * responded to with SUCCESS.
     *
     * > [!NOTE]
     *
     * > The approval is valid for a period determined by the manufacturer and characteristics of the node presenting
     *   the Commissioner Control Cluster. Clients SHOULD send the CommissionNode command immediately upon receiving a
     *   CommissioningRequestResult event.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.7.1
     */
    export interface CommissioningRequestResultEvent {
        requestId: number | bigint;
        clientNodeId: NodeId;
        statusCode: Status;
        fabricIndex: FabricIndex;
    }

    /**
     * Input to the CommissionerControl requestCommissioningApproval command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.6.1
     */
    export const TlvRequestCommissioningApprovalRequest = TlvObject({
        requestId: TlvField(0, TlvUInt64),
        vendorId: TlvField(1, TlvVendorId),
        productId: TlvField(2, TlvUInt16),
        label: TlvOptionalField(3, TlvString.bound({ maxLength: 64 }))
    });

    /**
     * Input to the CommissionerControl commissionNode command
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.6.5
     */
    export const TlvCommissionNodeRequest = TlvObject({
        requestId: TlvField(0, TlvUInt64),
        responseTimeoutSeconds: TlvField(1, TlvUInt16.bound({ min: 30, max: 120 }))
    });

    /**
     * When received within the timeout specified by ResponseTimeoutSeconds in the CommissionNode command, the client
     * shall open a commissioning window on a node which matches the VendorID and ProductID provided in the associated
     * RequestCommissioningApproval command.
     *
     * When commissioning this node, the server shall check that the VendorID and ProductID fields provided in the
     * RequestCommissioningApproval command match the VendorID and ProductID attributes of the Basic Information Cluster
     * which have already been verified during the Device Attestation Procedure. If they do not match, the server shall
     * NOT complete commissioning and SHOULD indicate an error to the user.
     *
     * > [!NOTE]
     *
     * > This is an alias onto the OpenCommissioningWindow command within the Administrator Commissioning Cluster. Refer
     *   to the OpenCommissioningWindow command for a description of the command behavior and parameters.
     *
     * The parameters for ReverseOpenCommissioningWindow command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.6.8
     */
    export const TlvReverseOpenCommissioningWindowResponse = TlvObject({
        commissioningTimeout: TlvField(0, TlvUInt16),
        pakePasscodeVerifier: TlvField(1, TlvByteString.bound({ length: 97 })),
        discriminator: TlvField(2, TlvUInt16.bound({ max: 4095 })),
        iterations: TlvField(3, TlvUInt32.bound({ min: 1000, max: 100000 })),
        salt: TlvField(4, TlvByteString.bound({ minLength: 16, maxLength: 32 }))
    });

    /**
     * Body of the CommissionerControl commissioningRequestResult event
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26.7.1
     */
    export const TlvCommissioningRequestResultEvent = TlvObject({
        requestId: TlvField(0, TlvUInt64),
        clientNodeId: TlvField(1, TlvNodeId),
        statusCode: TlvField(2, TlvEnum<Status>()),
        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x751,
        name: "CommissionerControl",
        revision: 1,

        attributes: {
            /**
             * Indicates the device categories specified in SupportedDeviceCategoryBitmap that are supported by this
             * Commissioner Control Cluster server.
             *
             * A client shall NOT send the RequestCommissioningApproval command if the intended node to be commissioned
             * does not conform to any of the values specified in SupportedDeviceCategories.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.5.1
             */
            supportedDeviceCategories: Attribute(
                0x0,
                TlvBitmap(TlvUInt32, SupportedDeviceCategory),
                { readAcl: AccessLevel.Manage, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * This command is sent by a client to request approval for a future CommissionNode call. This is required
             * to be a separate step in order to provide the server time for interacting with a user before informing
             * the client that the CommissionNode operation may be successful.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * The server may request approval from the user, but it is not required.
             *
             * The server shall always return SUCCESS to a correctly formatted RequestCommissioningApproval command, and
             * then generate a CommissioningRequestResult event associated with the command’s accessing fabric once the
             * result is ready.
             *
             * Clients SHOULD avoid using the same RequestID. If the RequestID and client NodeID of a
             * RequestCommissioningApproval match a previously received RequestCommissioningApproval and the server has
             * not returned an error or completed commissioning of a device for the prior request, then the server
             * SHOULD return FAILURE.
             *
             * The parameters for RequestCommissioningApproval command are as follows:
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.6.1
             */
            requestCommissioningApproval: Command(
                0x0,
                TlvRequestCommissioningApprovalRequest,
                0x0,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command is sent by a client to request that the server begins commissioning a previously approved
             * request.
             *
             * The server shall return FAILURE if the CommissionNode command is not sent from the same NodeID and on the
             * same fabric as the RequestCommissioningApproval or if the provided RequestID to CommissionNode does not
             * match the value provided to RequestCommissioningApproval.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * Upon receipt, the server shall respond with ReverseOpenCommissioningWindow if CommissioningRequestResult
             * was generated with StatusCode of SUCCESS for the matching RequestID field and NodeID of the client.
             *
             * The server shall return FAILURE if the CommissionNode command is received after the server has already
             * responded to a client with ReverseOpenCommissioningWindow for a matching RequestID field and NodeID of
             * the client unless the client has sent another RequestCommissioningApproval and received an additional
             * CommissioningRequestResult.
             *
             * The parameters for CommissionNode command are as follows:
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.6.5
             */
            commissionNode: Command(
                0x1,
                TlvCommissionNodeRequest,
                0x2,
                TlvReverseOpenCommissioningWindowResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        },

        events: {
            /**
             * This event shall be generated by the server following a RequestCommissioningApproval command which the
             * server responded to with SUCCESS.
             *
             * > [!NOTE]
             *
             * > The approval is valid for a period determined by the manufacturer and characteristics of the node
             *   presenting the Commissioner Control Cluster. Clients SHOULD send the CommissionNode command immediately
             *   upon receiving a CommissioningRequestResult event.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.26.7.1
             */
            commissioningRequestResult: Event(
                0x0,
                Priority.Info,
                TlvCommissioningRequestResultEvent,
                { readAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * The Commissioner Control Cluster supports the ability for clients to request the commissioning of themselves or
     * other nodes onto a fabric which the cluster server can commission onto. An example use case is ecosystem to
     * ecosystem Fabric Synchronization setup.
     *
     * The generalized flow supported by the Commissioner Control Cluster can be seen in the following diagram.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.26
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x751);
    export const name = "CommissionerControl" as const;
    export const revision = 1;
    export const schema = CommissionerControlModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const Typing: CommissionerControl;
}

export type CommissionerControlCluster = CommissionerControl.Cluster;
export const CommissionerControlCluster = CommissionerControl.Cluster;
ClusterNamespace.define(CommissionerControl);
export interface CommissionerControl extends ClusterTyping { Attributes: CommissionerControl.Attributes; Commands: CommissionerControl.Commands; Events: CommissionerControl.Events; Components: CommissionerControl.Components }
