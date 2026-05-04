/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { MaybePromise, Bytes } from "@matter/general";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status } from "../globals/Status.js";

/**
 * Definitions for the JointFabricAdministrator cluster.
 *
 * An instance of the Joint Fabric Administrator Cluster only applies to Joint Fabric Administrator nodes fulfilling the
 * role of Anchor CA.
 *
 * > [!NOTE]
 *
 * > NOTE: Support for Joint Fabric Administrator Cluster is provisional.
 *
 * @see {@link MatterSpecification.v151.Core} § 11.25
 */
export declare namespace JointFabricAdministrator {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0753;

    /**
     * Textual cluster identifier.
     */
    export const name: "JointFabricAdministrator";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the JointFabricAdministrator cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link JointFabricAdministrator} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * The AdministratorFabricIndex attribute shall indicate the FabricIndex from the Endpoint 0's Operational
         * Cluster Fabrics attribute (i.e. the Fabric Table) which is associated with the JointFabric. This field shall
         * have the value of null if there is no fabric associated with the JointFabric.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.6.1
         */
        administratorFabricIndex: FabricIndex | null;
    }

    /**
     * Attributes that may appear in {@link JointFabricAdministrator}.
     */
    export interface Attributes {
        /**
         * The AdministratorFabricIndex attribute shall indicate the FabricIndex from the Endpoint 0's Operational
         * Cluster Fabrics attribute (i.e. the Fabric Table) which is associated with the JointFabric. This field shall
         * have the value of null if there is no fabric associated with the JointFabric.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.6.1
         */
        administratorFabricIndex: FabricIndex | null;
    }

    /**
     * {@link JointFabricAdministrator} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command shall be generated during Joint Commissioning Method and subsequently be responded in the form
         * of an ICACCSRResponse command.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.1
         */
        icaccsrRequest(): MaybePromise<IcaccsrResponse>;

        /**
         * This command shall be generated and executed during Joint Commissioning Method and subsequently be responded
         * in the form of an ICACResponse command.
         *
         * A Commissioner or Administrator shall issue this command after issuing the ICACCSRRequest command and
         * receiving its response.
         *
         * A Commissioner or Administrator shall issue this command after performing the Attestation Procedure, Fabric
         * Table VID Verification and after validating that the peer is authorized to act as an Administrator in its own
         * Fabric.
         *
         * Check ICA Cross Signing for details about the generation of ICACValue.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.3
         */
        addIcac(request: AddIcacRequest): MaybePromise<IcacResponse>;

        /**
         * > [!NOTE]
         *
         * > NOTE: This is an alias onto the OpenCommissioningWindow command within the Joint Fabric Administrator
         *   Cluster. Refer to the OpenCommissioningWindow command for a description of the command behavior and
         *   parameters.
         *
         * This command shall fail with a InvalidAdministratorFabricIndex status code sent back to the initiator if the
         * AdministratorFabricIndex attribute has the value of null.
         *
         * The parameters for OpenJointCommissioningWindow command are as follows:
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.5
         */
        openJointCommissioningWindow(request: OpenJointCommissioningWindowRequest): MaybePromise;

        /**
         * This command shall be sent by a candidate Joint Fabric Anchor Administrator to the current Joint Fabric
         * Anchor Administrator to request transfer of the Anchor Fabric.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.6
         */
        transferAnchorRequest(): MaybePromise<TransferAnchorResponse>;

        /**
         * This command shall indicate the completion of the transfer of the Anchor Fabric to another Joint Fabric
         * Ecosystem Administrator.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.8
         */
        transferAnchorComplete(): MaybePromise;

        /**
         * This command shall be used for communicating to client the endpoint that holds the Joint Fabric Administrator
         * Cluster.
         *
         * This field shall contain the unique identifier for the endpoint that holds the Joint Fabric Administrator
         * Cluster.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.9
         */
        announceJointFabricAdministrator(request: AnnounceJointFabricAdministratorRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link JointFabricAdministrator}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];

    /**
     * This command shall be generated in response to a ICACCSRRequest command.
     *
     * Check ICAC Cross Signing for details about the generation of the ICACCSR.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.7.2
     */
    export declare class IcaccsrResponse {
        constructor(values?: Partial<IcaccsrResponse>);

        /**
         * This field shall be a DER-encoded octet string of a properly encoded PKCS #10 Certificate Signing Request
         * (CSR).
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.2.1
         */
        icaccsr: Bytes;
    };

    /**
     * This command shall be generated and executed during Joint Commissioning Method and subsequently be responded in
     * the form of an ICACResponse command.
     *
     * A Commissioner or Administrator shall issue this command after issuing the ICACCSRRequest command and receiving
     * its response.
     *
     * A Commissioner or Administrator shall issue this command after performing the Attestation Procedure, Fabric Table
     * VID Verification and after validating that the peer is authorized to act as an Administrator in its own Fabric.
     *
     * Check ICA Cross Signing for details about the generation of ICACValue.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.7.3
     */
    export declare class AddIcacRequest {
        constructor(values?: Partial<AddIcacRequest>);

        /**
         * This field shall contain an ICAC encoded using Matter Certificate Encoding.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.3.1
         */
        icacValue: Bytes;
    };

    /**
     * This command shall be generated in response to the AddICAC command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.7.4
     */
    export declare class IcacResponse {
        constructor(values?: Partial<IcacResponse>);

        /**
         * This field shall contain an ICACResponseStatusEnum value representing the status of the AddICAC operation.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.25.7.4.1
         */
        statusCode: IcacResponseStatus;
    };

    /**
     * > [!NOTE]
     *
     * > NOTE: This is an alias onto the OpenCommissioningWindow command within the Joint Fabric Administrator Cluster.
     *   Refer to the OpenCommissioningWindow command for a description of the command behavior and parameters.
     *
     * This command shall fail with a InvalidAdministratorFabricIndex status code sent back to the initiator if the
     * AdministratorFabricIndex attribute has the value of null.
     *
     * The parameters for OpenJointCommissioningWindow command are as follows:
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.7.5
     */
    export declare class OpenJointCommissioningWindowRequest {
        constructor(values?: Partial<OpenJointCommissioningWindowRequest>);
        commissioningTimeout: number;
        pakePasscodeVerifier: Bytes;
        discriminator: number;
        iterations: number;
        salt: Bytes;
    };

    /**
     * This command shall be generated in response to the Transfer Anchor Request command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.7.7
     */
    export declare class TransferAnchorResponse {
        constructor(values?: Partial<TransferAnchorResponse>);
        statusCode: TransferAnchorResponseStatus;
    };

    /**
     * This command shall be used for communicating to client the endpoint that holds the Joint Fabric Administrator
     * Cluster.
     *
     * This field shall contain the unique identifier for the endpoint that holds the Joint Fabric Administrator
     * Cluster.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.7.9
     */
    export declare class AnnounceJointFabricAdministratorRequest {
        constructor(values?: Partial<AnnounceJointFabricAdministratorRequest>);
        endpointId: EndpointNumber;
    };

    /**
     * This enumeration is used by the AddICAC command to convey the outcome of this cluster's operations.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.4.1
     */
    export enum IcacResponseStatus {
        /**
         * No error
         */
        Ok = 0,

        /**
         * Public Key in the ICAC is invalid
         */
        InvalidPublicKey = 1,

        /**
         * ICAC chain validation failed / ICAC DN Encoding rules verification failed
         */
        InvalidIcac = 2
    }

    /**
     * This enumeration is used by the TransferAnchorResponse command to convey the detailed outcome of this cluster's
     * TransferAnchorRequest command.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.4.2
     */
    export enum TransferAnchorResponseStatus {
        /**
         * No error
         */
        Ok = 0,

        /**
         * Anchor Transfer was not started due to on-going Datastore operations
         */
        TransferAnchorStatusDatastoreBusy = 1,

        /**
         * User has not consented for Anchor Transfer
         */
        TransferAnchorStatusNoUserConsent = 2
    }

    /**
     * @see {@link MatterSpecification.v151.Core} § 11.25.5.1
     */
    export enum StatusCode {
        /**
         * Could not be completed because another commissioning is in progress
         */
        Busy = 2,

        /**
         * Provided PAKE parameters were incorrectly formatted or otherwise invalid
         */
        PakeParameterError = 3,

        /**
         * No commissioning window was currently open
         */
        WindowNotOpen = 4,

        /**
         * ICACCSRRequest command has been invoked by a peer against which Fabric Table VID Verification hasn't been
         * executed
         */
        VidNotVerified = 5,

        /**
         * OpenJointCommissioningWindow command has been invoked but the AdministratorFabricIndex field has the value of
         * null
         */
        InvalidAdministratorFabricIndex = 6
    }

    /**
     * Thrown for cluster status code {@link StatusCode.Busy}.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.5.1
     */
    export class BusyError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.PakeParameterError}.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.5.1
     */
    export class PakeParameterError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.WindowNotOpen}.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.5.1
     */
    export class WindowNotOpenError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.VidNotVerified}.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.5.1
     */
    export class VidNotVerifiedError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidAdministratorFabricIndex}.
     *
     * @see {@link MatterSpecification.v151.Core} § 11.25.5.1
     */
    export class InvalidAdministratorFabricIndexError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link JointFabricAdministrator}.
     */
    export const Cluster: typeof JointFabricAdministrator;

    /**
     * @deprecated Use {@link JointFabricAdministrator}.
     */
    export const Complete: typeof JointFabricAdministrator;

    export const Typing: JointFabricAdministrator;
}

/**
 * @deprecated Use {@link JointFabricAdministrator}.
 */
export declare const JointFabricAdministratorCluster: typeof JointFabricAdministrator;

export interface JointFabricAdministrator extends ClusterTyping {
    Attributes: JointFabricAdministrator.Attributes;
    Commands: JointFabricAdministrator.Commands;
    Components: JointFabricAdministrator.Components;
}
