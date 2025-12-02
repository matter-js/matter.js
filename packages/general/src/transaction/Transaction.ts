/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lifetime } from "#util/Lifetime.js";
import { MaybePromise } from "#util/Promises.js";
import { Participant } from "./Participant.js";
import { Resource } from "./Resource.js";
import { ResourceSet } from "./ResourceSet.js";
import { Status } from "./Status.js";
import { open } from "./Tx.js";

/**
 * Two-phase commit implementation.
 *
 * Transactions are either shared (for reads) or exclusive (for writes). Exclusive transactions do not block shared
 * transactions but state updates will not be visible until the transaction completes.
 *
 * Writes do block other writes.  Transactions start automatically when a write occurs.  Since this usually happens
 * synchronously, the best Matter.js can do is throw an error if two write transactions would conflict.  However, you
 * can avoid this by using {@link begin} which will wait for other transactions to complete before acquiring resource
 * locks.
 *
 * Persistence is implemented by a list of participants.  Commits are two phase.  If an error throws in phase one all
 * participants roll back. An error in phase 2 could result in data inconsistency.
 *
 * TODO - does prevent deadlock but we should probably add a timeout for resource locking
 */
export interface Transaction extends Lifetime.Owner {
    /**
     * Diagnostic description of the transaction's source.
     */
    readonly via: string;

    /**
     * The {@link Transaction.IsolationLevel} of this transaction.
     */
    readonly isolation: Transaction.IsolationLevel;

    /**
     * The status of the transaction.
     */
    readonly status: Status;

    /**
     * Transaction participants.
     */
    readonly participants: Set<Participant>;

    /**
     * Resources addressed by the participants.
     */
    readonly resources: Set<Resource>;

    /**
     * The transactions currently blocking this transaction, if any.
     */
    readonly waitingOn: Iterable<Transaction> | undefined;

    /**
     * Listen for transaction commit or roll back.  This may occur more than once for a given transaction.
     */
    onShared(actor: () => void, once?: boolean): void;

    /**
     * Listen for {@link Transaction.status} close.
     */
    onClose(actor: () => void): void;

    /**
     * Add {@link Resources} to the transaction.
     *
     * If the transaction is exclusive (writing) the transaction will acquire the lock on each {@link ResourceType},
     * waiting for other writers to finish if necessary.
     */
    addResources(...resources: Resource[]): Promise<void>;

    /**
     * Add {@link ResourceType}s to the transaction synchronously.
     *
     * Unlike {@link addResources}, this method will throw an error if the transaction is exclusive and the resources
     * cannot be locked.
     */
    addResourcesSync(...resources: Resource[]): void;

    /**
     * Begin an exclusive transaction.
     *
     * Transactions begin automatically on write but there are a few reasons you may want to use this method to start an
     * exclusive transaction explicitly:
     *
     *   1. Automatic transactions are started in a synchronous context so conflicting transactions will throw an error.
     *      If you start a transaction, your code will await any transaction that would otherwise throw an error.
     *
     *   2. Transaction isolation means your view of data may become stale if a write occurs in another transaction.
     *      Once you start a transaction you block other writers so can be assured you're dealing with newest state.
     *
     *   3. Say transaction A has an exclusive lock on resource 1 and awaits resource 2.  Transaction B has an exclusive
     *      lock on resource 2. Transaction B cannot then await resource 1 without causing a deadlock.  Matter.js will
     *      detect the deadlock and throw an error. One way to prevent this is to begin a transaction and acquire locks
     *      in a specific order.
     *
     * None of the issues above are likely and are probably not a concern for your application.  If you do encounter
     * these issues the error message will suggest solutions.
     */
    begin(): Promise<void>;

    /**
     * Begin an exclusive transaction in a synchronous context.
     *
     * Unlike {@link begin}, this method will throw an error if any participant has already joined an exclusive
     * transaction.
     */
    beginSync(): void;

    /**
     * Add {@link ParticipantType}s to the transaction.
     */
    addParticipants(...participants: Participant[]): void;

    /**
     * Retrieve a participant with a specific role.
     */
    getParticipant(role: {}): Participant | undefined;

    /**
     * Commit the transaction.
     *
     * Matter.js commits automatically when an interaction completes.  You may commit manually to publish your changes
     * mid-interaction.
     *
     * After commit an exclusive transaction becomes shared and data references refresh to the most recent value.
     */
    commit(): MaybePromise;

    /**
     * Roll back the transaction.
     *
     * Matter.js rolls back automatically when an interaction fails.  You may roll back manually to undo your changes
     * mid-interaction.
     *
     * After rollback an exclusive transaction becomes shared and data references refresh to the most recent value.
     */
    rollback(): MaybePromise;

    /**
     * Wait for a set of transactions to complete.
     *
     * @param others the set of transactions to await; cleared on return
     */
    waitFor(others: Set<Transaction>): Promise<void>;
}

type StatusType = Status;
type ResourceType = Resource;
type ResourceSetType = ResourceSet;
type ParticipantType = Participant;

export const Transaction = {
    /**
     * Perform a transactional operation.
     *
     * This creates a read/write transaction scoped to the life of an optionally async function call.
     *
     * The transaction will commit automatically if it is exclusive (write mode) after the actor returns.
     *
     * The transaction is destroyed when {@link act} returns.  You will receive an error if you access it after it is
     * destroyed.
     */
    act<T>(
        via: string,
        lifetime: Lifetime.Owner,
        actor: (transaction: Transaction) => MaybePromise<T>,
    ): MaybePromise<T> {
        const tx = open(via, lifetime);

        let result;
        try {
            result = actor(tx);
        } catch (e) {
            return tx.reject(e);
        }

        return tx.resolve(result);
    },

    /**
     * Create a transaction.
     *
     * Transactions must be closed using {@link Finalization#resolve} or {@link Finalization#reject}.
     *
     * When closed the transaction commits automatically if exclusive.
     */
    open(via: string, lifetime: Lifetime.Owner, isolation: Transaction.IsolationLevel = "rw") {
        // This function is replaced below so do not edit
        return open(via, lifetime, isolation);
    },

    Status,

    Resource,

    [Symbol.toStringTag]: "Transaction",
};

// This is functionally equivalent to the definition above but removes a stack frame
Transaction.open = open;

export namespace Transaction {
    export type Status = StatusType;

    export type Resource = ResourceType;

    export type ResourceSet = ResourceSetType;

    export type Participant = ParticipantType;

    export interface Disposable extends Transaction, AsyncDisposable {
        close(): MaybePromise<void>;
    }

    export interface Finalization {
        /**
         * Finish the transaction.  If {@link result} is a promise this may result on commit or rollback.
         */
        resolve<T>(result: T): MaybePromise<Awaited<T>>;

        /**
         * Roll back, close the transaction and throw an error.
         */
        reject(cause: unknown): MaybePromise<never>;
    }

    export type IsolationLevel =
        /**
         * Transaction reads only committed and may enter exclusive (write) mode.
         */
        | "rw"

        /**
         * Transaction is read-only but updates are visible after commit.
         */
        | "ro"

        /**
         * Transaction is read-only and data remains at version of first access.
         */
        | "snapshot";
}
