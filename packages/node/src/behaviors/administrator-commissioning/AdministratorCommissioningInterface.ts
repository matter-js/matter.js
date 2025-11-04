/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { AdministratorCommissioning } from "#clusters/administrator-commissioning";

export namespace AdministratorCommissioningInterface {
    export interface Base {
        /**
         * This command is used by a current Administrator to instruct a Node to go into commissioning mode. The
         * Enhanced Commissioning Method specifies a window of time during which an already commissioned Node accepts
         * PASE sessions. The current Administrator MUST specify a timeout value for the duration of the
         * OpenCommissioningWindow command.
         *
         * When the OpenCommissioningWindow command expires or commissioning completes, the Node shall remove the
         * Passcode by deleting the PAKE passcode verifier as well as stop publishing the DNS-SD record corresponding to
         * this command as described in Section 4.3.1, “Commissionable Node Discovery”. The commissioning into a new
         * Fabric completes when the Node successfully receives a CommissioningComplete command, see Section 5.5,
         * “Commissioning Flows”.
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
         * If a commissioning window is already currently open, this command shall fail with a cluster specific status
         * code of Busy.
         *
         * If the fail-safe timer is currently armed, this command shall fail with a cluster specific status code of
         * Busy, since it is likely that concurrent commissioning operations from multiple separate Commissioners are
         * about to take place.
         *
         * In case of any other parameter error, this command shall fail with a status code of COMMAND_INVALID.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.1
         */
        openCommissioningWindow(request: AdministratorCommissioning.OpenCommissioningWindowRequest): MaybePromise;

        /**
         * This command is used by a current Administrator to instruct a Node to revoke any active
         * OpenCommissioningWindow or OpenBasicCommissioningWindow command. This is an idempotent command and the Node
         * shall (for ECM) delete the temporary PAKEPasscodeVerifier and associated data, and stop publishing the DNS-SD
         * record associated with the OpenCommissioningWindow or OpenBasicCommissioningWindow command, see Section
         * 4.3.1, “Commissionable Node Discovery”.
         *
         * If no commissioning window was open at time of receipt, this command shall fail with a cluster specific
         * status code of WindowNotOpen.
         *
         * If the commissioning window was open and the fail-safe was armed when this command is received, the device
         * shall immediately expire the fail-safe and perform the cleanup steps outlined in Section 11.10.7.2.2,
         * “Behavior on expiry of Fail-Safe timer”.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.3
         */
        revokeCommissioning(): MaybePromise;
    }

    export interface Basic {
        /**
         * This command may be used by a current Administrator to instruct a Node to go into commissioning mode, if the
         * node supports the Basic Commissioning Method. The Basic Commissioning Method specifies a window of time
         * during which an already commissioned Node accepts PASE sessions. The current Administrator shall specify a
         * timeout value for the duration of the OpenBasicCommissioningWindow command.
         *
         * If a commissioning window is already currently open, this command shall fail with a cluster specific status
         * code of Busy.
         *
         * If the fail-safe timer is currently armed, this command shall fail with a cluster specific status code of
         * Busy, since it is likely that concurrent commissioning operations from multiple separate Commissioners are
         * about to take place.
         *
         * In case of any other parameter error, this command shall fail with a status code of COMMAND_INVALID.
         *
         * The commissioning into a new Fabric completes when the Node successfully receives a CommissioningComplete
         * command, see Section 5.5, “Commissioning Flows”. The new Administrator shall discover the Node on the IP
         * network using DNS-based Service Discovery (DNS-SD) for commissioning.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.19.8.2
         */
        openBasicCommissioningWindow(request: AdministratorCommissioning.OpenBasicCommissioningWindowRequest): MaybePromise;
    }
}

export type AdministratorCommissioningInterface = {
    components: [
        { flags: {}, methods: AdministratorCommissioningInterface.Base },
        { flags: { basic: true }, methods: AdministratorCommissioningInterface.Basic }
    ]
};
