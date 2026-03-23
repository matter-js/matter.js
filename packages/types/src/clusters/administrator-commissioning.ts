/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FabricIndex } from "../datatype/FabricIndex.js";
import { VendorId } from "../datatype/VendorId.js";
import { MaybePromise, Bytes } from "@matter/general";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { AdministratorCommissioning as AdministratorCommissioningModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the AdministratorCommissioning cluster.
 */
export namespace AdministratorCommissioning {
    /**
     * {@link AdministratorCommissioning} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates whether a new Commissioning window has been opened by an Administrator, using either the
             * OpenCommissioningWindow command or the OpenBasicCommissioningWindow command.
             *
             * This attribute shall revert to WindowNotOpen upon expiry of a commissioning window.
             *
             * > [!NOTE]
             *
             * > An initial commissioning window is not opened using either the OpenCommissioningWindow command or the
             *   OpenBasicCommissioningWindow command, and therefore this attribute shall be set to WindowNotOpen on
             *   initial commissioning.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.19.7.1
             */
            readonly windowStatus: CommissioningWindowStatus;

            /**
             * When the WindowStatus attribute is not set to WindowNotOpen, this attribute shall indicate the
             * FabricIndex associated with the Fabric scoping of the Administrator that opened the window. This may be
             * used to cross-reference in the Fabrics attribute of the Operational Credentials cluster.
             *
             * If, during an open commissioning window, the fabric for the Administrator that opened the window is
             * removed, then this attribute shall be set to null.
             *
             * When the WindowStatus attribute is set to WindowNotOpen, this attribute shall be set to null.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.19.7.2
             */
            readonly adminFabricIndex: FabricIndex | null;

            /**
             * When the WindowStatus attribute is not set to WindowNotOpen, this attribute shall indicate the Vendor ID
             * associated with the Fabric scoping of the Administrator that opened the window. This field shall match
             * the VendorID field of the Fabrics attribute list entry associated with the Administrator having opened
             * the window, at the time of window opening. If the fabric for the Administrator that opened the window is
             * removed from the node while the commissioning window is still open, this attribute shall NOT be updated.
             *
             * When the WindowStatus attribute is set to WindowNotOpen, this attribute shall be set to null.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.19.7.3
             */
            readonly adminVendorId: VendorId | null;
        }

        export interface Commands {
            /**
             * This command is used by a current Administrator to instruct a Node to go into commissioning mode. The
             * Enhanced Commissioning Method specifies a window of time during which an already commissioned Node
             * accepts PASE sessions. The current Administrator MUST specify a timeout value for the duration of the
             * OpenCommissioningWindow command.
             *
             * When the OpenCommissioningWindow command expires or commissioning completes, the Node shall remove the
             * Passcode by deleting the PAKE passcode verifier as well as stop publishing the DNS-SD record
             * corresponding to this command as described in Section 4.3.1, “Commissionable Node Discovery”. The
             * commissioning into a new Fabric completes when the Node successfully receives a CommissioningComplete
             * command, see Section 5.5, “Commissioning Flows”.
             *
             * The parameters for OpenCommissioningWindow command are as follows:
             *
             * A current Administrator may invoke this command to put a node in commissioning mode for the next
             * Administrator. On completion, the command shall return a cluster specific status code from the Section
             * 11.19.6, “Status Codes” below reflecting success or reasons for failure of the operation. The new
             * Administrator shall discover the Node on the IP network using DNS-based Service Discovery (DNS-SD) for
             * commissioning.
             *
             * If any format or validity errors related to the PAKEPasscodeVerifier, Iterations or Salt arguments arise,
             * this command shall fail with a cluster specific status code of PAKEParameterError.
             *
             * If a commissioning window is already currently open, this command shall fail with a cluster specific
             * status code of Busy.
             *
             * If the fail-safe timer is currently armed, this command shall fail with a cluster specific status code of
             * Busy, since it is likely that concurrent commissioning operations from multiple separate Commissioners
             * are about to take place.
             *
             * In case of any other parameter error, this command shall fail with a status code of COMMAND_INVALID.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.19.8.1
             */
            openCommissioningWindow(request: OpenCommissioningWindowRequest): MaybePromise;

            /**
             * This command is used by a current Administrator to instruct a Node to revoke any active
             * OpenCommissioningWindow or OpenBasicCommissioningWindow command. This is an idempotent command and the
             * Node shall (for ECM) delete the temporary PAKEPasscodeVerifier and associated data, and stop publishing
             * the DNS-SD record associated with the OpenCommissioningWindow or OpenBasicCommissioningWindow command,
             * see Section 4.3.1, “Commissionable Node Discovery”.
             *
             * If no commissioning window was open at time of receipt, this command shall fail with a cluster specific
             * status code of WindowNotOpen.
             *
             * If the commissioning window was open and the fail-safe was armed when this command is received, the
             * device shall immediately expire the fail-safe and perform the cleanup steps outlined in Section
             * 11.10.7.2.2, “Behavior on expiry of Fail-Safe timer”.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.19.8.3
             */
            revokeCommissioning(): MaybePromise;
        }
    }

    /**
     * {@link AdministratorCommissioning} supports these elements if it supports feature "Basic".
     */
    export namespace BasicComponent {
        export interface Commands {
            /**
             * This command may be used by a current Administrator to instruct a Node to go into commissioning mode, if
             * the node supports the Basic Commissioning Method. The Basic Commissioning Method specifies a window of
             * time during which an already commissioned Node accepts PASE sessions. The current Administrator shall
             * specify a timeout value for the duration of the OpenBasicCommissioningWindow command.
             *
             * If a commissioning window is already currently open, this command shall fail with a cluster specific
             * status code of Busy.
             *
             * If the fail-safe timer is currently armed, this command shall fail with a cluster specific status code of
             * Busy, since it is likely that concurrent commissioning operations from multiple separate Commissioners
             * are about to take place.
             *
             * In case of any other parameter error, this command shall fail with a status code of COMMAND_INVALID.
             *
             * The commissioning into a new Fabric completes when the Node successfully receives a CommissioningComplete
             * command, see Section 5.5, “Commissioning Flows”. The new Administrator shall discover the Node on the IP
             * network using DNS-based Service Discovery (DNS-SD) for commissioning.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.19.8.2
             */
            openBasicCommissioningWindow(request: OpenBasicCommissioningWindowRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link AdministratorCommissioning}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates whether a new Commissioning window has been opened by an Administrator, using either the
         * OpenCommissioningWindow command or the OpenBasicCommissioningWindow command.
         *
         * This attribute shall revert to WindowNotOpen upon expiry of a commissioning window.
         *
         * > [!NOTE]
         *
         * > An initial commissioning window is not opened using either the OpenCommissioningWindow command or the
         *   OpenBasicCommissioningWindow command, and therefore this attribute shall be set to WindowNotOpen on initial
         *   commissioning.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.7.1
         */
        readonly windowStatus: CommissioningWindowStatus;

        /**
         * When the WindowStatus attribute is not set to WindowNotOpen, this attribute shall indicate the FabricIndex
         * associated with the Fabric scoping of the Administrator that opened the window. This may be used to
         * cross-reference in the Fabrics attribute of the Operational Credentials cluster.
         *
         * If, during an open commissioning window, the fabric for the Administrator that opened the window is removed,
         * then this attribute shall be set to null.
         *
         * When the WindowStatus attribute is set to WindowNotOpen, this attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.7.2
         */
        readonly adminFabricIndex: FabricIndex | null;

        /**
         * When the WindowStatus attribute is not set to WindowNotOpen, this attribute shall indicate the Vendor ID
         * associated with the Fabric scoping of the Administrator that opened the window. This field shall match the
         * VendorID field of the Fabrics attribute list entry associated with the Administrator having opened the
         * window, at the time of window opening. If the fabric for the Administrator that opened the window is removed
         * from the node while the commissioning window is still open, this attribute shall NOT be updated.
         *
         * When the WindowStatus attribute is set to WindowNotOpen, this attribute shall be set to null.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.7.3
         */
        readonly adminVendorId: VendorId | null;
    }

    export interface Commands extends Base.Commands, BasicComponent.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { basic: true }, commands: BasicComponent.Commands }
    ];
    export type Features = "Basic";

    /**
     * These are optional features supported by AdministratorCommissioningCluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.19.4
     */
    export enum Feature {
        /**
         * Basic (BC)
         *
         * Node supports Basic Commissioning Method.
         */
        Basic = "Basic"
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.19.5.1
     */
    export enum CommissioningWindowStatus {
        /**
         * Commissioning window not open
         */
        WindowNotOpen = 0,

        /**
         * An Enhanced Commissioning Method window is open
         */
        EnhancedWindowOpen = 1,

        /**
         * A Basic Commissioning Method window is open
         */
        BasicWindowOpen = 2
    }

    /**
     * This command is used by a current Administrator to instruct a Node to go into commissioning mode. The Enhanced
     * Commissioning Method specifies a window of time during which an already commissioned Node accepts PASE sessions.
     * The current Administrator MUST specify a timeout value for the duration of the OpenCommissioningWindow command.
     *
     * When the OpenCommissioningWindow command expires or commissioning completes, the Node shall remove the Passcode
     * by deleting the PAKE passcode verifier as well as stop publishing the DNS-SD record corresponding to this command
     * as described in Section 4.3.1, “Commissionable Node Discovery”. The commissioning into a new Fabric completes
     * when the Node successfully receives a CommissioningComplete command, see Section 5.5, “Commissioning Flows”.
     *
     * The parameters for OpenCommissioningWindow command are as follows:
     *
     * A current Administrator may invoke this command to put a node in commissioning mode for the next Administrator.
     * On completion, the command shall return a cluster specific status code from the Section 11.19.6, “Status Codes”
     * below reflecting success or reasons for failure of the operation. The new Administrator shall discover the Node
     * on the IP network using DNS-based Service Discovery (DNS-SD) for commissioning.
     *
     * If any format or validity errors related to the PAKEPasscodeVerifier, Iterations or Salt arguments arise, this
     * command shall fail with a cluster specific status code of PAKEParameterError.
     *
     * If a commissioning window is already currently open, this command shall fail with a cluster specific status code
     * of Busy.
     *
     * If the fail-safe timer is currently armed, this command shall fail with a cluster specific status code of Busy,
     * since it is likely that concurrent commissioning operations from multiple separate Commissioners are about to
     * take place.
     *
     * In case of any other parameter error, this command shall fail with a status code of COMMAND_INVALID.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.19.8.1
     */
    export interface OpenCommissioningWindowRequest {
        /**
         * This field shall specify the time in seconds during which commissioning session establishment is allowed by
         * the Node. This timeout value shall follow guidance as specified in the initial Announcement Duration. The
         * CommissioningTimeout applies only to cessation of any announcements and to accepting of new commissioning
         * sessions; it does not apply to abortion of connections, i.e., a commissioning session SHOULD NOT abort
         * prematurely upon expiration of this timeout.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.1.1
         */
        commissioningTimeout: number;

        /**
         * This field shall specify an ephemeral PAKE passcode verifier (see Section 3.10, “Password-Authenticated Key
         * Exchange (PAKE)”) computed by the existing Administrator to be used for this commissioning. The field is
         * concatenation of two values (w0 || L) shall be (CRYPTO_GROUP_SIZE_BYTES +
         * CRYPTO_PUBLIC_KEY_SIZE_BYTES)-octets long as detailed in Crypto_PAKEValues_Responder. It shall be derived
         * from an ephemeral passcode (See PAKE). It shall be deleted by the Node at the end of commissioning or
         * expiration of the OpenCommissioningWindow command, and shall be deleted by the existing Administrator after
         * sending it to the Node(s).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.1.2
         */
        pakePasscodeVerifier: Bytes;

        /**
         * This field shall be used by the Node as the long discriminator for DNS-SD advertisement (see Section 4.3.1.5,
         * “TXT key for discriminator (D)”) for discovery by the new Administrator. The new Administrator can find and
         * filter DNS-SD records by long discriminator to locate and initiate commissioning with the appropriate Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.1.3
         */
        discriminator: number;

        /**
         * This field shall be used by the Node as the PAKE iteration count associated with the ephemeral PAKE passcode
         * verifier to be used for this commissioning, which shall be sent by the Node to the new Administrator’s
         * software as response to the PBKDFParamRequest during PASE negotiation. The permitted range of values shall
         * match the range specified in Section 3.9, “Password-Based Key Derivation Function (PBKDF)”, within the
         * definition of the Crypto_PBKDFParameterSet.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.1.4
         */
        iterations: number;

        /**
         * This field shall be used by the Node as the PAKE Salt associated with the ephemeral PAKE passcode verifier to
         * be used for this commissioning, which shall be sent by the Node to the new Administrator’s software as
         * response to the PBKDFParamRequest during PASE negotiation. The constraints on the value shall match those
         * specified in Section 3.9, “Password-Based Key Derivation Function (PBKDF)”, within the definition of the
         * Crypto_PBKDFParameterSet.
         *
         * When a Node receives the OpenCommissioningWindow command, it shall begin advertising on DNS-SD as described
         * in Section 4.3.1, “Commissionable Node Discovery” and for a time period as described in CommissioningTimeout.
         *
         * When the command is received by a ICD, it shall enter into active mode. The ICD shall remain in Active Mode
         * as long as one of these conditions is met:
         *
         *   - A commissioning window is open.
         *
         *   - There is an armed fail-safe timer.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.1.5
         */
        salt: Bytes;
    }

    /**
     * This command may be used by a current Administrator to instruct a Node to go into commissioning mode, if the node
     * supports the Basic Commissioning Method. The Basic Commissioning Method specifies a window of time during which
     * an already commissioned Node accepts PASE sessions. The current Administrator shall specify a timeout value for
     * the duration of the OpenBasicCommissioningWindow command.
     *
     * If a commissioning window is already currently open, this command shall fail with a cluster specific status code
     * of Busy.
     *
     * If the fail-safe timer is currently armed, this command shall fail with a cluster specific status code of Busy,
     * since it is likely that concurrent commissioning operations from multiple separate Commissioners are about to
     * take place.
     *
     * In case of any other parameter error, this command shall fail with a status code of COMMAND_INVALID.
     *
     * The commissioning into a new Fabric completes when the Node successfully receives a CommissioningComplete
     * command, see Section 5.5, “Commissioning Flows”. The new Administrator shall discover the Node on the IP network
     * using DNS-based Service Discovery (DNS-SD) for commissioning.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.19.8.2
     */
    export interface OpenBasicCommissioningWindowRequest {
        /**
         * This field shall specify the time in seconds during which commissioning session establishment is allowed by
         * the Node. This timeout shall follow guidance as specified in the initial Announcement Duration.
         *
         * When a Node receives the OpenBasicCommissioningWindow command, it shall begin advertising on DNS-SD as
         * described in Section 4.3.1, “Commissionable Node Discovery” and for a time period as described in
         * CommissioningTimeout. When the command is received by a ICD, it shall enter into active mode. The ICD shall
         * remain in Active Mode as long as one of these conditions is met:
         *
         *   - A commissioning window is open.
         *
         *   - There is an armed fail-safe timer.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.2.1
         */
        commissioningTimeout: number;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.19.6.1
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
        WindowNotOpen = 4
    }

    /**
     * Thrown for cluster status code {@link StatusCode.Busy}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.19.6.1
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
     * @see {@link MatterSpecification.v142.Core} § 11.19.6.1
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
     * @see {@link MatterSpecification.v142.Core} § 11.19.6.1
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

    export const id = ClusterId(0x3c);
    export const name = "AdministratorCommissioning" as const;
    export const revision = 1;
    export const schema = AdministratorCommissioningModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof AdministratorCommissioning;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `AdministratorCommissioning` instead of
     * `AdministratorCommissioning.Complete`)
     */
    export type Complete = typeof AdministratorCommissioning;

    export declare const Complete: Complete;
    export declare const Typing: AdministratorCommissioning;
}

ClusterNamespace.define(AdministratorCommissioning);
export type AdministratorCommissioningCluster = AdministratorCommissioning.Cluster;
export const AdministratorCommissioningCluster = AdministratorCommissioning.Cluster;
export interface AdministratorCommissioning extends ClusterTyping { Attributes: AdministratorCommissioning.Attributes; Commands: AdministratorCommissioning.Commands; Features: AdministratorCommissioning.Features; Components: AdministratorCommissioning.Components }
