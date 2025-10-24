/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { JointFabricAdministrator } from "#clusters/joint-fabric-administrator";

export namespace JointFabricAdministratorInterface {
    export interface Base {
        /**
         * This command shall be generated during Joint Commissioning Method and subsequently be responded in the form
         * of an ICACCSRResponse command.
         *
         * If this command is received without an armed fail-safe context (see Section 11.10.7.2, “ArmFailSafe
         * Command”), then this command shall fail with a FAILSAFE_REQUIRED status code sent back to the initiator.
         *
         * If this command is received from a peer against FabricFabric Table Vendor ID Verification Procedure hasn’t
         * been executed then it shall fail with a JfVidNotVerified status code sent back to the initiator.
         *
         * If a prior AddICAC command was successfully executed within the fail-safe timer period, then this command
         * shall fail with a CONSTRAINT_ERROR status code sent back to the initiator.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.1
         */
        icaccsrRequest(): MaybePromise<JointFabricAdministrator.IcaccsrResponse>;

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
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.3
         */
        addIcac(request: JointFabricAdministrator.AddIcacRequest): MaybePromise<JointFabricAdministrator.IcacResponse>;

        /**
         * > [!NOTE]
         *
         * > This is an alias onto the OpenCommissioningWindow command within the Joint Fabric Administrator Cluster.
         *   Refer to the OpenCommissioningWindow command for a description of the command behavior and parameters.
         *
         * This command shall fail with a InvalidAdministratorFabricIndex status code sent back to the initiator if the
         * AdministratorFabricIndex field has the value of null.
         *
         * The parameters for OpenJointCommissioningWindow command are as follows:
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.5
         */
        openJointCommissioningWindow(request: JointFabricAdministrator.OpenJointCommissioningWindowRequest): MaybePromise;

        /**
         * This command shall be sent by a candidate Joint Fabric Anchor Administrator to the current Joint Fabric
         * Anchor Administrator to request transfer of the Anchor Fabric.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.6
         */
        transferAnchorRequest(): MaybePromise<JointFabricAdministrator.TransferAnchorResponse>;

        /**
         * This command shall indicate the completion of the transfer of the Anchor Fabric to another Joint Fabric
         * Ecosystem Administrator.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.8
         */
        transferAnchorComplete(): MaybePromise;

        /**
         * This command shall be used for communicating to client the endpoint that holds the Joint Fabric Administrator
         * Cluster.
         *
         * ### This field shall contain the unique identifier for the endpoint that holds the Joint Fabric Administrator
         * Cluster.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.25.7.9
         */
        announceJointFabricAdministrator(request: JointFabricAdministrator.AnnounceJointFabricAdministratorRequest): MaybePromise;
    }
}

export type JointFabricAdministratorInterface = {
    components: [{ flags: {}, methods: JointFabricAdministratorInterface.Base }]
};
