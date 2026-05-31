/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Resource } from "#transaction/Resource.js";
import { ResourceSet } from "#transaction/ResourceSet.js";
import type { Transaction } from "#transaction/Transaction.js";
import { SynchronousTransactionConflictError, TransactionFlowError } from "#transaction/errors.js";

function resource(name: string): Resource {
    return { toString: () => name };
}

function transaction(via: string, resources: Resource[] = []) {
    return { via, resources } as unknown as Transaction;
}

describe("Resource", () => {
    describe("isLocked", () => {
        it("reports an unlocked resource", () => {
            expect(Resource.isLocked(resource("r"))).equal(false);
        });

        it("reports a locked resource", () => {
            const r = resource("r");
            r.lockedBy = transaction("tx");
            expect(Resource.isLocked(r)).equal(true);
        });

        it("follows a reference chain", () => {
            const target = resource("target");
            target.lockedBy = transaction("tx");
            const standin = resource("standin");
            standin[Resource.reference] = target;

            expect(Resource.isLocked(standin)).equal(true);
        });
    });
});

describe("ResourceSet", () => {
    it("locks free resources synchronously", () => {
        const tx = transaction("tx");
        const r1 = resource("r1");
        const r2 = resource("r2");
        const set = new ResourceSet(tx, [r1, r2]);

        const locked = set.acquireLocksSync();

        expect(locked.size).equal(2);
        expect(r1.lockedBy).equal(tx);
        expect(r2.lockedBy).equal(tx);
    });

    it("dereferences standin resources in the constructor", () => {
        const tx = transaction("tx");
        const target = resource("target");
        const standin = resource("standin");
        standin[Resource.reference] = target;
        const set = new ResourceSet(tx, [standin]);

        expect([...set]).deep.equal([target]);
    });

    it("treats a resource already locked by the same transaction as held", () => {
        const tx = transaction("tx");
        const r = resource("r");
        r.lockedBy = tx;

        expect(() => new ResourceSet(tx, [r]).acquireLocksSync()).not.throws();
    });

    it("throws when a resource is locked by another transaction", () => {
        const tx = transaction("tx");
        const other = transaction("other");
        const r = resource("r");
        r.lockedBy = other;

        expect(() => new ResourceSet(tx, [r]).acquireLocksSync()).throws(SynchronousTransactionConflictError);
    });

    it("releases only locks held by this transaction", () => {
        const tx = transaction("tx");
        const other = transaction("other");
        const mine = resource("mine");
        const theirs = resource("theirs");
        mine.lockedBy = tx;
        theirs.lockedBy = other;
        const set = new ResourceSet(tx, [mine, theirs]);

        const released = set.releaseLocks();

        expect([...released]).deep.equal([mine]);
        expect(mine.lockedBy).undefined;
        expect(theirs.lockedBy).equal(other);
    });

    it("asserts all resources are locked", () => {
        const tx = transaction("tx");
        const r = resource("r");
        const tracked = transaction("tx", [r]);
        const set = new ResourceSet(tx, [r]);

        expect(() => set.assertResourcesAreLocked(tracked, "commit")).throws(
            TransactionFlowError,
            "does not have all resources locked",
        );
    });
});
