/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "#util/Promises.js";

/**
 * Components with support for transactionality implement this interface.
 */
export interface Participant {
    /**
     * Description used in error messages.
     */
    toString(): string;

    /**
     * The "role" of a participant is an optional key you may use to retrieve
     * a participant from the transaction.
     */
    role?: {};

    /**
     * Pre-commit logic.
     *
     * Pre-commit logic returns a boolean indicating whether it performed an action that affects state.  The transaction
     * will cycle through participants continuously until all participants return false.
     *
     * Thus `preCommit` implementations must be stateful and expect to be invoked more than once for a single
     * transaction.
     */
    preCommit?: () => MaybePromise<boolean>;

    /**
     * Commit phase one.
     */
    commit1?: () => MaybePromise;

    /**
     * Commit phase two.
     */
    commit2?: () => MaybePromise;

    /**
     * Post-commit logic.
     */
    postCommit?: () => MaybePromise;

    /**
     * Drop isolated writes and revert to original canonical source.
     */
    rollback?: () => MaybePromise;
}
