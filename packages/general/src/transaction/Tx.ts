/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import { ImplementationError, ReadOnlyError } from "#MatterError.js";
import { Time, Timer } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { Millis } from "#time/TimeUnit.js";
import { asError } from "#util/Error.js";
import { Lifetime } from "#util/Lifetime.js";
import { Observable } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";
import { describeList } from "#util/String.js";
import { FinalizationError, TransactionDestroyedError, TransactionFlowError, UnsettledStateError } from "./errors.js";
import type { Participant } from "./Participant.js";
import type { Resource } from "./Resource.js";
import { ResourceSet } from "./ResourceSet.js";
import { Status } from "./Status.js";
import type { Transaction } from "./Transaction.js";

const logger = Logger.get("Transaction");

// Controls the number of times we will cycle pre-commit handlers waiting for state to settle
const MAX_PRECOMMIT_CYCLES = 5;

// Controls the number of commits that may occur due to mutation in post-commit handlers
const MAX_CHAINED_COMMITS = 5;

/**
 * This is the only public interface to this file.
 */
export function open(
    via: string,
    lifetime: Lifetime.Owner,
    isolation: Transaction.IsolationLevel = "rw",
): Transaction & Transaction.Finalization {
    return new Tx(via, lifetime, isolation);
}

/**
 * The concrete implementation of the Transaction interface.
 */
class Tx implements Transaction, Transaction.Finalization {
    #isolation: Transaction.IsolationLevel;
    #participants = new Set<Participant>();
    #roles = new Map<{}, Participant>();
    #resources = new Set<Resource>();
    #status;
    #waitingOn?: Iterable<Transaction>;
    #via: string;
    #lifetime: Lifetime;
    #shared?: Observable<[]>;
    #closed?: Observable<[]>;
    #isAsync = false;
    #reportingLocks = false;

    constructor(via: string, lifetime: Lifetime.Owner, isolation: Transaction.IsolationLevel) {
        this.#via = Diagnostic.via(via);

        this.#lifetime = lifetime.join("tx", via);
        Object.defineProperties(this.#lifetime.details, {
            status: {
                get: () => this.#status,
                enumerable: true,
            },

            resources: {
                get: () => {
                    if (!this.#resources.size) {
                        return;
                    }

                    return [...this.#resources].join("+");
                },
            },
        });

        this.#isolation = isolation;

        if (isolation === "rw") {
            this.#status = Status.Shared;
        } else {
            this.#status = Status.ReadOnly;
        }
    }

    [Symbol.dispose]() {
        switch (this.status) {
            case Status.ReadOnly:
            case Status.Shared:
            case Status.Destroyed:
                break;

            default:
                logger.error(this.via, "Disposed", this.via, "while", this.status);
                break;
        }

        using _closing = this.#lifetime.closing();
        this.#reset("dropped");
        this.#status = Status.Destroyed;
        this.#closed?.emit();
    }

    get via() {
        return this.#via;
    }

    get isolation() {
        return this.#isolation;
    }

    get status() {
        return this.#status;
    }

    get participants() {
        return this.#participants;
    }

    get resources() {
        return this.#resources;
    }

    get waitingOn() {
        return this.#waitingOn;
    }

    get isAsync(): boolean {
        return this.#isAsync;
    }

    /**
     * We set this during async processing.  This enables the lock reporting when too much time ellapses.
     */
    set isAsync(isAsync: true) {
        // When the transaction is noted as async we start reporting locks.  A further optimization would be to not even
        // acquire locks for synchronous transactions
        if (!this.#isAsync) {
            this.#locksChanged(this.#resources);
        }
        this.#isAsync = isAsync;
    }

    onShared(listener: () => void, once?: boolean) {
        if (this.status === Status.ReadOnly) {
            return;
        }
        if (this.#shared === undefined) {
            this.#shared = Observable();
        }

        this.#shared[once ? "once" : "on"](listener);
    }

    onClose(listener: () => void) {
        if (this.status === Status.ReadOnly) {
            return;
        }
        if (this.status === Status.Destroyed) {
            listener();
        }
        if (this.#closed === undefined) {
            this.#closed = Observable();
        }
        this.#closed.once(listener);
    }

    async addResources(...resources: Resource[]) {
        this.#assertAvailable();

        if (this.#status === Status.Exclusive) {
            const set = new ResourceSet(this, resources);
            const locked = await set.acquireLocks();
            this.#locksChanged(locked);
        }

        this.addResourcesSync(...resources);
    }

    addResourcesSync(...resources: Resource[]) {
        this.#assertAvailable();

        if (this.#status === Status.Exclusive) {
            const set = new ResourceSet(this, resources);
            const locked = set.acquireLocksSync();
            this.#locksChanged(locked);
        } else if (this.#status !== Status.Shared) {
            throw new TransactionFlowError(`Cannot add resources to transaction that is ${this.status}`);
        }

        for (const resource of resources) {
            this.#resources.add(resource);
        }
    }

    async begin() {
        this.#assertAvailable();

        if (this.status === Status.Exclusive) {
            return;
        }
        if (this.status !== Status.Shared) {
            throw new TransactionFlowError(`Cannot begin write transaction because transaction is ${this.#status}`);
        }

        this.#status = Status.Waiting;
        try {
            const resources = new ResourceSet(this, this.#resources);
            const locked = await resources.acquireLocks();
            this.#locksChanged(locked);
            this.#status = Status.Exclusive;
        } catch (e) {
            this.#status = Status.Shared;
            throw e;
        }
    }

    beginSync() {
        this.#assertAvailable();

        if (this.status === Status.Exclusive) {
            return;
        }
        if (this.status !== Status.Shared) {
            throw new TransactionFlowError(`Cannot begin write transaction because transaction is ${this.#status}`);
        }

        this.#status = Status.Exclusive;
        try {
            const resources = new ResourceSet(this, this.#resources);
            const locked = resources.acquireLocksSync();
            this.#locksChanged(locked);
        } catch (e) {
            this.#status = Status.Shared;
            throw e;
        }
    }

    addParticipants(...participants: Participant[]) {
        this.#assertAvailable();

        for (const participant of participants) {
            if (this.#participants.has(participant)) {
                continue;
            }

            // This sanity check uses the participant's diagnostic name to prevent logic errors from installing multiple
            // participants that modify the same data
            if ([...this.#participants].findIndex(p => p.toString() === participant.toString()) !== -1) {
                throw new ImplementationError(`Participant ${participant} identity is not unique`);
            }

            this.#participants.add(participant);

            if (participant.role !== undefined) {
                if (this.#roles.has(participant.role)) {
                    throw new TransactionFlowError(`A participant is already registered for role ${participant.role}`);
                }
                this.#roles.set(participant.role, participant);
            }
        }
    }

    getParticipant(role: {}) {
        this.#assertAvailable();

        return this.#roles.get(role);
    }

    commit() {
        if (this.status === Status.Shared) {
            return this.rollback();
        }

        this.#assertAvailable();

        const result = this.#executeCommitCycle(0);
        if (result) {
            this.isAsync = true;
        }

        return result;
    }

    resolve<T>(result: T): MaybePromise<Awaited<T>> {
        this.#lifetime.closing();

        // If result is a promise, we wait for resolution and then commit (success) or roll back (error)
        if (MaybePromise.is(result)) {
            this.isAsync = true;
            return result.then(this.resolve.bind(this), this.reject.bind(this));
        }

        // Result is not a promise.  Commit immediately
        let promise;
        try {
            promise = this.commit();
        } catch (e) {
            // Commit failed synchronously
            return this.reject(e);
        }

        // If commit is async then wait for commit before destruction
        if (MaybePromise.is(promise)) {
            this.isAsync = true;

            return Promise.resolve(promise)
                .then(() => {
                    this[Symbol.dispose]();
                    return result as Awaited<T>;
                }, this.reject.bind(this))
                .finally(this[Symbol.dispose].bind(this));
        }

        // Result and commit succeeded synchronously
        this[Symbol.dispose]();
        return result as Awaited<T>;
    }

    rollback() {
        this.#assertAvailable();

        return this.#finalize(Status.RollingBack, "rolled back", () => this.#executeRollback());
    }

    reject(cause: unknown): MaybePromise<never> {
        this.#lifetime.closing();

        if (this.#status === Status.Shared) {
            try {
                this.#reset("released");
            } finally {
                this[Symbol.dispose]();
            }
            throw cause;
        }

        logger.error("Rolling back", this.via, "due to error:", Diagnostic.weak(asError(cause).message));

        try {
            const result = this.rollback();
            if (MaybePromise.is(result)) {
                return Promise.resolve(result)
                    .catch(cause2 => {
                        if (cause2 === cause) {
                            return;
                        }

                        // TODO - once SuppressedError support is confirmed solid, consider using it here
                        logger.error("Secondary error in", this.via, "rollback:", cause2);
                    })
                    .finally(() => {
                        this[Symbol.dispose]();
                        throw cause;
                    }) as Promise<never>;
            }
        } catch (cause2) {
            if (cause2 !== cause) {
                logger.error("Secondary error in", this.via, "rollback:", cause2);
            }
        }

        this[Symbol.dispose]();

        throw cause;
    }

    join(...name: unknown[]) {
        if (this.#isolation === "ro") {
            throw new ReadOnlyError();
        }

        return this.#lifetime.join(...name);
    }

    /**
     * Execute commit logic for a single commit cycle.
     *
     * A "cycle" performs all commit logic and normally brings us back to shared state.  But we allow post-commit
     * handlers to re-enter exclusive state.  If that happens, we trigger another commit cycle.
     */
    #executeCommitCycle(count: number): MaybePromise<void> {
        count++;

        if (count > MAX_CHAINED_COMMITS) {
            throw new TransactionFlowError(
                `Transaction commits have cascaded ${count} times which likely indicates an infinite loop`,
            );
        }

        // Precommit first
        let result = this.#createPreCommitExecutor()();

        // Then rest of normal commit
        if (MaybePromise.is(result)) {
            result = result.then(this.#executeCommit.bind(this));
        } else {
            result = this.#executeCommit();
        }

        // Then, if transaction is once again exclusive, recurse
        if (MaybePromise.is(result)) {
            return result.then(() => {
                if (this.#status === Status.Exclusive) {
                    return this.#executeCommitCycle(count);
                }
            });
        } else if (this.#status === Status.Exclusive) {
            return this.#executeCommitCycle(count);
        }
    }

    waitFor(others: Set<Transaction>) {
        this.#assertAvailable();

        if (this.waitingOn) {
            throw new TransactionFlowError("Attempted wait on a transaction that is already waiting");
        }

        logger.log(
            Status.slowLogLevel,
            "Tx",
            this.via,
            "waiting on",
            describeList("and", ...[...others].map(other => other.via)),
        );

        this.#waitingOn = others;
        return new Promise<void>(resolve => {
            for (const other of others) {
                other.onShared(() => {
                    others.delete(other);
                    if (!others.size) {
                        this.#waitingOn = undefined;
                        resolve();
                    }
                }, true);
            }
        }).finally(() => (this.#waitingOn = undefined));
    }

    toString() {
        return `transaction<${this.via}>`;
    }

    treatAsSlow() {
        Monitor.delete(this);
        if (this.#reportingLocks) {
            return;
        }
        this.#reportingLocks = true;
        this.#locksChanged(this.#resources);
    }

    /**
     * Shared implementation for commit and rollback.
     */
    #finalize(status: Status, why: string, finalizer: () => MaybePromise) {
        // Sanity check on status
        if (this.status !== Status.Shared && this.status !== Status.Exclusive) {
            throw new TransactionFlowError(
                `Illegal attempt to enter status ${status} when transaction is ${this.#status}`,
            );
        }

        // Perform the commit or rollback
        let isAsync = false;
        try {
            this.#status = status;
            const result = finalizer();
            if (MaybePromise.is(result)) {
                isAsync = true;
                return Promise.resolve(result).finally(() => this.#reset(why));
            }
        } finally {
            if (!isAsync) {
                this.#reset(why);
            }
        }
    }

    /**
     * Reset state to shared with no resources or participants.
     */
    #reset(why: string) {
        // Post-finalization state reset
        // Release locks
        const set = new ResourceSet(this, this.#resources);
        const unlocked = set.releaseLocks();
        this.#locksChanged(unlocked, `${why} and unlocked`);

        // Remove resources
        this.#resources.clear();

        // Reset "slow" transaction state
        Monitor.delete(this);
        this.#reportingLocks = false;

        // Release participants
        this.#participants.clear();
        this.#roles.clear();

        // Revert to shared
        this.#status = Status.Shared;

        // Notify listeners
        this.#shared?.emit();
    }

    /**
     * Iteratively execute pre-commit until all participants "settle" and report no possible mutation.
     */
    #createPreCommitExecutor(): () => MaybePromise<void> {
        let mayHaveMutated = false;
        let abortedDueToError = false;
        let iterator = this.participants[Symbol.iterator]();
        let cycles = 1;

        const errorRollback = (error?: any) => {
            logger.error(
                "Rolling back",
                this.via,
                "due to pre-commit error:",
                Diagnostic.weak(error?.message || `${error}`),
            );

            const result = this.#finalize(Status.RollingBack, "rolled back", () => this.#executeRollback());

            if (MaybePromise.is(result)) {
                return result.then(() => {
                    throw error;
                });
            }

            throw error;
        };

        const nextCycle = () => {
            // Guard against infinite loops
            cycles++;
            if (cycles > MAX_PRECOMMIT_CYCLES) {
                return errorRollback(
                    new UnsettledStateError(
                        `State has not settled after ${MAX_PRECOMMIT_CYCLES} pre-commit cycles which likely indicates an infinite loop`,
                    ),
                );
            }

            // Restart iteration at the first participant
            mayHaveMutated = false;
            iterator = this.participants[Symbol.iterator]();
        };

        const executePreCommit = (previousResult?: boolean): MaybePromise<void> => {
            // If an error occurred
            if (abortedDueToError) {
                return;
            }

            // When resuming after an async pre-commit handler, "previousResult" is the handler's return value
            // indicating whether mutation may have occurred
            if (previousResult) {
                mayHaveMutated = true;
            }

            // Cycle through participants until exhausted, there is an error or a pre-commit function is async
            while (true) {
                const n = iterator.next();

                // If we've exhausted participants, we are either done or need to restart the cycle
                if (n.done) {
                    // Restart the cycle if necessary
                    if (mayHaveMutated) {
                        const result = nextCycle();
                        if (MaybePromise.is(result)) {
                            return result;
                        }
                        continue;
                    }

                    // Done
                    break;
                }

                // Process the next participant
                const participant = n.value;

                // When an error occurs this function performs rollback then throws
                const handleError = (error: any) => {
                    abortedDueToError = true;
                    return errorRollback(error);
                };

                // Execute the pre-commit for this participant
                try {
                    const result = participant.preCommit?.();
                    if (MaybePromise.is(result)) {
                        return Promise.resolve(result).catch(handleError).then(executePreCommit);
                    }
                    if (result) {
                        mayHaveMutated = true;
                    }
                } catch (e) {
                    return handleError(e);
                }
            }
        };

        return executePreCommit;
    }

    /**
     * Handle actual commit and post-commit.
     */
    #executeCommit() {
        // Ensure participants are immutable
        const participants = [...this.#participants];

        // Commit phases 1 & 2
        const executeCommit = (): MaybePromise => {
            const result = this.#executeCommit1();

            if (MaybePromise.is(result)) {
                return Promise.resolve(result).then(this.#executeCommit2.bind(this));
            }
            return this.#executeCommit2();
        };
        const result = this.#finalize(Status.CommittingPhaseOne, "committed", executeCommit);

        // Post commit
        const executePostCommit = this.#createPostCommitExecutor(participants);
        if (MaybePromise.is(result)) {
            return result.then(executePostCommit);
        }
        return executePostCommit();
    }

    #executeCommit1(): MaybePromise {
        // Commit phase 1

        let needRollback = false;
        let asyncCommits: undefined | Promise<void>[];
        for (const participant of this.participants) {
            const handleParticipantError = (error: any) => {
                logger.error(`Error committing ${participant} (phase one):`, error);
                needRollback = true;
            };

            try {
                const result = participant.commit1?.();
                if (MaybePromise.is(result)) {
                    if (!asyncCommits) {
                        asyncCommits = [];
                    }
                    asyncCommits.push(Promise.resolve(result).catch(handleParticipantError));
                }
            } catch (e) {
                handleParticipantError(e);
                break;
            }
        }

        const abortIfFailed = () => {
            if (needRollback) {
                const result = this.#executeRollback();

                if (MaybePromise.is(result)) {
                    return result.then(() => {
                        throw new FinalizationError("Rolled back due to commit phase one error");
                    });
                }

                throw new FinalizationError("Rolled back due to commit phase one error");
            }
        };

        if (asyncCommits) {
            return Promise.allSettled(asyncCommits).then(abortIfFailed);
        }

        return abortIfFailed();
    }

    #executeCommit2() {
        // Commit phase 2
        this.#status = Status.CommittingPhaseTwo;
        let errored: undefined | Array<Participant>;
        let ongoing: undefined | Array<Promise<void>>;
        for (const participant of this.participants) {
            const promise = MaybePromise.then(
                () => participant.commit2?.(),
                undefined,
                error => {
                    logger.error(`Error committing (phase two) ${participant}, state inconsistency possible:`, error);

                    if (errored) {
                        errored.push(participant);
                    } else {
                        errored = [participant];
                    }
                },
            );

            if (MaybePromise.is(promise)) {
                if (ongoing) {
                    ongoing.push(promise as Promise<void>);
                } else {
                    ongoing = [promise as Promise<void>];
                }
            }
        }

        if (ongoing) {
            // Async commit
            return Promise.allSettled(ongoing).then(() => throwIfErrored(errored, "in commit phase 2"));
        } else {
            // Synchronous commit
            throwIfErrored(errored, "in commit phase 2");
        }
    }

    /**
     * Execute post-commit phase.
     *
     * We notify each participant sequentially.  If a participant throws, we log the error and move on to the next
     * participant.
     */
    #createPostCommitExecutor(participants: Participant[]): () => MaybePromise {
        let i = 0;

        const executePostCommit = (): MaybePromise => {
            for (; i < participants.length; i++) {
                const participant = participants[i];

                try {
                    const promise = participant.postCommit?.();

                    if (MaybePromise.is(promise)) {
                        i++;
                        return Promise.resolve(promise).then(executePostCommit, e => {
                            reportParticipantError(e);
                            executePostCommit();
                        });
                    }
                } catch (e) {
                    reportParticipantError(e);
                }

                function reportParticipantError(e: unknown) {
                    logger.error(`Error post-commit of ${participant}:`, e);
                }
            }
        };

        return executePostCommit;
    }

    /**
     * Rollback logic passed to #finish.
     */
    #executeRollback() {
        this.#status = Status.RollingBack;
        let errored: undefined | Array<Participant>;
        let ongoing: undefined | Array<Promise<void>>;

        for (const participant of this.participants) {
            // Perform rollback
            const promise = MaybePromise.then(
                () => participant.rollback?.(),
                undefined,
                error => {
                    logger.error(`Error rolling back ${participant}, state inconsistency possible:`, error);

                    if (errored) {
                        errored.push(participant);
                    } else {
                        errored = [participant];
                    }
                },
            );

            // If rollback is asynchronous, collect the promise
            if (MaybePromise.is(promise)) {
                if (ongoing) {
                    ongoing.push(promise as Promise<void>);
                } else {
                    ongoing = [promise as Promise<void>];
                }
            }
        }

        const finished = () => {
            this.#status = Status.Shared;
            throwIfErrored(errored, "in commit phase 2");
        };

        if (ongoing) {
            // Async commit
            return Promise.allSettled(ongoing).then(finished);
        } else {
            // Synchronous commit
            finished();
        }
    }

    #locksChanged(resources: Set<Resource>, how = "locked") {
        if (!resources.size || !this.isAsync) {
            return;
        }

        if (!this.#reportingLocks) {
            Monitor.add(this);
            return;
        }

        let resourceDescription;
        if (how === "locked") {
            resourceDescription = Diagnostic.strong(describeList("and", ...[...resources].map(r => r.toString())));
        } else {
            resourceDescription = `${resources.size} resource${resources.size === 1 ? "" : "s"}`;
        }
        logger.log(Status.slowLogLevel, this.via, how, resourceDescription);
    }

    #assertAvailable() {
        if (this.#status === Status.Destroyed) {
            logger.warn(
                "You have accessed transaction",
                this.via,
                "outside of the context in which it was active.  Open a new context or ensure your operation completes before the context exits",
            );
            throw new TransactionDestroyedError(`Transaction ${this.#via} is destroyed`);
        }
        if (this.#status === Status.ReadOnly) {
            throw new ReadOnlyError();
        }
    }
}

function throwIfErrored(errored: undefined | Array<Participant>, when: string) {
    if (!errored?.length) {
        return;
    }
    const suffix = errored.length > 1 ? "s" : "";
    throw new FinalizationError(
        `Unhandled error${suffix} ${when} participant${suffix} ${describeList(
            "and",
            ...errored.map(p => p.toString()),
        )}`,
    );
}

/**
 * "Slow" async transaction monitoring implementation.
 */
const Monitor = (function () {
    const monitored = new Map<Tx, Timestamp>();
    let monitor: Timer | undefined;

    function check() {
        const now = Time.nowMs;
        for (const [tx, slowAt] of monitored) {
            if (now > slowAt) {
                tx.treatAsSlow();
            }
        }
    }

    return {
        add(tx: Tx) {
            const { slowTransactionTime } = Status;
            if (slowTransactionTime < 0) {
                return;
            }

            if (!slowTransactionTime) {
                tx.treatAsSlow();
                return;
            }

            if (monitored.has(tx)) {
                return;
            }

            monitored.set(tx, Timestamp(Time.nowMs + slowTransactionTime));
            if (monitor === undefined) {
                monitor = Time.getPeriodicTimer("tx-lock-monitor", Millis(slowTransactionTime / 10), check);
                monitor.start();
            }
        },

        delete(tx: Tx) {
            monitored.delete(tx);
            if (!monitored.size && monitor) {
                monitor.stop();
                monitor = undefined;
            }
        },
    };
})();
