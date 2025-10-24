/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "#model";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvEnum, TlvUInt16, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace JointFabricAdministrator {
    /**
     * This command shall be generated in response to a ICACCSRRequest command. Check ICAC Cross Signing for details
     * about the generation of the ICACCSR.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.2
     */
    export const TlvIcaccsrResponse = TlvObject({
        /**
         * This field shall be a DER-encoded octet string of a properly encoded PKCS #10 Certificate Signing Request
         * (CSR).
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.2.1
         */
        icaccsr: TlvField(0, TlvByteString.bound({ maxLength: 600 }))
    });

    /**
     * This command shall be generated in response to a ICACCSRRequest command. Check ICAC Cross Signing for details
     * about the generation of the ICACCSR.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.2
     */
    export interface IcaccsrResponse extends TypeFromSchema<typeof TlvIcaccsrResponse> {}

    /**
     * Input to the JointFabricAdministrator addIcac command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.3
     */
    export const TlvAddIcacRequest = TlvObject({
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
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.3.1
         */
        icacValue: TlvField(1, TlvByteString.bound({ maxLength: 400 }))
    });

    /**
     * Input to the JointFabricAdministrator addIcac command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.3
     */
    export interface AddIcacRequest extends TypeFromSchema<typeof TlvAddIcacRequest> {}

    /**
     * This enumeration is used by the ICACResponse command to convey the outcome of this cluster’s operations.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.4.1
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
     * This command shall be generated in response to the AddICAC command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.4
     */
    export const TlvIcacResponse = TlvObject({
        /**
         * This field shall contain an ICACResponseStatusEnum value representing the status of the AddICAC operation.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.4.1
         */
        statusCode: TlvField(0, TlvEnum<IcacResponseStatus>())
    });

    /**
     * This command shall be generated in response to the AddICAC command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.4
     */
    export interface IcacResponse extends TypeFromSchema<typeof TlvIcacResponse> {}

    /**
     * Input to the JointFabricAdministrator openJointCommissioningWindow command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.5
     */
    export const TlvOpenJointCommissioningWindowRequest = TlvObject({
        commissioningTimeout: TlvField(0, TlvUInt16),
        pakePasscodeVerifier: TlvField(1, TlvByteString.bound({ length: 97 })),
        discriminator: TlvField(2, TlvUInt16.bound({ max: 4095 })),
        iterations: TlvField(3, TlvUInt32.bound({ min: 1000, max: 100000 })),
        salt: TlvField(4, TlvByteString.bound({ minLength: 16, maxLength: 32 }))
    });

    /**
     * Input to the JointFabricAdministrator openJointCommissioningWindow command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.5
     */
    export interface OpenJointCommissioningWindowRequest extends TypeFromSchema<typeof TlvOpenJointCommissioningWindowRequest> {}

    /**
     * This enumeration is used by the TransferAnchorResponse command to convey the detailed outcome of this cluster’s
     * TransferAnchorRequest command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.4.2
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
     * This command shall be generated in response to the Transfer Anchor Request command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.7
     */
    export const TlvTransferAnchorResponse = TlvObject({
        statusCode: TlvField(0, TlvEnum<TransferAnchorResponseStatus>())
    });

    /**
     * This command shall be generated in response to the Transfer Anchor Request command.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.7
     */
    export interface TransferAnchorResponse extends TypeFromSchema<typeof TlvTransferAnchorResponse> {}

    /**
     * Input to the JointFabricAdministrator announceJointFabricAdministrator command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.9
     */
    export const TlvAnnounceJointFabricAdministratorRequest = TlvObject({ endpointId: TlvField(0, TlvEndpointNumber) });

    /**
     * Input to the JointFabricAdministrator announceJointFabricAdministrator command
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25.7.9
     */
    export interface AnnounceJointFabricAdministratorRequest extends TypeFromSchema<typeof TlvAnnounceJointFabricAdministratorRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.25.5.1
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
     * @see {@link MatterSpecification.v141.Core} § 11.25.5.1
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
     * @see {@link MatterSpecification.v141.Core} § 11.25.5.1
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
     * @see {@link MatterSpecification.v141.Core} § 11.25.5.1
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
     * @see {@link MatterSpecification.v141.Core} § 11.25.5.1
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
     * @see {@link MatterSpecification.v141.Core} § 11.25.5.1
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

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x753,
        name: "JointFabricAdministrator",
        revision: 1,

        attributes: {
            /**
             * The AdministratorFabricIndex attribute shall indicate the FabricIndex from the Endpoint 0’s Operational
             * Cluster Fabrics attribute (i.e. the Fabric Table) which is associated with the JointFabric. This field
             * shall have the value of null if there is no fabric associated with the JointFabric.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.25.6.1
             */
            administratorFabricIndex: WritableAttribute(
                0x0,
                TlvNullable(TlvFabricIndex),
                { readAcl: AccessLevel.Administer, writeAcl: AccessLevel.Administer }
            )
        },

        commands: {
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
             * @see {@link MatterSpecification.v141.Core} § 11.25.7.1
             */
            icaccsrRequest: Command(
                0x0,
                TlvNoArguments,
                0x1,
                TlvIcaccsrResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

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
             * @see {@link MatterSpecification.v141.Core} § 11.25.7.3
             */
            addIcac: Command(0x2, TlvAddIcacRequest, 0x3, TlvIcacResponse, { invokeAcl: AccessLevel.Administer }),

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
             * @see {@link MatterSpecification.v141.Core} § 11.25.7.5
             */
            openJointCommissioningWindow: Command(
                0x4,
                TlvOpenJointCommissioningWindowRequest,
                0x4,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall be sent by a candidate Joint Fabric Anchor Administrator to the current Joint Fabric
             * Anchor Administrator to request transfer of the Anchor Fabric.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.25.7.6
             */
            transferAnchorRequest: Command(
                0x5,
                TlvNoArguments,
                0x6,
                TlvTransferAnchorResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall indicate the completion of the transfer of the Anchor Fabric to another Joint Fabric
             * Ecosystem Administrator.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.25.7.8
             */
            transferAnchorComplete: Command(
                0x7,
                TlvNoArguments,
                0x7,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            ),

            /**
             * This command shall be used for communicating to client the endpoint that holds the Joint Fabric
             * Administrator Cluster.
             *
             * ### This field shall contain the unique identifier for the endpoint that holds the Joint Fabric
             * Administrator Cluster.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.25.7.9
             */
            announceJointFabricAdministrator: Command(
                0x8,
                TlvAnnounceJointFabricAdministratorRequest,
                0x8,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * An instance of the Joint Fabric Administrator Cluster only applies to Joint Fabric Administrator nodes fulfilling
     * the role of Anchor CA.
     *
     * NOTE Support for Joint Fabric Administrator Cluster is provisional.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.25
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type JointFabricAdministratorCluster = JointFabricAdministrator.Cluster;
export const JointFabricAdministratorCluster = JointFabricAdministrator.Cluster;
ClusterRegistry.register(JointFabricAdministrator.Complete);
