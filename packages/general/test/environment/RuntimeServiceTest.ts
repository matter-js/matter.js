/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Construction } from "#util/Construction.js";

/**
 * A worker the runtime must wait on before it can close: construction stays pending until the test
 * releases it, which is the window {@link RuntimeService.cancel} defers a closure into.
 */
class PendingWorker {
    closeCount = 0;
    readonly construction: Construction<PendingWorker>;
    #constructed!: () => void;

    constructor() {
        this.construction = Construction(this, () => new Promise<void>(resolve => (this.#constructed = resolve)));
    }

    async finishConstructing() {
        this.#constructed();
        await this.construction;

        // The closure the runtime scheduled runs on construction's own continuation
        await Promise.resolve();
        await Promise.resolve();
    }

    close() {
        this.closeCount++;
    }
}

/**
 * A worker with no construction to wait on, whose close settles only when the test lets it — the
 * window in which the runtime has begun closing a worker but still holds it.
 */
class SlowClosingWorker {
    closeCount = 0;
    #closed!: () => void;
    readonly closing = new Promise<void>(resolve => (this.#closed = resolve));

    close() {
        this.closeCount++;
        return this.closing;
    }

    finishClosing() {
        this.#closed();
        return this.closing;
    }
}

describe("RuntimeService", () => {
    describe("cancel of a worker that is still constructing", () => {
        it("closes the worker once construction succeeds", async () => {
            const environment = new Environment("test");
            const worker = new PendingWorker();

            environment.runtime.add(worker);
            environment.runtime.cancel();

            await worker.finishConstructing();

            expect(worker.closeCount).equals(1);
        });

        it("does not close the worker if the runtime took on work in the meantime", async () => {
            const environment = new Environment("test");
            const worker = new PendingWorker();

            environment.runtime.add(worker);
            environment.runtime.cancel();
            environment.runtime.add(new Promise<void>(() => {}));

            await worker.finishConstructing();

            expect(worker.closeCount).equals(0);
        });

        it("does not close a worker the runtime no longer owns", async () => {
            const environment = new Environment("test");
            const worker = new PendingWorker();

            environment.runtime.add(worker);
            environment.runtime.cancel();
            environment.runtime.delete(worker);

            await worker.finishConstructing();

            expect(worker.closeCount).equals(0);
        });

        it("closes the worker once when work resumes and the runtime cancels again", async () => {
            const environment = new Environment("test");
            const worker = new PendingWorker();

            environment.runtime.add(worker);
            environment.runtime.cancel();
            environment.runtime.add(new Promise<void>(() => {}));
            environment.runtime.cancel();

            await worker.finishConstructing();

            expect(worker.closeCount).equals(1);
        });
    });

    describe("cancel of a worker whose close does not settle at once", () => {
        it("does not close it again when work resumes and the runtime cancels again", async () => {
            const environment = new Environment("test");
            const worker = new SlowClosingWorker();

            environment.runtime.add(worker);
            environment.runtime.cancel();
            expect(worker.closeCount).equals(1);

            // The close has not settled, so the runtime still holds the worker
            environment.runtime.add(new Promise<void>(() => {}));
            environment.runtime.cancel();

            expect(worker.closeCount).equals(1);

            await worker.finishClosing();
        });
    });
});
