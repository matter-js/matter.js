/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReceivedStatusResponseError, Status, StatusResponseError } from "@matter/types";

/**
 * The status of one entry in an interaction result.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.10
 */
export interface ResultStatus {
    status: Status;
    clusterStatus?: number;

    /**
     * Set when the status was decoded from the peer's response.  Statuses matter.js produces itself leave it unset, so
     * a status not known to come from the peer never reads as the peer's.
     */
    received?: true;
}

export namespace ResultStatus {
    /**
     * The error for a status: a {@link ReceivedStatusResponseError} if the peer sent it, a local
     * {@link StatusResponseError} otherwise.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.10
     */
    export function errorOf({ status, clusterStatus, received }: ResultStatus, message?: string): StatusResponseError {
        const family = received ? ReceivedStatusResponseError : StatusResponseError;
        return family.create(status, message, clusterStatus);
    }
}
