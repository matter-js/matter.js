/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "#util/Promises.js";

/**
 * Components with support for transactionality implement this interface.
 *
 * Hooks run in the order declared below.  Which of them run depends on how the transaction ends:
 *
 * | outcome                   | hooks that run                                                            |
 * | ------------------------- | ------------------------------------------------------------------------- |
 * | commit                    | `preCommit`\*, `settled`, `commit1`, `commit2`, `postCommit`, `conclusion`  |
 * | pre-commit failure        | `preCommit`\*, `rollback`, `conclusion`                                     |
 * | rejected by `settled`     | `preCommit`\*, `settled`, `rollback`, `conclusion`                          |
 * | phase one failure         | `preCommit`\*, `settled`, `commit1`, `rollback`, `conclusion`               |
 * | phase two failure         | `preCommit`\*, `settled`, `commit1`, `commit2`, `conclusion`                |
 * | rollback                  | `rollback`, `conclusion`                                                   |
 *
 * \* `preCommit` runs one or more times.
 *
 * A phase that rejects the commit stops at the participant that failed, so the ones after it are not reached:
 * {@link preCommit}, {@link settled}, and a {@link commit1} that throws synchronously.  A phase that cannot reject
 * runs to the end and reports afterwards: an asynchronous {@link commit1} rejection, {@link commit2},
 * {@link postCommit} and {@link conclusion}.
 *
 * Note the phase two row: values a participant made canonical in {@link commit2} stay canonical, no
 * {@link rollback} runs, and {@link postCommit} runs for nobody.  A participant that must react to its own write
 * regardless of a sibling's failure does so in {@link conclusion}, which states the outcome.
 *
 * A commit runs the whole sequence again where {@link postCommit} writes, so a participant may see it more than once
 * for a single commit.  Every hook below therefore describes what happens per commit cycle rather than per commit.
 */
export interface Participant {
    /**
     * Description used in error messages.
     *
     * This doubles as the participant's identity: a transaction refuses a second participant with the same
     * description, on the assumption that two participants naming the same thing manage the same data.
     * A participant added anonymously therefore collides with every other anonymous participant.
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
     *
     * A throw here rejects the commit and rolls back.
     */
    preCommit?: () => MaybePromise<boolean>;

    /**
     * Inspect the values the transaction is about to write.
     *
     * Invoked once per commit cycle, after every participant's {@link preCommit} reports no further mutation and
     * before any participant's {@link commit1}.  A throw rejects the commit and rolls back.
     *
     * This is where a participant sees the values the transaction settled on before any of them is staged; by
     * {@link commit1} a sibling may already have written.
     *
     * Skipped where pre-commit itself failed, which never reaches a settled state.
     *
     * Writes are refused here, and so is adding a participant: pre-commit has converged, so anything that arrived
     * now would reach the store with no participant having had a chance to react to it.
     */
    settled?: () => MaybePromise;

    /**
     * Commit phase one.
     *
     * Stage durable writes here.  A throw rolls back every participant, including those whose phase one already
     * completed.
     */
    commit1?: () => MaybePromise;

    /**
     * Commit phase two.
     *
     * Make writes canonical here.  This is the point of no return: a throw is reported and aggregated but nothing
     * rolls back, so the transaction can end with some participants committed and others not.
     */
    commit2?: () => MaybePromise;

    /**
     * Post-commit logic.  Emit change notifications here.
     *
     * Best effort: this runs only when every participant's {@link commit2} succeeded, and it runs for nobody when any
     * of them threw.  A throw here is logged, and the remaining participants still run.
     *
     * Locks are released before post-commit begins, so another transaction may commit the same resources while these
     * notifications are still dispatching.  Do not treat state observed here as belonging to this transaction.
     */
    postCommit?: () => MaybePromise;

    /**
     * Drop isolated writes and revert to original canonical source.
     *
     * Runs for every participant when a transaction rolls back, whether or not that participant's own phase one ran.
     * Does **not** run when {@link commit2} throws.
     */
    rollback?: () => MaybePromise;

    /**
     * Release per-transaction state.
     *
     * Runs once for a commit cycle or rollback that completes, told how it ended — including the phase two failure
     * that skips both {@link postCommit} and {@link rollback}, which is the only outcome no other hook covers.  A
     * transaction abandoned while exclusive completes neither, so this is not a participant's only means of releasing
     * a resource.
     *
     * Runs after {@link postCommit} where post-commit runs at all, and after the transaction released its locks.
     * Writes are refused: the transaction has ended, so there is nothing left to write to.  A throw is logged and
     * otherwise ignored, for the same reason.
     */
    conclusion?: (outcome: Participant.Outcome) => MaybePromise;
}

export namespace Participant {
    /**
     * How a transaction ended, as reported to {@link Participant.conclusion}.
     *
     * - `committed` — every participant's {@link Participant.commit2} succeeded
     * - `rolled back` — nothing stands: the commit was refused before phase two, or phase one failed and every
     *   participant reverted
     * - `inconsistent` — state is neither committed nor restored, because {@link Participant.commit2} threw for at
     *   least one participant and nothing rolled back, or because a {@link Participant.rollback} itself threw
     */
    export type Outcome = "committed" | "rolled back" | "inconsistent";
}
