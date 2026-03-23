/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FabricIndex } from "../datatype/FabricIndex.js";
import { MaybePromise, Bytes } from "@matter/general";
import { EndpointNumber } from "../datatype/EndpointNumber.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { JointFabricAdministrator as JointFabricAdministratorModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the JointFabricAdministrator cluster.
 */
export namespace JointFabricAdministrator {
    /**
     * {@link JointFabricAdministrator} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * The AdministratorFabricIndex attribute shall indicate the FabricIndex from the Endpoint 0’s Operational
             * Cluster Fabrics attribute (i.e. the Fabric Table) which is associated with the JointFabric. This field
             * shall have the value of null if there is no fabric associated with the JointFabric.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.6.1
             */
            administratorFabricIndex: FabricIndex | null;
        }

        export interface Commands {
            /**
             * This command shall be generated during Joint Commissioning Method and subsequently be responded in the
             * form of an ICACCSRResponse command.
             *
             * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
             * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
             *
             * If this command is received from a peer against FabricFabric Table Vendor ID Verification Procedure
             * hasn’t been executed then it shall fail with a JfVidNotVerified status code sent back to the initiator.
             *
             * If a prior AddICAC command was successfully executed within the fail-safe timer period, then this command
             * shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.7.1
             */
            icaccsrRequest(): MaybePromise<IcaccsrResponse>;

            /**
             * This command shall be generated and executed during Joint Commissioning Method and subsequently be
             * responded in the form of an ICACResponse command.
             *
             * A Commissioner or Administrator shall issue this command after issuing the ICACCSRRequest command and
             * receiving its response.
             *
             * A Commissioner or Administrator shall issue this command after performing the Attestation Procedure,
             * Fabric Table VID Verification and after validating that the peer is authorized to act as an Administrator
             * in its own Fabric.
             *
             * Check ICA Cross Signing for details about the generation of ICACValue.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.7.3
             */
            addIcac(request: AddIcacRequest): MaybePromise<IcacResponse>;

            /**
             * > [!NOTE]
             *
             * > This is an alias onto the OpenCommissioningWindow command within the Joint Fabric Administrator
             *   Cluster. Refer to the OpenCommissioningWindow command for a description of the command behavior and
             *   parameters.
             *
             * This command shall fail with a InvalidAdministratorFabricIndex status code sent back to the initiator if
             * the AdministratorFabricIndex field has the value of null.
             *
             * The parameters for OpenJointCommissioningWindow command are as follows:
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.7.5
             */
            openJointCommissioningWindow(request: OpenJointCommissioningWindowRequest): MaybePromise;

            /**
             * This command shall be sent by a candidate Joint Fabric Anchor Administrator to the current Joint Fabric
             * Anchor Administrator to request transfer of the Anchor Fabric.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.7.6
             */
            transferAnchorRequest(): MaybePromise<TransferAnchorResponse>;

            /**
             * This command shall indicate the completion of the transfer of the Anchor Fabric to another Joint Fabric
             * Ecosystem Administrator.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.7.8
             */
            transferAnchorComplete(): MaybePromise;

            /**
             * This command shall be used for communicating to client the endpoint that holds the Joint Fabric
             * Administrator Cluster.
             *
             * This field shall contain the unique identifier for the endpoint that holds the Joint Fabric Administrator
             * Cluster.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.25.7.9
             */
            announceJointFabricAdministrator(request: AnnounceJointFabricAdministratorRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link JointFabricAdministrator}.
     */
    export interface Attributes {
        /**
         * The AdministratorFabricIndex attribute shall indicate the FabricIndex from the Endpoint 0’s Operational
         * Cluster Fabrics attribute (i.e. the Fabric Table) which is associated with the JointFabric. This field shall
         * have the value of null if there is no fabric associated with the JointFabric.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.25.6.1
         */
        administratorFabricIndex: FabricIndex | null;
    }

    export interface Commands extends Base.Commands {}
    export type Components = [{ flags: {}, attributes: Base.Attributes, commands: Base.Commands }];

    /**
     * This command shall be generated in response to a ICACCSRRequest command.
     *
     * Check ICAC Cross Signing for details about the generation of the ICACCSR.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.7.2
     */
    export interface IcaccsrResponse {
        /**
         * This field shall be a DER-encoded octet string of a properly encoded PKCS #10 Certificate Signing Request
         * (CSR).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.25.7.2.1
         */
        icaccsr: Bytes;
    }

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
     * @see {@link MatterSpecification.v142.Core} § 11.25.7.3
     */
    export interface AddIcacRequest {
        /**
         * This field shall contain an ICAC encoded using Matter Certificate Encoding.
         *
         * ### Effect on Receipt
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * This command shall be received over a CASE session otherwise it shall fail with an INVALID_COMMAND status
         * code.
         *
         * Upon receipt, the ICACValue shall be validated in the following ways:
         *
         *   1. Verify the ICAC using Crypto_VerifyChain(certificates = [ICACValue, RootCACertificate]) where
         *      RootCACertificate is the associated RCAC of the accessing fabric. If this check fails, the error status
         *      shall be InvalidICAC.
         *
         *   2. The public key of the ICAC shall match the public key present in the last ICACCSRResponse provided to
         *      the Administrator that sent the AddICAC command. If this check fails, the error status shall be
         *      InvalidPublicKey.
         *
         *   3. The DN Encoding Rules shall be validated for the ICAC. If this check fails, the error status shall be
         *      InvalidICAC.
         *
         * If any of the above validation checks fail, the server shall immediately respond to the client with an
         * ICACResponse. The StatusCode field of the ICACResponse shall be set to the error status value specified in
         * the above validation checks.
         *
         * If all the checks succeed, then the ICACValue shall be used as described in the Joint Commissioning Method.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.25.7.3.1
         */
        icacValue: Bytes;
    }

    /**
     * This command shall be generated in response to the AddICAC command.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.7.4
     */
    export interface IcacResponse {
        /**
         * This field shall contain an ICACResponseStatusEnum value representing the status of the AddICAC operation.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.25.7.4.1
         */
        statusCode: IcacResponseStatus;
    }

    /**
     * > [!NOTE]
     *
     * > This is an alias onto the OpenCommissioningWindow command within the Joint Fabric Administrator Cluster. Refer
     *   to the OpenCommissioningWindow command for a description of the command behavior and parameters.
     *
     * This command shall fail with a InvalidAdministratorFabricIndex status code sent back to the initiator if the
     * AdministratorFabricIndex field has the value of null.
     *
     * The parameters for OpenJointCommissioningWindow command are as follows:
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.7.5
     */
    export interface OpenJointCommissioningWindowRequest {
        commissioningTimeout: number;
        pakePasscodeVerifier: Bytes;
        discriminator: number;
        iterations: number;
        salt: Bytes;
    }

    /**
     * This command shall be generated in response to the Transfer Anchor Request command.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.7.7
     */
    export interface TransferAnchorResponse {
        statusCode: TransferAnchorResponseStatus;
    }

    /**
     * This command shall be used for communicating to client the endpoint that holds the Joint Fabric Administrator
     * Cluster.
     *
     * This field shall contain the unique identifier for the endpoint that holds the Joint Fabric Administrator
     * Cluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.7.9
     */
    export interface AnnounceJointFabricAdministratorRequest {
        endpointId: EndpointNumber;
    }

    /**
     * This enumeration is used by the ICACResponse command to convey the outcome of this cluster’s operations.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.4.1
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
     * This enumeration is used by the TransferAnchorResponse command to convey the detailed outcome of this cluster’s
     * TransferAnchorRequest command.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.4.2
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
     * @see {@link MatterSpecification.v142.Core} § 11.25.5.1
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
         * ICACCSRRequest command has been invoked by a peer against which Fabric Table VID Verification hasn’t been
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
     * @see {@link MatterSpecification.v142.Core} § 11.25.5.1
     */
    export class BusyError extends StatusResponseError {
        constructor(
            message = "Could not be completed because another commissioning is in progress",
            code = Status.Failure,
            clusterCode = StatusCode.Busy
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.PakeParameterError}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.5.1
     */
    export class PakeParameterError extends StatusResponseError {
        constructor(
            message = "Provided PAKE parameters were incorrectly formatted or otherwise invalid",
            code = Status.Failure,
            clusterCode = StatusCode.PakeParameterError
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.WindowNotOpen}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.5.1
     */
    export class WindowNotOpenError extends StatusResponseError {
        constructor(
            message = "No commissioning window was currently open",
            code = Status.Failure,
            clusterCode = StatusCode.WindowNotOpen
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.VidNotVerified}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.5.1
     */
    export class VidNotVerifiedError extends StatusResponseError {
        constructor(
            message = "ICACCSRRequest command has been invoked by a peer against which Fabric Table VID Verification hasn’t been executed",
            code = Status.Failure,
            clusterCode = StatusCode.VidNotVerified
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidAdministratorFabricIndex}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.25.5.1
     */
    export class InvalidAdministratorFabricIndexError extends StatusResponseError {
        constructor(
            message = "OpenJointCommissioningWindow command has been invoked but the AdministratorFabricIndex field has the value of null",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidAdministratorFabricIndex
        ) {
            super(message, code, clusterCode);
        }
    }

    export const id = ClusterId(0x753);
    export const name = "JointFabricAdministrator" as const;
    export const revision = 1;
    export const schema = JointFabricAdministratorModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export type Cluster = typeof JointFabricAdministrator;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `JointFabricAdministrator` instead of
     * `JointFabricAdministrator.Complete`)
     */
    export type Complete = typeof JointFabricAdministrator;

    export declare const Complete: Complete;
    export declare const Typing: JointFabricAdministrator;
}

ClusterNamespace.define(JointFabricAdministrator);
export type JointFabricAdministratorCluster = JointFabricAdministrator.Cluster;
export const JointFabricAdministratorCluster = JointFabricAdministrator.Cluster;
export interface JointFabricAdministrator extends ClusterTyping { Attributes: JointFabricAdministrator.Attributes; Commands: JointFabricAdministrator.Commands; Components: JointFabricAdministrator.Components }
