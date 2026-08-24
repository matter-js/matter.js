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
 * | commit                    | `preCommit`\*, `settled`, `commit1`, `commit2`, `postCommit`, `finalized`  |
 * | pre-commit failure        | `preCommit`\*, `rollback`, `finalized`                                     |
 * | rejected by `settled`     | `preCommit`\*, `settled`, `rollback`, `finalized`                          |
 * | phase one failure         | `preCommit`\*, `settled`, `commit1`, `rollback`, `finalized`               |
 * | phase two failure         | `preCommit`\*, `settled`, `commit1`, `commit2`, `finalized`                |
 * | rollback                  | `rollback`, `finalized`                                                   |
 *
 * \* `preCommit` runs one or more times.
 *
 * Note the phase two row: values a participant made canonical in {@link commit2} stay canonical, no
 * {@link rollback} runs, and {@link postCommit} runs for nobody.  A participant that must react to its own write
 * regardless of a sibling's failure does so in {@link finalized}, which states the outcome.
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
     * before any participant's {@link commit1}.  This is the only point at which a participant sees what actually
     * settled while refusing it is still free: a throw here rejects the commit and rolls back, and nothing has been
     * written yet.
     *
     * Skipped where pre-commit itself failed, which never reaches a settled state.
     *
     * Only the transaction knows that pre-commit has converged, which is why a participant cannot do this in its own
     * {@link preCommit} — returning `false` says nothing about whether another participant will mutate afterwards.
     *
     * Must not mutate state.  Pre-commit has settled by definition, so a mutation here bypasses every participant's
     * chance to react to it.
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
     * Runs once per commit cycle or rollback, told how the transaction ended, on every path a commit or rollback
     * takes — including the phase two failure that skips both {@link postCommit} and {@link rollback}.  A participant
     * that sets state in {@link commit1} or {@link commit2} clears it here rather than in {@link postCommit}.
     *
     * Runs after {@link postCommit} where post-commit runs at all.  Do not depend on lock state: a commit reports
     * after releasing its locks, a rollback while it still holds them.  A throw is logged and otherwise ignored: the
     * transaction has already ended and nothing can be undone.
     *
     * A transaction that is neither committed nor rolled back does not report.  That means a transaction abandoned
     * while exclusive, whether disposed directly or discarded because commits cascaded past their limit, so a
     * participant must not treat this hook as its only means of releasing a resource.
     */
    finalized?: (outcome: Participant.Outcome) => MaybePromise;
}

export namespace Participant {
    /**
     * How a transaction ended, as reported to {@link Participant.finalized}.
     *
     * - `committed` — every participant's {@link Participant.commit2} succeeded
     * - `rolled back` — nothing stands: the commit was refused before phase two, or phase one failed and every
     *   participant reverted
     * - `inconsistent` — state is neither committed nor restored, because {@link Participant.commit2} threw for at
     *   least one participant and nothing rolled back, or because a {@link Participant.rollback} itself threw
     */
    export type Outcome = "committed" | "rolled back" | "inconsistent";
}
