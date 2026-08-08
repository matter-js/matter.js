/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogSource } from "../../src/chip/cert/cert-context.js";
import { CertLogClosedError, CertLogTimeoutError, LogFollower } from "../../src/chip/cert/log-follower.js";

/**
 * A push-controlled `AsyncIterable<string>` so tests can decide exactly when lines arrive, without
 * a real process/container behind them.
 */
class TestSource implements AsyncIterable<string> {
    #queue = new Array<string>();
    #waiters = new Array<() => void>();
    #done = false;
    #error?: Error;

    push(line: string): void {
        this.#queue.push(line);
        this.#wake();
    }

    end(): void {
        this.#done = true;
        this.#wake();
    }

    fail(error: Error): void {
        this.#error = error;
        this.#done = true;
        this.#wake();
    }

    #wake(): void {
        const waiters = this.#waiters;
        this.#waiters = new Array();
        for (const waiter of waiters) {
            waiter();
        }
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<string> {
        let index = 0;
        for (;;) {
            while (index < this.#queue.length) {
                yield this.#queue[index++];
            }
            if (this.#error) {
                throw this.#error;
            }
            if (this.#done) {
                return;
            }
            await new Promise<void>(resolve => this.#waiters.push(resolve));
        }
    }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error("waitUntil: condition never became true");
        }
        await new Promise<void>(resolve => setTimeout(resolve, 1));
    }
}

// Lets a synchronously-registered expect() actually reach its wait state before the test pushes a
// line, without depending on a specific number of microtask turns.
function tick(): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, 10));
}

// A follower that resolves promptly on its own wake signal settles well inside this; one that
// silently fell back to its per-expect() timeout would not, at any of the (much larger) timeoutMs
// values used below.
const WAKE_LATENCY_BUDGET_MS = 500;

describe("LogFollower", () => {
    it("buffers every line with a monotonically increasing index", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("line-0");
        source.push("line-1");
        source.push("line-2");
        await waitUntil(() => follower.lines.length === 3);

        expect(follower.lines.map(l => l.index)).deep.equal([0, 1, 2]);
        expect(follower.lines.map(l => l.text)).deep.equal(["line-0", "line-1", "line-2"]);
        expect(follower.lines.every(l => l.at instanceof Date)).equal(true);

        await follower.close();
    });

    it("returns the buffered length from mark(), matching a subsequent lines snapshot", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("line-0");
        source.push("line-1");
        await waitUntil(() => follower.lines.length === 2);

        expect(follower.mark()).equal(2);
        expect(follower.mark()).equal(follower.lines.length);

        await follower.close();
    });

    it("does not match a line emitted before mark()", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("device ready");
        await waitUntil(() => follower.lines.length === 1);
        follower.mark();

        await expect(follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 30 })).rejectedWith(
            CertLogTimeoutError,
        );

        await follower.close();
    });

    it("honors an explicit from cursor even when it precedes the last mark()", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("device ready");
        await waitUntil(() => follower.lines.length === 1);
        const from = follower.mark();
        source.push("device ready again");
        await waitUntil(() => follower.lines.length === 2);
        follower.mark();

        const result = await follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 2_000, from });
        expect(result.verdict).equal("pass");
        if (result.verdict === "pass") {
            expect(result.matched.text).equal("device ready again");
        }

        await follower.close();
    });

    it("matches a line that arrives after expect() is registered, within the timeout", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        const before = Date.now();
        const pending = follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 2_000 });
        await tick();
        source.push("device ready");

        const result = await pending;
        expect(Date.now() - before).lessThan(WAKE_LATENCY_BUDGET_MS);
        expect(result.verdict).equal("pass");
        if (result.verdict === "pass") {
            expect(result.matched.text).equal("device ready");
            expect(result.pattern).equal("/ready/");
        }

        await follower.close();
    });

    it("matches immediately against an already-closed follower's buffer", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("device ready");
        await waitUntil(() => follower.lines.length === 1);
        follower.mark();
        await follower.close();

        const result = await follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 2_000, from: 0 });
        expect(result.verdict).equal("pass");
    });

    it("throws CertLogTimeoutError with the buffered tail when nothing matches before the deadline", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        source.push("unrelated line");
        await waitUntil(() => follower.lines.length === 1);

        try {
            await follower.expect({ chip: /never-appears/ }, { flavor: "chip", timeoutMs: 30 });
            expect.fail("expected a CertLogTimeoutError");
        } catch (e) {
            if (!(e instanceof CertLogTimeoutError)) {
                throw e;
            }
            expect(e.from).equal(0);
            expect(e.pattern).equal("/never-appears/");
            expect(e.tail.map(l => l.text)).deep.equal(["unrelated line"]);
        }

        await follower.close();
    });

    it("keeps the full tail on the error but truncates the message text to the last 20 lines", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        for (let i = 0; i < 25; i++) {
            source.push(`line-${i}`);
        }
        await waitUntil(() => follower.lines.length === 25);

        try {
            await follower.expect({ chip: /never-appears/ }, { flavor: "chip", timeoutMs: 30 });
            expect.fail("expected a CertLogTimeoutError");
        } catch (e) {
            if (!(e instanceof CertLogTimeoutError)) {
                throw e;
            }
            expect(e.tail.length).equal(25);
            expect(e.message).not.include("line-0\n");
            expect(e.message).include("line-24");
        }

        await follower.close();
    });

    it("does not let a stateful /g pattern skip or misattribute matches across repeated scans", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        source.push("aaa ready");
        source.push("bbb ready");
        await waitUntil(() => follower.lines.length === 2);

        // Deliberately reused across both calls: a step module plausibly keeps one pattern constant
        // for use across several expect() calls, which is exactly what makes a /g pattern's shared
        // lastIndex dangerous.
        const pattern = /ready/g;
        const first = await follower.expect({ chip: pattern }, { flavor: "chip", timeoutMs: 2_000, from: 0 });
        const second = await follower.expect({ chip: pattern }, { flavor: "chip", timeoutMs: 2_000, from: 0 });

        expect(first.verdict).equal("pass");
        expect(second.verdict).equal("pass");
        if (first.verdict === "pass" && second.verdict === "pass") {
            expect(first.matched.text).equal("aaa ready");
            expect(second.matched.text).equal("aaa ready");
        }

        await follower.close();
    });

    it("returns unverified when there is no pattern for the active flavor, without waiting or throwing", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        const before = Date.now();
        const result = await follower.expect({ chip: /ready/ }, { flavor: "matterjs", timeoutMs: 5_000 });
        expect(Date.now() - before).lessThan(WAKE_LATENCY_BUDGET_MS);
        expect(result).deep.equal({ verdict: "unverified", reason: "no-pattern-for-flavor" });

        await follower.close();
    });

    it("resolves multiple concurrent expect() calls independently", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        const before = Date.now();
        const alpha = follower.expect({ chip: /alpha/ }, { flavor: "chip", timeoutMs: 2_000 });
        const beta = follower.expect({ chip: /beta/ }, { flavor: "chip", timeoutMs: 2_000 });
        await tick();

        source.push("beta line");
        source.push("alpha line");

        const [alphaResult, betaResult] = await Promise.all([alpha, beta]);
        expect(Date.now() - before).lessThan(WAKE_LATENCY_BUDGET_MS);
        expect(alphaResult.verdict).equal("pass");
        expect(betaResult.verdict).equal("pass");
        if (alphaResult.verdict === "pass") {
            expect(alphaResult.matched.text).equal("alpha line");
        }
        if (betaResult.verdict === "pass") {
            expect(betaResult.matched.text).equal("beta line");
        }

        await follower.close();
    });

    it("rejects a pending expect() when the follower is closed before a match arrives", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        const before = Date.now();
        const pending = follower.expect({ chip: /never/ }, { flavor: "chip", timeoutMs: 5_000 });
        const assertion = expect(pending).rejectedWith(CertLogClosedError);
        await tick();

        await follower.close();

        await assertion;
        expect(Date.now() - before).lessThan(WAKE_LATENCY_BUDGET_MS);
    });

    it("surfaces a source error to a pending expect() instead of leaving it hanging", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        const before = Date.now();
        const pending = follower.expect({ chip: /never/ }, { flavor: "chip", timeoutMs: 5_000 });
        const assertion = expect(pending).rejectedWith("boom");
        await tick();

        source.fail(new Error("boom"));

        await assertion;
        expect(Date.now() - before).lessThan(WAKE_LATENCY_BUDGET_MS);

        await follower.close();
    });

    it("also serves as a LogSource, replaying buffered lines and then tailing new ones", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("first");
        await waitUntil(() => follower.lines.length === 1);

        const logSource: LogSource = follower;
        const iterator = logSource.follow()[Symbol.asyncIterator]();

        const seen = new Array<string>();
        seen.push((await iterator.next()).value as string);

        source.push("second");
        seen.push((await iterator.next()).value as string);

        expect(seen).deep.equal(["first", "second"]);

        await follower.close();
        expect((await iterator.next()).done).equal(true);
    });
});
