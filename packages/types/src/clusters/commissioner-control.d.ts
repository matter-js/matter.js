/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";
import type { VendorId } from "../datatype/VendorId.js";
import type { NodeId } from "../datatype/NodeId.js";
import type { Status } from "../globals/Status.js";
import type { FabricIndex } from "../datatype/FabricIndex.js";

/**
 * Definitions for the CommissionerControl cluster.
 *
 * The Commissioner Control Cluster supports the ability for clients to request the commissioning of themselves or other
 * nodes onto a fabric which the cluster server can commission onto. An example use case is ecosystem to ecosystem
 * Fabric Synchronization setup.
 *
 * The generalized flow supported by the Commissioner Control Cluster can be seen in the following diagram.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.26
 */
export declare namespace CommissionerControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0751;

    /**
     * Textual cluster identifier.
     */
    export const name: "CommissionerControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the CommissionerControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link CommissionerControl} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the device categories specified in SupportedDeviceCategoryBitmap that are supported by this
         * Commissioner Control Cluster server.
         *
         * A client shall NOT send the RequestCommissioningApproval command if the intended node to be commissioned does
         * not conform to any of the values specified in SupportedDeviceCategories.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.26.5.1
         */
        supportedDeviceCategories: SupportedDeviceCategory;
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
        supportedDeviceCategories: SupportedDeviceCategory;
    }

    /**
     * {@link CommissionerControl} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is sent by a client to request approval for a future CommissionNode call. This is required to be
         * a separate step in order to provide the server time for interacting with a user before informing the client
         * that the CommissionNode operation may be successful.
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
         * RequestCommissioningApproval match a previously received RequestCommissioningApproval and the server has not
         * returned an error or completed commissioning of a device for the prior request, then the server SHOULD return
         * FAILURE.
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
         * same fabric as the RequestCommissioningApproval or if the provided RequestID to CommissionNode does not match
         * the value provided to RequestCommissioningApproval.
         *
         * If the command is not executed via a CASE session, the command shall fail with a status code of
         * UNSUPPORTED_ACCESS.
         *
         * Upon receipt, the server shall respond with ReverseOpenCommissioningWindow if CommissioningRequestResult was
         * generated with StatusCode of SUCCESS for the matching RequestID field and NodeID of the client.
         *
         * The server shall return FAILURE if the CommissionNode command is received after the server has already
         * responded to a client with ReverseOpenCommissioningWindow for a matching RequestID field and NodeID of the
         * client unless the client has sent another RequestCommissioningApproval and received an additional
         * CommissioningRequestResult.
         *
         * The parameters for CommissionNode command are as follows:
         *
         * @see {@link MatterSpecification.v142.Core} § 11.26.6.5
         */
        commissionNode(request: CommissionNodeRequest): MaybePromise<ReverseOpenCommissioningWindowResponse>;
    }

    /**
     * Commands that may appear in {@link CommissionerControl}.
     */
    export interface Commands extends BaseCommands {}

    /**
     * {@link CommissionerControl} always supports these elements.
     */
    export interface BaseEvents {
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

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents }];

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.26.4.1
     */
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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterNamespace.EventObjects<Events>;

    /**
     * @deprecated Use {@link CommissionerControl}.
     */
    export const Cluster: typeof CommissionerControl;

    /**
     * @deprecated Use {@link CommissionerControl}.
     */
    export const Complete: typeof CommissionerControl;

    export const Typing: CommissionerControl;
}

/**
 * @deprecated Use {@link CommissionerControl}.
 */
export declare const CommissionerControlCluster: typeof CommissionerControl;

export interface CommissionerControl extends ClusterTyping {
    Attributes: CommissionerControl.Attributes;
    Commands: CommissionerControl.Commands;
    Events: CommissionerControl.Events;
    Components: CommissionerControl.Components;
}
