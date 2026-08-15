/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { delay, LineQueue } from "../../src/util/async.js";

async function collect(source: AsyncIterable<string>): Promise<string[]> {
    const lines = new Array<string>();
    for await (const line of source) {
        lines.push(line);
    }
    return lines;
}

describe("LineQueue", () => {
    it("replays buffered lines and tails live for every independent consumer", async () => {
        const queue = new LineQueue();
        queue.push("one");

        // First consumer starts after one line, second after close — both must see everything.
        const first = collect(queue.follow());
        queue.push("two");
        queue.close();

        expect(await first).deep.equal(["one", "two"]);
        expect(await collect(queue)).deep.equal(["one", "two"]);
    });

    it("pump() forwards a source until it ends", async () => {
        const queue = new LineQueue();

        async function* source() {
            yield "a";
            yield "b";
        }

        await queue.pump(source());
        queue.close();

        expect(await collect(queue.follow())).deep.equal(["a", "b"]);
    });

    it("close() is idempotent and ends pending iterations", async () => {
        const queue = new LineQueue();
        const pending = collect(queue.follow());

        queue.close();
        queue.close();

        expect(await pending).deep.equal([]);
    });
});

describe("delay", () => {
    it("resolves 'timeout' after the given time", async () => {
        const timeout = delay(1);
        expect(await timeout.promise).equal("timeout");
    });

    it("cancel() prevents a pending timer from keeping the process alive", async () => {
        const timeout = delay(60_000);
        timeout.cancel();
        // Nothing to await — the assertion is that this test (and the process) doesn't hang;
        // a canceled delay's promise simply never resolves.
    });
});
