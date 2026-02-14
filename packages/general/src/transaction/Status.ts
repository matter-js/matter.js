/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogLevel } from "#log/LogLevel.js";
import { Millis } from "#time/TimeUnit.js";
import { TransactionFlowError } from "./errors.js";
import type { Transaction } from "./Transaction.js";

/**
 * The lifecycle of a transaction adheres to the following discrete stages.
 */
export enum Status {
    /**
     * Transaction may be used only for read operations.
     */
    ReadOnly = "read only",

    /**
     * Transaction is registered but there are no ACID guarantees.
     */
    Shared = "shared",

    /**
     * Transaction is waiting to obtain exclusive access to resources.
     */
    Waiting = "waiting",

    /**
     * Transaction has exclusive access.  Reads will maintain consistency
     * and writes are allowed.
     */
    Exclusive = "exclusive",

    /**
     * Transaction is in the process of committing, phase one.
     */
    CommittingPhaseOne = "committing phase one",

    /**
     * Transaction is in the process of committing, phase two.
     */
    CommittingPhaseTwo = "committing phase two",

    /**
     * Transaction is in the process of rolling back.
     */
    RollingBack = "rolling back",

    /**
     * Transaction is destroyed, no further operations permitted.
     */
    Destroyed = "destroyed",
}

export namespace Status {
    export function assert(transaction: Transaction, acceptable: Status[], target: Status) {
        if (!acceptable.includes(transaction.status)) {
            throw new TransactionFlowError(
                `Cannot transition transaction from ${formatStatus(transaction.status)} to ${formatStatus(target)}`,
            );
        }
    }

    export function formatStatus(status: Status) {
        return `<${status}>`;
    }

    /**
     * If an asynchronous transaction holds an exclusive (write) lock for an extended period it will write details of
     * the lock to the log.  Set this value to configure the length of the reporting window.
     *
     * A value of 0 forces lock reports for all async transactions; a negative value disables reporting.
     */
    // oxlint-disable-next-line prefer-const
    export let slowTransactionTime = Millis(200);

    /**
     * The log level for slow transaction reporting.
     */
    // oxlint-disable-next-line prefer-const
    export let slowLogLevel = LogLevel.INFO;
}
