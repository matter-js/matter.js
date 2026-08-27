/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogSource } from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError, LogFollower } from "@matter/testing";

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

    // The hazard mark() has and markSettled() does not: a line the device already wrote but whose
    // delivery is still in flight lands after a plain mark, and a check then reads it as having been
    // caused by whatever the caller does next.
    it("mark() can sit behind a line the source has already produced", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("device ready");
        // Deliberately no drain here — this is what a step doing mark()-then-act looks like
        expect(follower.mark()).equal(0);

        const result = await follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 2_000 });
        expect(result.verdict).equal("pass");

        await follower.close();
    });

    it("markSettled() lets the pump deliver what the source already holds", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("device ready");
        expect(await follower.markSettled()).equal(1);

        await expect(follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 30 })).rejectedWith(
            CertLogTimeoutError,
        );

        await follower.close();
    });

    it("markSettled() still matches a line that arrives after it", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("earlier");
        await follower.markSettled();
        source.push("device ready");

        const result = await follower.expect({ chip: /ready/ }, { flavor: "chip", timeoutMs: 2_000 });
        expect(result.verdict).equal("pass");
        expect(result.verdict === "pass" && result.matched.text).equal("device ready");

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

    it("annotate() appends an indexed, flagged line that shows up in lines and in follow()'s replay", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");

        source.push("real line");
        await waitUntil(() => follower.lines.length === 1);
        follower.annotate("--- banner ---");
        await waitUntil(() => follower.lines.length === 2);

        expect(follower.lines.map(l => ({ index: l.index, text: l.text, synthetic: l.synthetic }))).deep.equal([
            { index: 0, text: "real line", synthetic: undefined },
            { index: 1, text: "--- banner ---", synthetic: true },
        ]);

        const seen = await (async () => {
            const lines = new Array<string>();
            for await (const line of follower.follow()) {
                lines.push(line);
                if (lines.length >= 2) break;
            }
            return lines;
        })();
        expect(seen).deep.equal(["real line", "--- banner ---"]);

        await follower.close();
    });

    it("expect() never matches an annotated line, even against a catch-all pattern", async () => {
        const source = new TestSource();
        const follower = new LogFollower(source, "dut");
        follower.mark();

        follower.annotate("--- banner text that would match anything ---");
        source.push("the real line expect() should find");
        await waitUntil(() => follower.lines.length === 2);

        const result = await follower.expect({ chip: /.*/ }, { flavor: "chip", timeoutMs: 2_000 });
        expect(result.verdict).equal("pass");
        if (result.verdict === "pass") {
            expect(result.matched.text).equal("the real line expect() should find");
        }

        await follower.close();
    });

    /**
     * A follower whose buffer holds exactly `lines`. Awaiting the last line's *index* rather than a
     * pattern is what makes this exact: `expect` resolves on the first match, which for a repeated
     * line is not the point at which every line has arrived.
     */
    async function bufferedFollower(...lines: string[]) {
        const source = new TestSource();
        const follower = new LogFollower(source, "test");
        followers.push(follower);
        for (const line of lines) {
            source.push(line);
        }
        await follower.expect({ chip: /.*/ }, { flavor: "chip", timeoutMs: 2_000, from: lines.length - 1 });
        return follower;
    }

    const followers = new Array<LogFollower>();
    afterEach(async () => {
        // The CI gate runs with MATTER_WTF=1, so a parked #consume left per test is a reported leak
        while (followers.length) {
            await followers.pop()?.close();
        }
    });

    describe("count", () => {
        it("counts matching lines at or after the cursor it was given", async () => {
            const follower = await bufferedFollower("alpha", "beta", "alpha");

            expect(follower.count(/alpha/, 0), "from the start").equal(2);
            expect(follower.count(/alpha/, 1), "past the first").equal(1);
            expect(follower.count(/gamma/, 0), "no match").equal(0);
        });

        it("skips the synthetic lines expect() skips, so a banner cannot be counted", async () => {
            const follower = await bufferedFollower("alpha");
            follower.annotate("alpha in a step banner");

            expect(follower.count(/alpha/, 0)).equal(1);
        });

        it("does not let a caller's /g pattern skip matches through lastIndex", async () => {
            const follower = await bufferedFollower("alpha", "alpha");
            const global = /alpha/g;

            expect(follower.count(global, 0), "first call").equal(2);
            expect(follower.count(global, 0), "same pattern reused").equal(2);
        });

        it("clamps a negative cursor rather than counting from the end", async () => {
            const follower = await bufferedFollower("alpha", "beta");

            expect(follower.count(/alpha|beta/, -2)).equal(2);
        });
    });

    describe("window", () => {
        it("returns count lines from the start index, not up to it", async () => {
            const follower = await bufferedFollower("a", "b", "c", "d");

            expect(follower.window(1, 2).map(({ text }) => text)).deep.equal(["b", "c"]);
        });

        it("clamps to the buffer rather than padding", async () => {
            const follower = await bufferedFollower("a", "b");

            expect(follower.window(1, 10).map(({ text }) => text)).deep.equal(["b"]);
            expect(
                follower.window(-2, 1).map(({ text }) => text),
                "negative start",
            ).deep.equal(["a"]);
            expect(follower.window(0, -1), "negative count").deep.equal([]);
        });
    });

    describe("lastMatchBefore", () => {
        it("finds the nearest preceding match, not the first, and returns its captures", async () => {
            const follower = await bufferedFollower("trace 1", "noise", "trace 2", "dump");
            const found = follower.lastMatchBefore(/trace (\d)/, 3, 10);

            expect(found?.line.text).equal("trace 2");
            expect(found?.match[1], "the capture the caller needs").equal("2");
        });

        it("stops at the lookback bound rather than attributing a far older line", async () => {
            const follower = await bufferedFollower("trace 1", "a", "b", "c", "dump");

            expect(follower.lastMatchBefore(/trace/, 4, 2), "within 2 lines").equal(undefined);
            expect(follower.lastMatchBefore(/trace/, 4, 10)?.line.text, "within 10").equal("trace 1");
        });

        it("measures the bound from the buffer's end when the cursor is past it", async () => {
            // Bounding from a raw out-of-range cursor would put the floor past every line there is
            const follower = await bufferedFollower("trace 1", "dump");

            expect(follower.lastMatchBefore(/trace/, 5_000, 10)?.line.text).equal("trace 1");
        });

        it("skips a synthetic banner sitting between the match and the cursor", async () => {
            // The banner has to land *between* the match and the cursor: annotating after the fact
            // puts it past the cursor, where a scanner ignoring the flag would still return the
            // right line and the test would prove nothing
            const source = new TestSource();
            const follower = new LogFollower(source, "test");
            followers.push(follower);
            source.push("trace 1");
            await follower.expect({ chip: /trace 1/ }, { flavor: "chip", timeoutMs: 2_000, from: 0 });
            follower.annotate("trace 999 in a step banner");
            source.push("dump");
            await follower.expect({ chip: /dump/ }, { flavor: "chip", timeoutMs: 2_000, from: 2 });

            expect(follower.at(1)?.synthetic, "the banner sits between them").equal(true);
            expect(follower.lastMatchBefore(/trace/, 2, 10)?.line.text).equal("trace 1");
        });

        it("excludes the line at the cursor itself", async () => {
            const follower = await bufferedFollower("trace 1", "trace 2");

            expect(follower.lastMatchBefore(/trace/, 1, 10)?.line.text).equal("trace 1");
        });

        it("does not let a caller's /g pattern skip a match", async () => {
            const follower = await bufferedFollower("trace 1", "dump");
            const global = /trace/g;

            expect(follower.lastMatchBefore(global, 1, 10)?.line.text, "first call").equal("trace 1");
            expect(follower.lastMatchBefore(global, 1, 10)?.line.text, "reused").equal("trace 1");
        });
    });
});
