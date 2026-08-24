/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lifetime } from "#index.js";
import { MatterAggregateError } from "#MatterError.js";
import {
    FinalizationError,
    SynchronousTransactionConflictError,
    TransactionDeadlockError,
    TransactionFlowError,
} from "#transaction/errors.js";
import { Transaction } from "#transaction/Transaction.js";
import { MaybePromise } from "#util/Promises.js";

class TestResource implements Transaction.Resource {
    lockedBy?: Transaction;

    constructor(public description = "TestResource") {}

    toString() {
        return this.description;
    }
}

interface TestParticipant extends Transaction.Participant {
    invoked: string[];

    expect(...invokes: string[]): void;
}

class SomeError extends Error {}

function TestParticipant(options?: Partial<Transaction.Participant>) {
    return {
        toString() {
            return "TestParticipant";
        },

        invoked: Array<string>(),

        preCommit: options?.preCommit,

        commit1(): MaybePromise {
            this.invoked.push("commit1");
            return options?.commit1?.();
        },

        commit2(): MaybePromise {
            this.invoked.push("commit2");
            return options?.commit2?.();
        },

        settled: options?.settled,

        postCommit: options?.postCommit,

        finalized: options?.finalized,

        rollback(): MaybePromise {
            this.invoked.push("rollback");
            return options?.rollback?.();
        },

        expect(...invokes: string[]) {
            expect(this.invoked).deep.equals(invokes);
        },
    };
}

let transaction: Transaction;
let transaction2: Transaction;
let transaction3: Transaction;

function validateUnlocked(transaction: Transaction) {
    for (const resource of transaction.resources) {
        expect(resource.lockedBy).undefined;
    }
}

export interface JoinOptions extends Partial<Transaction.Participant> {
    transaction?: Transaction;
    postCommit?: () => MaybePromise;
    finalized?: (outcome: Transaction.Outcome) => MaybePromise;
}

/**
 * Add a {@link TestParticipant} to {@link transaction}.
 */
function join(options?: JoinOptions): TestParticipant {
    const participant = TestParticipant(options);

    const tx = options?.transaction ?? transaction;
    tx.addParticipants(participant);

    return participant;
}

/**
 * Add a {@link TestParticipant} to {@link transaction2}.
 */
function join2(options?: JoinOptions) {
    return join({
        ...options,
        transaction: transaction2,
    });
}

/**
 * Add a {@link TestParticipant} to {@link transaction3}.
 */
function join3(options?: JoinOptions) {
    return join({
        ...options,
        transaction: transaction3,
    });
}

/**
 * Commit {@link transaction} as a promise.  A commit may fail synchronously, which `rejectedWith` cannot observe.
 */
async function committing() {
    return transaction.commit();
}

/**
 * Run a test against {@link transaction}.
 */
function test(what: string, actor: () => MaybePromise, only?: boolean) {
    const initiator = only ? it.only : it;
    initiator(what, () =>
        Transaction.act("test", Lifetime.mock, tx => {
            transaction = tx;
            return actor();
        }),
    );
}

test.only = (what: string, actor: () => MaybePromise) => test(what, actor, true);

/**
 * Run a test against {@link transaction} and {@link transaction2}.
 */
function test2(what: string, actor: () => MaybePromise, only?: boolean) {
    test(
        what,
        () =>
            Transaction.act("test2", Lifetime.mock, tx => {
                transaction2 = tx;
                return actor();
            }),
        only,
    );
}

test2.only = (what: string, actor: () => MaybePromise) => test2(what, actor, true);

/**
 * Run a test against all three transactions.
 */
function test3(what: string, actor: () => MaybePromise, only?: boolean) {
    test2(
        what,
        () =>
            Transaction.act("test3", Lifetime.mock, tx => {
                transaction3 = tx;
                return actor();
            }),
        only,
    );
}

test3.only = (what: string, actor: () => MaybePromise) => test3(what, actor, true);

describe("Transaction", () => {
    describe("automatic resolution", () => {
        it("commits synchronously", () => {
            const p = TestParticipant();

            const result = Transaction.act("test", Lifetime.mock, tx => {
                tx.addParticipants(p);
                tx.beginSync();
            });
            expect(result).undefined;

            p.expect("commit1", "commit2");
        });

        it("commits asynchronously", async () => {
            const p = TestParticipant();

            await Transaction.act("test", Lifetime.mock, async tx => {
                tx.addParticipants(p);
                await tx.begin();
            });

            p.expect("commit1", "commit2");
        });

        it("rolls back synchronously", () => {
            const p = TestParticipant();

            expect(() =>
                Transaction.act("test", Lifetime.mock, tx => {
                    tx.addParticipants(p);
                    tx.beginSync();
                    throw new Error("oops in sync actor");
                }),
            ).throws("oops in sync actor");

            p.expect("rollback");
        });

        it("rolls back asynchronously", async () => {
            const p = TestParticipant();

            await expect(
                Transaction.act("test", Lifetime.mock, async tx => {
                    tx.addParticipants(p);
                    tx.beginSync();
                    throw new Error("oops in async actor");
                }),
            ).rejectedWith("oops in async actor");

            p.expect("rollback");
        });

        it("multiple begin/commits asynchronously", async () => {
            const p = TestParticipant();

            const result = await Transaction.act("test", Lifetime.mock, async tx => {
                expect(tx.participants.size).equals(0);
                tx.addParticipants(p);
                expect(tx.participants.size).equals(1);
                expect(tx.participants.has(p)).equals(true);
                await tx.begin();
                tx.commit();
                expect(tx.participants.size).equals(0);
                tx.addParticipants(p);
                expect(tx.participants.size).equals(1);
                expect(tx.participants.has(p)).equals(true);
                await tx.begin();
            });
            expect(result).undefined;

            p.expect("commit1", "commit2", "commit1", "commit2");
        });
    });

    test("handles commit and rollback on shared", async () => {
        const p = join();
        await transaction.commit();

        transaction.addParticipants(p);
        await transaction.rollback();

        p.expect("rollback", "rollback");

        validateUnlocked(transaction);
    });

    test("flows through commit correctly", async () => {
        const p = join({
            postCommit: () => {
                p.invoked.push("postCommit");
            },
        });

        expect(transaction.status).equals(Transaction.Status.Shared);
        await transaction.begin();
        expect(transaction.status).equals(Transaction.Status.Exclusive);
        await transaction.commit();
        expect(transaction.status).equals(Transaction.Status.Shared);

        p.expect("commit1", "commit2", "postCommit");
        validateUnlocked(transaction);
    });

    test("flows through rollback correctly", async () => {
        const p = join();

        expect(transaction.status).equals(Transaction.Status.Shared);
        await transaction.begin();
        expect(transaction.status).equals(Transaction.Status.Exclusive);
        await transaction.rollback();
        expect(transaction.status).equals(Transaction.Status.Shared);

        p.expect("rollback");
        validateUnlocked(transaction);
    });

    describe("invokes onShared", () => {
        test("after commit", async () => {
            join();

            await transaction.begin();

            const promise = new Promise<void>(resolve => transaction.onShared(resolve));
            await transaction.commit();

            await expect(promise).eventually.undefined;
        });

        test("after rolling back", async () => {
            join();

            await transaction.begin();

            const promise = new Promise<void>(resolve => transaction.onShared(resolve));
            await transaction.rollback();

            await expect(promise).eventually.undefined;
        });
    });

    describe("rolls back and throws on precommit phase error", () => {
        test("synchronously", () => {
            const p = join({
                preCommit: () => {
                    throw new SomeError("oops in sync participant");
                },
            });

            transaction.beginSync();

            expect(() => transaction.commit()).throws(SomeError);

            p.expect("rollback");
            validateUnlocked(transaction);
        });

        test("asychonously", async () => {
            const p = join({
                preCommit: () => {
                    throw new SomeError("oops in sync participant");
                },

                async rollback() {},
            });

            await transaction.begin();

            await expect(transaction.commit()).rejectedWith(SomeError);

            p.expect("rollback");
            validateUnlocked(transaction);
        });
    });

    describe("rolls back and throws on commit phase 1 error", () => {
        test("synchronously", () => {
            const p = join({
                commit1() {
                    throw new Error("oops in sync participant");
                },
            });

            transaction.beginSync();

            expect(() => transaction.commit()).throws(FinalizationError);

            p.expect("commit1", "rollback");
            validateUnlocked(transaction);
        });

        test("asychonously", async () => {
            const p = join({
                async commit1() {
                    throw new Error("oops in async participant");
                },

                async rollback() {},
            });

            await transaction.begin();

            await expect(transaction.commit()).rejectedWith(FinalizationError);

            p.expect("commit1", "rollback");
            validateUnlocked(transaction);
        });
    });

    describe("propagates commit phase 2 errors to the caller", () => {
        test("rethrows the original error when a single participant fails", async () => {
            const original = new SomeError("phase 2 boom");
            const p = join({
                async commit2() {
                    throw original;
                },
            });

            await transaction.begin();

            await expect(transaction.commit()).rejectedWith(original);

            p.expect("commit1", "commit2");
            validateUnlocked(transaction);
        });

        test("aggregates with MatterAggregateError when multiple participants fail", async () => {
            const e1 = new SomeError("phase 2 boom 1");
            const e2 = new SomeError("phase 2 boom 2");

            const p1 = TestParticipant({
                async commit2() {
                    throw e1;
                },
            });
            p1.toString = () => "P1";
            const p2 = TestParticipant({
                async commit2() {
                    throw e2;
                },
            });
            p2.toString = () => "P2";
            transaction.addParticipants(p1, p2);

            await transaction.begin();

            let caught: unknown;
            try {
                await transaction.commit();
            } catch (e) {
                caught = e;
            }

            expect(caught).instanceOf(MatterAggregateError);
            const aggregate = caught as MatterAggregateError;
            expect(aggregate.errors).deep.equals([e1, e2]);

            p1.expect("commit1", "commit2");
            p2.expect("commit1", "commit2");
            validateUnlocked(transaction);
        });
    });

    describe("settled", () => {
        test("runs once after precommit settles, before commit1", async () => {
            let cycles = 0;
            const p: TestParticipant = join({
                preCommit: () => {
                    p.invoked.push("preCommit");
                    return ++cycles < 2;
                },

                settled: () => {
                    p.invoked.push("settled");
                },
            });

            await transaction.begin();
            await transaction.commit();

            p.expect("preCommit", "preCommit", "settled", "commit1", "commit2");
            validateUnlocked(transaction);
        });

        test("rejects the commit and rolls back", async () => {
            const p: TestParticipant = join({
                settled: () => {
                    throw new SomeError("oops in settled");
                },
            });

            await transaction.begin();

            await expect(committing()).rejectedWith(SomeError);

            p.expect("rollback");
            validateUnlocked(transaction);
        });

        test("rejects the commit and rolls back asynchronously", async () => {
            const p: TestParticipant = join({
                settled: async () => {
                    throw new SomeError("oops in async settled");
                },

                async rollback() {},
            });

            await transaction.begin();

            await expect(transaction.commit()).rejectedWith(SomeError);

            p.expect("rollback");
            validateUnlocked(transaction);
        });

        test("notifies every participant, awaiting an asynchronous one", async () => {
            const notified = new Array<string>();

            const p1 = TestParticipant({
                settled: async () => {
                    await Promise.resolve();
                    notified.push("P1");
                },
            });
            p1.toString = () => "P1";

            const p2 = TestParticipant({
                settled: () => {
                    notified.push("P2");
                },
            });
            p2.toString = () => "P2";

            transaction.addParticipants(p1, p2);

            await transaction.begin();
            await transaction.commit();

            expect(notified).deep.equals(["P1", "P2"]);
        });

        test("sees the state the final precommit cycle produced", async () => {
            const state = { value: 0 };
            let seen;

            join({
                preCommit: () => {
                    if (state.value === 2) {
                        return false;
                    }
                    state.value++;
                    return true;
                },

                settled: () => {
                    seen = state.value;
                },
            });

            await transaction.begin();
            await transaction.commit();

            expect(seen).equals(2);
        });
    });

    describe("finalized", () => {
        test("reports a commit after post-commit", async () => {
            const p: TestParticipant = join({
                postCommit: () => {
                    p.invoked.push("postCommit");
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();
            await transaction.commit();

            p.expect("commit1", "commit2", "postCommit", "finalized committed");
        });

        test("reports a rollback", async () => {
            const p: TestParticipant = join({
                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();
            await transaction.rollback();

            p.expect("rollback", "finalized rolled back");
            validateUnlocked(transaction);
        });

        test("reports a rollback once when phase one throws", async () => {
            const p: TestParticipant = join({
                commit1() {
                    throw new SomeError("oops in commit1");
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();

            await expect(committing()).rejectedWith(FinalizationError);

            p.expect("commit1", "rollback", "finalized rolled back");
            validateUnlocked(transaction);
        });

        test("reports a rollback when pre-commit throws", async () => {
            const p: TestParticipant = join({
                preCommit: () => {
                    throw new SomeError("oops in preCommit");
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();

            await expect(committing()).rejectedWith(SomeError);

            p.expect("rollback", "finalized rolled back");
            validateUnlocked(transaction);
        });

        test("reports a rollback when pre-commit throws asynchronously", async () => {
            const p: TestParticipant = join({
                preCommit: async () => {
                    await Promise.resolve();
                    throw new SomeError("oops in async preCommit");
                },

                finalized: async outcome => {
                    await Promise.resolve();
                    p.invoked.push(`finalized ${outcome}`);
                },

                async rollback() {},
            });

            await transaction.begin();

            await expect(committing()).rejectedWith(SomeError);

            p.expect("rollback", "finalized rolled back");
            validateUnlocked(transaction);
        });

        test("reports an inconsistent commit when phase two throws", async () => {
            const p: TestParticipant = join({
                commit2() {
                    throw new SomeError("oops in commit2");
                },

                postCommit: () => {
                    p.invoked.push("postCommit");
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();

            await expect(committing()).rejectedWith(SomeError);

            p.expect("commit1", "commit2", "finalized inconsistent");
            validateUnlocked(transaction);
        });

        test("reports a rollback when settled throws", async () => {
            const p: TestParticipant = join({
                settled: () => {
                    throw new SomeError("oops in settled");
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();

            await expect(committing()).rejectedWith(SomeError);

            p.expect("rollback", "finalized rolled back");
        });

        test("runs when post-commit throws", async () => {
            const p: TestParticipant = join({
                postCommit: () => {
                    throw new SomeError("oops in postCommit");
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();
            await transaction.commit();

            p.expect("commit1", "commit2", "finalized committed");
        });

        test("runs for every participant when one throws", async () => {
            let firstRan = false;

            const p1 = TestParticipant({
                finalized: () => {
                    firstRan = true;
                    throw new SomeError("oops in finalized");
                },
            });
            p1.toString = () => "P1";

            const p2: TestParticipant = TestParticipant({
                finalized: outcome => {
                    p2.invoked.push(`finalized ${outcome}`);
                },
            });
            p2.toString = () => "P2";

            transaction.addParticipants(p1, p2);

            await transaction.begin();
            await transaction.commit();

            expect(firstRan).equals(true);
            p2.expect("commit1", "commit2", "finalized committed");
        });

        test("runs after a post-commit rejection let the remaining participants finish", async () => {
            const order = new Array<string>();
            let seenAtFinalize: string[] | undefined;

            const p1 = TestParticipant({
                postCommit: async () => {
                    await Promise.resolve();
                    order.push("postCommit P1");
                    throw new SomeError("oops in postCommit");
                },
            });
            p1.toString = () => "P1";

            const p2 = TestParticipant({
                postCommit: async () => {
                    await Promise.resolve();
                    order.push("postCommit P2");
                },

                finalized: () => {
                    seenAtFinalize = [...order];
                    order.push("finalized P2");
                },
            });
            p2.toString = () => "P2";

            transaction.addParticipants(p1, p2);

            await transaction.begin();
            await transaction.commit();

            // What post-commit had completed by the time the transaction reported, which is the ordering at issue
            expect(seenAtFinalize).deep.equals(["postCommit P1", "postCommit P2"]);
            expect(order).deep.equals(["postCommit P1", "postCommit P2", "finalized P2"]);
        });

        test("awaits an asynchronous participant on the rollback path", async () => {
            const settled = new Array<string>();
            const p: TestParticipant = join({
                finalized: async outcome => {
                    await Promise.resolve();
                    p.invoked.push(`finalized ${outcome}`);
                    settled.push("finalized");
                },
            });

            await transaction.begin();
            await transaction.rollback();

            expect(settled).deep.equals(["finalized"]);
            p.expect("rollback", "finalized rolled back");
        });

        test("surfaces a rollback error after notifying", async () => {
            const p: TestParticipant = join({
                rollback() {
                    throw new SomeError("oops in rollback");
                },

                finalized: async outcome => {
                    await Promise.resolve();
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();

            await expect(transaction.rollback()).rejectedWith(SomeError);

            p.expect("rollback", "finalized inconsistent");
            validateUnlocked(transaction);
        });

        test("continues after an asynchronous participant rejects", async () => {
            const p1 = TestParticipant({
                finalized: async () => {
                    await Promise.resolve();
                    throw new SomeError("oops in async finalized");
                },
            });
            p1.toString = () => "P1";

            const p2: TestParticipant = TestParticipant({
                finalized: outcome => {
                    p2.invoked.push(`finalized ${outcome}`);
                },
            });
            p2.toString = () => "P2";

            transaction.addParticipants(p1, p2);

            await transaction.begin();
            await transaction.commit();

            p2.expect("commit1", "commit2", "finalized committed");
        });

        test("reports a participant that joined during phase one", async () => {
            const joiner: TestParticipant = TestParticipant({
                finalized: outcome => {
                    joiner.invoked.push(`finalized ${outcome}`);
                },
            });
            joiner.toString = () => "joiner";

            join({
                commit1: () => {
                    transaction.addParticipants(joiner);
                },
            });

            await transaction.begin();
            await transaction.commit();

            joiner.expect("commit1", "commit2", "finalized committed");
        });

        test("reports a participant that joined during phase two", async () => {
            const joiner: TestParticipant = TestParticipant({
                finalized: outcome => {
                    joiner.invoked.push(`finalized ${outcome}`);
                },
            });
            joiner.toString = () => "joiner";

            join({
                commit2: () => {
                    transaction.addParticipants(joiner);
                },
            });

            await transaction.begin();
            await transaction.commit();

            joiner.expect("commit2", "finalized committed");
        });

        test("refuses a write from a participant reporting a rollback", async () => {
            let caught: unknown;

            join({
                finalized: () => {
                    try {
                        transaction.beginSync();
                    } catch (e) {
                        caught = e;
                    }
                },
            });

            await transaction.begin();
            await transaction.rollback();

            expect(caught).instanceOf(TransactionFlowError);
        });

        test("reports the cycle that a nested commit did not", async () => {
            let nested = false;

            const p: TestParticipant = join({
                postCommit: () => {
                    if (nested) {
                        return;
                    }
                    nested = true;

                    // A cycle of its own, which must not stand in for the one reporting it
                    transaction.beginSync();
                    return transaction.commit();
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();
            await transaction.commit();

            // The nested cycle has no participants of its own, so this participant is reported exactly once -- by the
            // cycle it belongs to, which a transaction-wide guard would have let the nested one consume
            expect(p.invoked.filter(entry => entry === "finalized committed")).length(1);
        });

        test("does not report a participant that joined after phase two passed it", async () => {
            const joiner: TestParticipant = TestParticipant({
                finalized: outcome => {
                    joiner.invoked.push(`finalized ${outcome}`);
                },
            });
            joiner.toString = () => "joiner";

            join({
                commit2: async () => {
                    await Promise.resolve();
                    transaction.addParticipants(joiner);
                },
            });

            await transaction.begin();
            await transaction.commit();

            joiner.expect();
        });

        test("reports once per commit cycle when post-commit writes again", async () => {
            let written = false;
            const p: TestParticipant = join({
                postCommit: () => {
                    if (written) {
                        return;
                    }
                    written = true;
                    transaction.beginSync();
                    transaction.addParticipants(p);
                },

                finalized: outcome => {
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();
            await transaction.commit();

            p.expect("commit1", "commit2", "finalized committed", "commit1", "commit2", "finalized committed");
        });

        test("awaits an asynchronous participant", async () => {
            const p: TestParticipant = join({
                finalized: async outcome => {
                    await Promise.resolve();
                    p.invoked.push(`finalized ${outcome}`);
                },
            });

            await transaction.begin();
            await transaction.commit();

            p.expect("commit1", "commit2", "finalized committed");
        });
    });

    describe("locks and unlocks resource", () => {
        describe("asynchronously", () => {
            test("on becoming exclusive & committing", async () => {
                join();

                const resource = new TestResource();
                await transaction.addResources(resource);

                await transaction.begin();

                expect(resource.lockedBy).equals(transaction);

                await transaction.commit();
                expect(resource.lockedBy).undefined;
            });

            test("on adding to exclusive & rolling back", async () => {
                join();

                await transaction.begin();

                const resource = new TestResource();
                await transaction.addResources(resource);

                expect(resource.lockedBy).equals(transaction);

                await transaction.rollback();
                expect(resource.lockedBy).undefined;
            });
        });

        describe("asynchronously with precommit error", () => {
            test("on becoming exclusive & committing", async () => {
                join({
                    preCommit: async () => {
                        throw new SomeError("oops in async participant");
                    },
                });

                const resource = new TestResource();
                await transaction.addResources(resource);

                await transaction.begin();

                expect(resource.lockedBy).equals(transaction);

                await expect(transaction.commit()).rejectedWith(SomeError);
                expect(resource.lockedBy).undefined;
            });
        });

        describe("synchronously", () => {
            test("on becoming exclusive & rolling back", async () => {
                join();

                const resource = new TestResource();
                transaction.addResourcesSync(resource);

                transaction.beginSync();

                expect(resource.lockedBy).equals(transaction);

                await transaction.rollback();
                expect(resource.lockedBy).undefined;
            });

            test("on adding to exclusive & committing", async () => {
                join();

                transaction.beginSync();

                const resource = new TestResource();
                transaction.addResourcesSync(resource);

                expect(resource.lockedBy).equals(transaction);

                await transaction.commit();
                expect(resource.lockedBy).undefined;
            });
        });

        describe("synchronously with precommit error", () => {
            test("on adding to exclusive & committing", async () => {
                join({
                    preCommit: async () => {
                        throw new SomeError("oops in async participant");
                    },
                });

                transaction.beginSync();

                const resource = new TestResource();
                transaction.addResourcesSync(resource);

                expect(resource.lockedBy).equals(transaction);

                await expect(transaction.commit()).rejectedWith(SomeError);
                expect(resource.lockedBy).undefined;
            });
        });
    });

    describe("blocking locks", () => {
        describe("synchronously", () => {
            test2("throws on becoming exclusive", async () => {
                const resource = new TestResource();

                join();
                transaction.addResourcesSync(resource);
                transaction.beginSync();

                join2();
                transaction2.addResourcesSync(resource);
                expect(() => transaction2.beginSync()).throws(SynchronousTransactionConflictError);
                expect(transaction2.status).equals(Transaction.Status.Shared);
            });

            test2("throws on adding to exclusive", async () => {
                const resource = new TestResource();

                join();
                transaction.addResourcesSync(resource);
                transaction.beginSync();

                join2();
                transaction2.beginSync();
                expect(() => transaction2.addResourcesSync(resource)).throws(SynchronousTransactionConflictError);
                expect(transaction2.status).equals(Transaction.Status.Exclusive);
            });
        });

        describe("asynchronously", () => {
            test2("waits on becoming exclusive", async () => {
                const resource = new TestResource();

                join();
                await transaction.addResources(resource);
                await transaction.begin();

                join2();
                await transaction2.addResources(resource);
                const t2begin = transaction2.begin();

                expect(resource.lockedBy).equals(transaction);
                await transaction.commit();
                await t2begin;
                expect(resource.lockedBy).equals(transaction2);
            });

            test2("waits on adding to exclusive", async () => {
                const resource = new TestResource();

                join();
                await transaction.addResources(resource);
                await transaction.begin();

                join2();
                await transaction2.begin();
                const t2add = /* do not await here! */ transaction2.addResources(resource);

                expect(resource.lockedBy).equals(transaction);
                await transaction.commit();
                await t2add;
                expect(resource.lockedBy).equals(transaction2);
            });
        });
    });

    describe("detects deadlocks", () => {
        test2("directly", async () => {
            const resource1 = new TestResource("Food");
            const resource2 = new TestResource("Water");

            join();
            await transaction.addResources(resource1);
            await transaction.begin();

            join2();
            await transaction2.addResources(resource2);
            await transaction2.begin();
            const t2add1 = /* do not await here! */ transaction2.addResources(resource1);

            await expect(transaction.addResources(resource2)).rejectedWith(TransactionDeadlockError);
            await transaction.rollback();
            await t2add1;
        });

        test3("indirectly", async () => {
            const resource1 = new TestResource("Food");
            const resource2 = new TestResource("Water");
            const resource3 = new TestResource("Shelter");

            join();
            await transaction.addResources(resource1);
            await transaction.begin();

            join2();
            await transaction2.addResources(resource2);
            await transaction2.begin();
            const t2add1 = /* do not await here! */ transaction2.addResources(resource1);

            join3();
            await transaction3.addResources(resource3);
            await transaction3.begin();
            const t3add2 = transaction3.addResources(resource2);

            // 2 waits on 1, 3 waits on 2, then deadlock when 1 waits on 3
            await expect(transaction.addResources(resource3)).rejectedWith(TransactionDeadlockError);
            await transaction.rollback();
            await t2add1;
            await transaction2.rollback();
            await t3add2;
        });
    });

    describe("after destruction", () => {
        function destroyedSync(description: string, fn: () => MaybePromise<void>) {
            it(description, () => {
                const result = Transaction.act("destroyedSync", Lifetime.mock, tx => {
                    transaction = tx;
                });
                expect(result).undefined;

                expect(() => {
                    const result = fn();
                    expect(result).undefined;
                }).throws("Transaction destroyedSync is destroyed");
            });
        }

        function destroyedAsync(description: string, fn: () => Promise<void>) {
            it(description, async () => {
                await Transaction.act("destroyedAsync", Lifetime.mock, async tx => {
                    transaction = tx;
                });

                await expect(fn()).rejectedWith("Transaction destroyedAsync is destroyed");
            });
        }

        destroyedSync("rejects commit", () => transaction.commit());

        destroyedSync("rejects rollback", () => transaction.rollback());

        destroyedSync("rejects addResourcesSync", () => transaction.addResourcesSync(new TestResource()));

        destroyedAsync("rejects addResources", () => transaction.addResources(new TestResource()));

        destroyedSync("rejects addParticipant", () => transaction.addParticipants(TestParticipant()));
    });

    describe("read-only", () => {
        function readonlySync(description: string, fn: () => MaybePromise<void>) {
            it(description, () => {
                transaction = Transaction.open("test", Lifetime.mock, "ro");

                expect(() => {
                    const result = fn();
                    expect(result).undefined;
                }).throws("This view is read-only");
            });
        }

        function readonlyAsync(description: string, fn: () => Promise<void>) {
            it(description, async () => {
                transaction = Transaction.open("test", Lifetime.mock, "ro");

                await expect(fn()).rejectedWith("This view is read-only");
            });
        }

        readonlySync("rejects commit", () => transaction.commit());

        readonlySync("rejects rollback", () => transaction.rollback());

        readonlySync("rejects addResourcesSync", () => transaction.addResourcesSync(new TestResource()));

        readonlyAsync("rejects addResources", () => transaction.addResources(new TestResource()));

        readonlySync("rejects addParticipant", () => transaction.addParticipants(TestParticipant()));
    });
});
