/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { delay } from "../../util/async.js";
import { deansify } from "../../util/text.js";
import type { LogSource } from "./cert-context.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * A single buffered log line, with the cursor position it occupies in the follower's buffer.
 */
export interface LogLine {
    index: number;
    at: Date;
    text: string;
    /** Set on a line added via {@link LogFollower.annotate} — never matched by {@link LogFollower.expect}. */
    synthetic?: true;
}

export type LogExpectResult =
    | { verdict: "pass"; matched: LogLine; pattern: string }
    | { verdict: "unverified"; reason: "no-pattern-for-flavor" };

/**
 * Per-implementation-family patterns for a {@link LogFollower.expect} call. A step supplies
 * whichever of these it has evidence for; the active device or controller's flavor selects one.
 */
export interface LogExpectPatterns {
    chip?: RegExp;
    matterjs?: RegExp;
}

/**
 * Per-implementation-family line sequences: {@link LogExpectPatterns}'s analogue for an expectation
 * spanning several consecutive lines, whose length differs per family (one implementation's dump of a
 * message can take a dozen lines where another's takes one).
 */
export interface LogExpectSequences {
    chip?: RegExp[];
    matterjs?: RegExp[];
}

export interface LogExpectOptions {
    flavor: string;
    timeoutMs?: number;
    from?: number;
}

/**
 * Thrown by {@link LogFollower.expect} when no buffered or newly-arrived line matches before the
 * deadline.
 */
export class CertLogTimeoutError extends Error {
    constructor(
        readonly pattern: string,
        readonly from: number,
        readonly tail: LogLine[],
    ) {
        super(
            `Timed out waiting for ${pattern} (from index ${from}); last lines: ` +
                tail
                    .slice(-20)
                    .map(line => line.text)
                    .join("\n"),
        );
    }
}

/**
 * Thrown by {@link LogFollower.expect} when the follower closes (or its source runs out) while the
 * expectation is still pending and unmatched.
 */
export class CertLogClosedError extends Error {
    constructor(name: string) {
        super(`Log follower "${name}" closed before a pending expect() matched`);
    }
}

/**
 * The variant `flavor`'s implementation family carries, or `undefined` where the caller supplied
 * none for it.
 *
 * Cert plans express expectations per implementation family, not per concrete DeviceFlavor
 * ("chip-docker"/"chip-local" both speak for "chip"), and they express them as single patterns
 * ({@link LogExpectPatterns}) or as sequences ({@link LogExpectSequences}) — hence the generic.
 */
export function forFlavor<T>(variants: { chip?: T; matterjs?: T }, flavor: string): T | undefined {
    if (flavor.startsWith("chip")) {
        return variants.chip;
    }
    if (flavor === "matterjs") {
        return variants.matterjs;
    }
    return undefined;
}

// A caller-supplied /g or /y pattern keeps lastIndex between calls; reused as-is across the
// repeated buffer scans in expect()'s wait loop, that state silently skips or misattributes
// matches. Stripping once yields a pattern expect() can test() any number of times safely.
function matchableCopy(pattern: RegExp): RegExp {
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
}

/**
 * Buffers every line from an `AsyncIterable<string>` log source and lets cert-test steps assert
 * that a matching line appears within a cursor window, without depending on any particular
 * implementation's log format directly (a step supplies a chip-flavored and/or matterjs-flavored
 * pattern; {@link expect} picks the one for the device or controller actually under test).
 *
 * Also implements {@link LogSource} so a follower can itself be consumed by another follower or
 * assigned to a {@link CertDevice}/{@link ControllerAdapter}'s `log` field.
 */
export class LogFollower implements LogSource {
    readonly name: string;

    #lines = new Array<LogLine>();
    #lastMark = 0;
    #closed = false;
    #closeError?: Error;
    #waiters = new Array<() => void>();
    #resolveCloseSignal!: () => void;
    #closeSignal: Promise<void>;
    #pump: Promise<void>;

    constructor(source: AsyncIterable<string>, name: string) {
        this.name = name;
        this.#closeSignal = new Promise<void>(resolve => {
            this.#resolveCloseSignal = resolve;
        });
        this.#pump = this.#consume(source);
    }

    /**
     * Appends a synthetic line (e.g. a step-boundary banner) to the buffer at the current position,
     * indexed like a real line but flagged so {@link expect} skips it. Lets a caller mark the
     * chronologically right position in the evidence `.log` output without that marker ever
     * satisfying a step's own pattern.
     */
    annotate(text: string): void {
        this.#lines.push({ index: this.#lines.length, at: new Date(), text, synthetic: true });
        this.#wake();
    }

    /**
     * Sets the default cursor a subsequent {@link expect} call scans from when it doesn't specify
     * `from` itself. Typically called once at the start of a step.
     *
     * This counts lines **ingested**, not lines the device has printed. The pump reads its source
     * asynchronously, so a line the device wrote just before this call may still be in flight and
     * land at an index at or after the mark — where a check reads it as having been caused by
     * whatever the caller does next. Use {@link markSettled} for a mark that has to separate cause
     * from effect.
     */
    mark(): number {
        this.#lastMark = this.#lines.length;
        return this.#lastMark;
    }

    /**
     * {@link mark}, after letting the pump deliver what its source already holds.
     *
     * This is the mark to take before doing something whose effect a later check attributes to it:
     * a plain {@link mark} can sit *behind* a line the device had already written, and the check
     * then passes on evidence that predates its own cause.
     *
     * What it promises is bounded, and deliberately so: it yields two macrotask turns, which is what
     * every source this class is given today needs — a process stream, a {@link LineQueue}, or a
     * follower reading another follower all reach {@link #consume} through microtasks after one poll
     * phase. A source that inserts a macrotask of its own between read and append would need more,
     * and would get a mark that is silently too early rather than an error. A line the device has not
     * yet flushed is not observable by any means here.
     */
    async markSettled(): Promise<number> {
        // Two turns: the first lets a pending read resolve, the second lets the pump's own
        // continuation append what it read.
        await delay(0).promise;
        await delay(0).promise;
        return this.mark();
    }

    /**
     * Every line seen so far, in arrival order. A fresh copy on each access — callers cannot
     * mutate the follower's own buffer through it. Prefer {@link count} and {@link lastMatchBefore}
     * for scanning: they read the buffer directly, where this copies all of it per access.
     */
    get lines(): LogLine[] {
        return [...this.#lines];
    }

    /** The line at `index`, or `undefined` past the end. */
    at(index: number): LogLine | undefined {
        return this.#lines[index];
    }

    /**
     * `count` lines starting at `from`, clamped to the buffer. Not named `slice`, whose second
     * argument is an end index.
     *
     * Reads the buffer directly, where {@link lines} copies all of it: a caller scanning a fixed
     * window inside a wait loop otherwise copies the whole log once per iteration.
     */
    window(from: number, count: number): LogLine[] {
        const start = Math.max(0, from);
        return this.#lines.slice(start, start + Math.max(0, count));
    }

    /**
     * How many lines at or after `from` match `pattern` — for a "repeat N times, expect N
     * successes" check. Skips synthetic lines, as {@link expect} does.
     *
     * `from` is required deliberately: {@link expect} defaults its cursor to the last {@link mark},
     * and a count defaulting to the whole buffer instead would silently include every earlier step's
     * lines.
     */
    count(pattern: RegExp, from: number): number {
        const matchable = matchableCopy(pattern);
        let matches = 0;
        for (let i = Math.max(0, from); i < this.#lines.length; i++) {
            const line = this.#lines[i];
            if (!line.synthetic && matchable.test(line.text)) {
                matches++;
            }
        }
        return matches;
    }

    /**
     * The nearest line before `before` matching `pattern`, searching back at most `within` lines,
     * with the match it produced. Skips synthetic lines, as {@link expect} does.
     *
     * chip logs one message at a time, so the nearest preceding trace line belongs to the message
     * whose decode dump starts at `before` — which is what makes scanning backward correct however
     * many raw-frame lines that message's payload produced. `within` bounds it: unbounded, a search
     * that finds nothing nearby keeps going and attributes a line from minutes earlier.
     *
     * The match comes back with the line so a caller reading capture groups does not re-`exec` the
     * pattern it passed: this scans with a `g`/`y`-stripped copy, and a second `exec` of the
     * caller's own pattern would not have that protection.
     */
    lastMatchBefore(
        pattern: RegExp,
        before: number,
        within: number,
    ): { line: LogLine; match: RegExpExecArray } | undefined {
        const matchable = matchableCopy(pattern);
        const end = Math.min(before, this.#lines.length);
        const floor = Math.max(0, end - within);
        for (let i = end - 1; i >= floor; i--) {
            const line = this.#lines[i];
            if (line.synthetic) {
                continue;
            }
            const match = matchable.exec(line.text);
            if (match !== null) {
                return { line, match };
            }
        }
        return undefined;
    }

    /**
     * Waits for a line at or after the cursor (`options.from`, default: the last {@link mark})
     * matching the pattern for `options.flavor`. Resolves `unverified` immediately if `patterns`
     * has no entry for that flavor. Throws {@link CertLogTimeoutError} if the deadline passes
     * first, or {@link CertLogClosedError} (or the source's own error) if the follower closes
     * first.
     */
    async expect(patterns: LogExpectPatterns, options: LogExpectOptions): Promise<LogExpectResult> {
        const original = forFlavor(patterns, options.flavor);
        if (!original) {
            return { verdict: "unverified", reason: "no-pattern-for-flavor" };
        }

        return { verdict: "pass", matched: await this.expectPattern(original, options), pattern: String(original) };
    }

    /**
     * As {@link expect}, for a caller that has already selected the pattern for the flavor it runs
     * under — a multi-line expectation resolves its whole sequence with {@link forFlavor} once, then
     * waits for each line of it here. Has no `unverified` outcome for that reason.
     */
    async expectPattern(original: RegExp, options: Omit<LogExpectOptions, "flavor">): Promise<LogLine> {
        const pattern = matchableCopy(original);
        const from = options.from ?? this.#lastMark;
        const timeout = delay(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        try {
            for (;;) {
                const matched = this.#firstMatchFrom(pattern, from);
                if (matched) {
                    return matched;
                }

                if (this.#closeError) {
                    throw this.#closeError;
                }
                if (this.#closed) {
                    throw new CertLogClosedError(this.name);
                }

                const outcome = await Promise.race([this.#waitForWake(), timeout.promise]);
                if (outcome === "timeout") {
                    throw new CertLogTimeoutError(String(original), from, this.#lines.slice(from));
                }
            }
        } finally {
            timeout.cancel();
        }
    }

    follow(): AsyncIterable<string> {
        return this.#replay();
    }

    async close(): Promise<void> {
        this.#resolveCloseSignal();
        await this.#pump;
    }

    /**
     * The first line at or after `from` matching `pattern`, or `undefined` where the buffer holds none.
     *
     * The synchronous half of {@link expectPattern}, for a caller that has to tell "not in the log"
     * from "not in the log yet" — one draining what has arrived before deciding how long to wait for
     * more cannot express that through {@link expectPattern}, which does both in one call.
     */
    firstMatchFrom(pattern: RegExp, from: number): LogLine | undefined {
        return this.#firstMatchFrom(matchableCopy(pattern), from);
    }

    #firstMatchFrom(pattern: RegExp, from: number): LogLine | undefined {
        for (let i = from; i < this.#lines.length; i++) {
            if (this.#lines[i].synthetic) {
                continue;
            }
            if (pattern.test(this.#lines[i].text)) {
                return this.#lines[i];
            }
        }
        return undefined;
    }

    #waitForWake(): Promise<"activity"> {
        return new Promise(resolve => this.#waiters.push(() => resolve("activity")));
    }

    #wake(): void {
        const waiters = this.#waiters;
        this.#waiters = new Array<() => void>();
        for (const waiter of waiters) {
            waiter();
        }
    }

    async *#replay(): AsyncGenerator<string> {
        let index = 0;
        for (;;) {
            while (index < this.#lines.length) {
                yield this.#lines[index++].text;
            }
            if (this.#closed) {
                return;
            }
            await new Promise<void>(resolve => this.#waiters.push(resolve));
        }
    }

    // #closeSignal is a single reused promise, so close() ends the loop immediately without
    // forcing the source's iterator closed (which could hang on a source parked mid-await).
    // Never rethrows: failures land on #closeError for expect() to surface, so #pump always
    // resolves and close() has nothing to catch.
    async #consume(source: AsyncIterable<string>): Promise<void> {
        const iterator = source[Symbol.asyncIterator]();
        try {
            for (;;) {
                const outcome = await Promise.race([
                    iterator.next().then(result => ({ closed: false as const, result })),
                    this.#closeSignal.then(() => ({ closed: true as const })),
                ]);

                if (outcome.closed || outcome.result.done) {
                    return;
                }

                // chip binaries colorize log output even when stdout isn't a TTY; a trailing ANSI reset
                // sequence after the visible text breaks any pattern anchored on end-of-line ($).
                this.#lines.push({ index: this.#lines.length, at: new Date(), text: deansify(outcome.result.value) });
                this.#wake();
            }
        } catch (e) {
            this.#closeError = e instanceof Error ? e : new Error(String(e));
            console.warn(`Log follower "${this.name}" lost its source:`, this.#closeError);
        } finally {
            this.#closed = true;
            this.#wake();
        }
    }
}
