/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import { ImplementationError, MatterAggregateError, ReadOnlyError } from "#MatterError.js";
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

/**
 * State of a single commit or rollback, which a post-commit handler may nest inside another.
 */
interface CommitCycle {
    concluded: boolean;

    /** Those the cycle reports to, recorded by the phase that dispatched them. */
    reportees?: Participant[];

    /** How the cycle ends, recorded by whoever determined it. */
    outcome?: Participant.Outcome;
}

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
                logger.warn(this.via, "Disposed", this.via, "while", this.status);
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

    onFinalize(actor: () => MaybePromise<void>) {
        this.onShared(() => {
            MaybePromise.then(actor, undefined, err => {
                logger.warn(`Finalize actor on transaction ${this.via} failed:`, err);
            });
        }, true);
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

        const cycle: CommitCycle = { concluded: false };

        return this.#rollbackAndConclude(cycle);
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

        logger.warn("Rolling back", this.via, "due to error:", Diagnostic.weak(asError(cause).message));

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

        // A post-commit handler may commit again, and that cycle's report must not stand in for this one
        const cycle: CommitCycle = { concluded: false };

        // Chain without adding a promise of our own: a commit's shape is observable in the timing of everything
        // downstream of it
        let result = this.#createPreCommitExecutor(cycle)();

        const commit = () =>
            MaybePromise.then(
                () => this.#executeSettled(cycle),
                () => this.#executeCommit(cycle),
            );

        if (MaybePromise.is(result)) {
            result = result.then(commit);
        } else {
            result = commit();
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
    #createPreCommitExecutor(cycle: CommitCycle): () => MaybePromise<void> {
        let mayHaveMutated = false;
        let abortedDueToError = false;
        let iterator = this.participants[Symbol.iterator]();
        let cycles = 1;

        const errorRollback = (error?: any) => {
            logger.warn(
                "Rolling back",
                this.via,
                "due to pre-commit error:",
                Diagnostic.weak(error?.message || `${error}`),
            );

            const result = this.#rollbackAndConclude(cycle);

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
    #executeCommit(cycle: CommitCycle) {
        const participants = [...this.#participants];

        // Commit phases 1 & 2
        const executeCommit = (): MaybePromise =>
            MaybePromise.then(
                () => this.#executeCommit1(cycle),
                () => this.#executeCommit2(cycle),
            );

        // Committing is itself what creates some participants -- a store joins as its values are written -- so report
        // to those phase two dispatched.  A participant that joined after its own iteration ran no phase at all
        const reportTo = () => cycle.reportees ?? participants;

        const succeeded = () => {
            const reportees = reportTo();
            const reported = this.#createPostCommitExecutor(reportees)();

            // Chaining is observable in the timing of everything downstream, so add nothing where nobody listens
            if (!reportees.some(participant => participant.conclusion)) {
                return reported;
            }

            return MaybePromise.finally(reported, () => this.#conclude(cycle, reportees, "committed"));
        };

        // A rollback inside the commit -- a phase one failure -- already determined the outcome; anything else left
        // writes canonical with nothing reverted
        const concludeFailure = () => this.#conclude(cycle, reportTo(), cycle.outcome ?? "inconsistent");

        const failed = (error: unknown): MaybePromise<never> => {
            const notified = concludeFailure();

            if (MaybePromise.is(notified)) {
                return Promise.resolve(notified).then(() => {
                    throw error;
                });
            }

            throw error;
        };

        let result;
        try {
            result = this.#finalize(Status.CommittingPhaseOne, "committed", executeCommit);
        } catch (e) {
            return failed(e);
        }

        if (MaybePromise.is(result)) {
            return result.then(succeeded, failed);
        }

        return succeeded();
    }

    /**
     * Revert, then report the outcome once the transaction has released its locks.
     *
     * The report is awaited on every path, including a synchronous throw from reverting.
     */
    #rollbackAndConclude(cycle: CommitCycle): MaybePromise {
        const conclude = () => {
            const { reportees, outcome } = cycle;
            if (reportees === undefined || outcome === undefined) {
                return;
            }

            // A rollback with nobody to tell keeps the promise shape the caller had
            if (!reportees.some(participant => participant.conclusion)) {
                return;
            }

            return this.#conclude(cycle, reportees, outcome);
        };

        const rethrow = (error: unknown): MaybePromise<never> => {
            const concluded = conclude();

            if (MaybePromise.is(concluded)) {
                return Promise.resolve(concluded).then(() => {
                    throw error;
                });
            }

            throw error;
        };

        let reverted;
        try {
            reverted = this.#finalize(Status.RollingBack, "rolled back", () => this.#executeRollback(cycle));
        } catch (e) {
            return rethrow(e);
        }

        if (MaybePromise.is(reverted)) {
            return reverted.then(conclude, rethrow);
        }

        return conclude();
    }

    /**
     * Invoke a hook on each participant in turn, awaiting an asynchronous one before reaching the next.
     */
    #notifyInTurn(
        participants: Participant[],
        invoke: (participant: Participant) => MaybePromise,
        onError: (participant: Participant, error: unknown) => MaybePromise,
    ): MaybePromise {
        let i = 0;

        const notify = (): MaybePromise => {
            for (; i < participants.length; i++) {
                const participant = participants[i];

                try {
                    const result = invoke(participant);
                    if (MaybePromise.is(result)) {
                        i++;
                        return Promise.resolve(result).then(notify, error =>
                            MaybePromise.then(
                                () => onError(participant, error),
                                () => notify(),
                            ),
                        );
                    }
                } catch (e) {
                    const handled = onError(participant, e);
                    if (MaybePromise.is(handled)) {
                        return handled;
                    }
                }
            }
        };

        return notify();
    }

    #conclude(cycle: CommitCycle, participants: Participant[], outcome: Participant.Outcome): MaybePromise {
        if (cycle.concluded) {
            return;
        }
        cycle.concluded = true;

        // A write has nothing to reach: the transaction has ended
        const previous = this.#status;
        this.#status = Status.Concluding;

        const restore = () => {
            if (this.#status === Status.Concluding) {
                this.#status = previous;
            }
        };

        return MaybePromise.finally(
            () =>
                this.#notifyInTurn(
                    participants,
                    participant => participant.conclusion?.(outcome),
                    (participant, error) => {
                        logger.error(`Error concluding ${participant}:`, error);
                    },
                ),
            restore,
        );
    }

    /**
     * Notify participants that pre-commit settled, before any of them writes.
     *
     * A throw here rejects the commit, which is the point: this is the last moment at which a participant can refuse
     * the values the transaction is about to write.
     */
    #executeSettled(cycle: CommitCycle): MaybePromise {
        const participants = new Array<Participant>();
        for (const participant of this.#participants) {
            if (participant.settled) {
                participants.push(participant);
            }
        }
        if (!participants.length) {
            return;
        }

        // Writes are refused: pre-commit has converged, so no participant would see one
        this.#status = Status.Settled;

        const restore = () => {
            if (this.#status === Status.Settled) {
                this.#status = Status.Exclusive;
            }
        };

        const rollbackAndThrow = (error: unknown): MaybePromise<never> => {
            restore();

            logger.warn("Rolling back", this.via, "due to settled error:", Diagnostic.weak(asError(error).message));

            const rethrow = () => {
                throw error;
            };

            // The settled report is the cause; a rollback that fails on top of it is secondary
            const secondary = (cause: unknown) => {
                if (cause !== error) {
                    logger.error("Secondary error in", this.via, "rollback:", cause);
                }
                throw error;
            };

            let rollback;
            try {
                rollback = this.#rollbackAndConclude(cycle);
            } catch (e) {
                return secondary(e);
            }

            if (MaybePromise.is(rollback)) {
                return Promise.resolve(rollback).then(rethrow, secondary);
            }

            return rethrow();
        };

        return MaybePromise.then(
            () =>
                this.#notifyInTurn(
                    participants,
                    participant => participant.settled?.(),
                    (_participant, error) => rollbackAndThrow(error),
                ),
            restore,
        );
    }

    #executeCommit1(cycle: CommitCycle): MaybePromise {
        // Commit phase 1

        let needRollback = false;
        let asyncCommits: undefined | Promise<void>[];
        for (const participant of this.participants) {
            const handleParticipantError = (error: any) => {
                logger.warn(`Error committing ${participant} (phase one):`, error);
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
                const result = this.#executeRollback(cycle);

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

    #executeCommit2(cycle: CommitCycle) {
        // Commit phase 2
        this.#status = Status.CommittingPhaseTwo;
        cycle.reportees = [];
        let errored: undefined | Array<ParticipantError>;
        let ongoing: undefined | Array<Promise<void>>;
        for (const participant of this.participants) {
            cycle.reportees.push(participant);

            const promise = MaybePromise.then(
                () => participant.commit2?.(),
                undefined,
                error => {
                    logger.error(`Error committing (phase two) ${participant}, state inconsistency possible:`, error);

                    if (errored) {
                        errored.push({ participant, error });
                    } else {
                        errored = [{ participant, error }];
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
                            return executePostCommit();
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
    #executeRollback(cycle: CommitCycle) {
        this.#status = Status.RollingBack;
        const participants = new Array<Participant>();
        let errored: undefined | Array<ParticipantError>;
        let ongoing: undefined | Array<Promise<void>>;

        for (const participant of this.participants) {
            // A participant may join while reverting, so report to those this loop reached rather than to a roster
            // captured before it
            participants.push(participant);

            // Perform rollback
            const promise = MaybePromise.then(
                () => participant.rollback?.(),
                undefined,
                error => {
                    logger.error(`Error rolling back ${participant}, state inconsistency possible:`, error);

                    if (errored) {
                        errored.push({ participant, error });
                    } else {
                        errored = [{ participant, error }];
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

        // A participant that failed to revert leaves state neither committed nor restored.  Record the outcome for the
        // caller to report once locks are released; reporting from here would still hold them
        const finished = () => {
            this.#status = Status.Shared;
            cycle.reportees = participants;
            cycle.outcome = errored?.length ? "inconsistent" : "rolled back";
            throwIfErrored(errored, "during rollback");
        };

        if (ongoing) {
            return Promise.allSettled(ongoing).then(finished);
        }

        return finished();
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

interface ParticipantError {
    participant: Participant;
    error: unknown;
}

function throwIfErrored(errored: undefined | Array<ParticipantError>, when: string) {
    if (!errored?.length) {
        return;
    }
    if (errored.length === 1) {
        throw errored[0].error;
    }
    throw new MatterAggregateError(
        errored.map(({ error }) => error),
        `Errors ${when} participants ${describeList("and", ...errored.map(({ participant }) => participant.toString()))}`,
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
