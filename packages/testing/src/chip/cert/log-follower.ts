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
    { verdict: "pass"; matched: LogLine; pattern: string } | { verdict: "unverified"; reason: "no-pattern-for-flavor" };

/**
 * Per-implementation-family patterns for a {@link LogFollower.expect} call. A step supplies
 * whichever of these it has evidence for; the active device or controller's flavor selects one.
 */
export interface LogExpectPatterns {
    chip?: RegExp;
    matterjs?: RegExp;
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

// Cert plans express expectations per implementation family, not per concrete DeviceFlavor
// ("chip-docker"/"chip-local" both speak for "chip"); this maps a flavor to the bucket that
// carries its pattern.
function patternFor(patterns: LogExpectPatterns, flavor: string): RegExp | undefined {
    if (flavor.startsWith("chip")) {
        return patterns.chip;
    }
    if (flavor === "matterjs") {
        return patterns.matterjs;
    }
    return undefined;
}

// A caller-supplied /g or /y pattern keeps lastIndex between calls; reused as-is across
// repeated test() calls against different lines, that state silently skips or misattributes
// matches. Stripping once yields a pattern any caller can test() any number of times safely.
export function matchableCopy(pattern: RegExp): RegExp {
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
     */
    mark(): number {
        this.#lastMark = this.#lines.length;
        return this.#lastMark;
    }

    /**
     * Every line seen so far, in arrival order. A fresh copy on each access — callers cannot
     * mutate the follower's own buffer through it.
     */
    get lines(): LogLine[] {
        return [...this.#lines];
    }

    /**
     * Waits for a line at or after the cursor (`options.from`, default: the last {@link mark})
     * matching the pattern for `options.flavor`. Resolves `unverified` immediately if `patterns`
     * has no entry for that flavor. Throws {@link CertLogTimeoutError} if the deadline passes
     * first, or {@link CertLogClosedError} (or the source's own error) if the follower closes
     * first.
     */
    async expect(patterns: LogExpectPatterns, options: LogExpectOptions): Promise<LogExpectResult> {
        const original = patternFor(patterns, options.flavor);
        if (!original) {
            return { verdict: "unverified", reason: "no-pattern-for-flavor" };
        }

        const pattern = matchableCopy(original);
        const from = options.from ?? this.#lastMark;
        const timeout = delay(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        try {
            for (;;) {
                const matched = this.#firstMatchFrom(pattern, from);
                if (matched) {
                    return { verdict: "pass", matched, pattern: String(original) };
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
