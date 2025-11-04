/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { CommissionerControl } from "#clusters/commissioner-control";

export namespace CommissionerControlInterface {
    export interface Base {
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
        requestCommissioningApproval(request: CommissionerControl.RequestCommissioningApprovalRequest): MaybePromise;

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
        commissionNode(request: CommissionerControl.CommissionNodeRequest): MaybePromise<CommissionerControl.ReverseOpenCommissioningWindowResponse>;
    }
}

export type CommissionerControlInterface = { components: [{ flags: {}, methods: CommissionerControlInterface.Base }] };
