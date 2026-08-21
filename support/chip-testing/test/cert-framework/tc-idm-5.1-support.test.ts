/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis } from "@matter/main";
import { LineQueue, LogFollower } from "@matter/testing";
import {
    expectTimedFollowUp,
    expectTimedRequest,
    expectUnicastReceipt,
    timedRequestSequence,
    timestampMsOf,
} from "../cert/tc-idm-5.1-support.js";
import { INVOKE_REQUEST_MESSAGE, WRITE_REQUEST_MESSAGE } from "../cert/tc-support.js";

const TIMEOUT = Millis(200);

/** One chip log line: its own timestamp prefix, then the module tag the matchers anchor on. */
function line(atMs: number, text: string) {
    const seconds = Math.floor(atMs / 1000);
    const millis = Math.round(atMs - seconds * 1000);
    return `[${seconds}.${millis.toString().padStart(3, "0")}] [42:42] ${text}`;
}

const T0 = 1786711488_000;

function receipt(atMs: number, category: "S" | "U" | "G", type: string, exchange = "1r") {
    return line(
        atMs,
        `[EM] >>> [E:${exchange} S:2 M:3] (${category}) Msg RX from 1:000000000001B669 --- Type 0001:${type}`,
    );
}

function timedRequestLines(atMs: number, category: "S" | "U" | "G" = "S") {
    return [
        receipt(atMs, category, "0a (IM:TimedRequest)"),
        line(atMs, "[DMG] TimedRequestMessage ="),
        line(atMs, "[DMG] {"),
        line(atMs, `[DMG] \tTimeoutMs = 0x${TIMEOUT.toString(16)},`),
        line(atMs, "[DMG] }"),
    ];
}

function invokeLines(atMs: number, options: { suppressResponse?: boolean; timed?: boolean; exchange?: string } = {}) {
    const { suppressResponse = true, timed = true, exchange = "1r" } = options;
    return [
        receipt(atMs, "S", "08 (IM:InvokeCommandRequest)", exchange),
        line(atMs, "[DMG] InvokeRequestMessage ="),
        line(atMs, "[DMG] {"),
        ...(suppressResponse ? [line(atMs, "[DMG] \tsuppressResponse = false, ")] : []),
        ...(timed ? [line(atMs, "[DMG] \ttimedRequest = true, ")] : []),
        line(atMs, "[DMG] \tInvokeRequests ="),
    ];
}

async function withFollower<T>(lines: string[], body: (follower: LogFollower) => Promise<T>): Promise<T> {
    const source = new LineQueue();
    const follower = new LogFollower(source.follow(), "th");
    for (const text of lines) {
        source.push(text);
    }
    try {
        return await body(follower);
    } finally {
        source.close();
        await follower.close();
    }
}

describe("timestampMsOf", () => {
    it("reads a millisecond fraction, as the harness image's own build prints", () => {
        expect(timestampMsOf("[1786711488.301] [42:42] [DMG] x")).equal(1786711488_301);
    });

    it("reads a microsecond fraction, as the certification captures carry", () => {
        expect(timestampMsOf("[1655797318.626273][7331:7331] CHIP:DMG: x")).equal(1655797318_626.273);
    });

    it("is undefined for a line carrying no timestamp", () => {
        expect(timestampMsOf("[DMG] TimedRequestMessage =")).equal(undefined);
    });
});

describe("timedRequestSequence", () => {
    it("asks for the timeout in chip's own bare lowercase hex", () => {
        const sequence = timedRequestSequence(Millis(200));

        expect(sequence).to.have.lengthOf(3);
        expect(sequence[2].test("[DMG] \tTimeoutMs = 0xc8,")).equal(true);
        expect(sequence[2].test("[DMG] \tTimeoutMs = 0xc9,")).equal(false);
    });
});

describe("expectTimedRequest", () => {
    it("matches the block and returns the line it matched", async () => {
        const result = await withFollower(timedRequestLines(T0), follower =>
            expectTimedRequest(follower, "chip-local", TIMEOUT, 0, Millis(500)),
        );

        expect(result.check.verdict).equal("pass");
        expect(result.outcome).equal("found");
        expect(result.outcome === "found" ? result.line.text : "").contains("TimeoutMs = 0xc8,");
    });

    it("fails when the device was asked for a different timeout", async () => {
        const result = await withFollower(timedRequestLines(T0), follower =>
            expectTimedRequest(follower, "chip-local", Millis(300), 0, Millis(200)),
        );

        expect(result.check.verdict).equal("fail");
        expect(result.outcome).equal("failed");
    });

    it("reports unverified for a flavor with no pattern for the message", async () => {
        const result = await withFollower(timedRequestLines(T0), follower =>
            expectTimedRequest(follower, "matterjs", TIMEOUT, 0, Millis(500)),
        );

        expect(result.check.verdict).equal("unverified");
    });
});

describe("expectUnicastReceipt", () => {
    async function categoryVerdict(category: "S" | "U" | "G") {
        return withFollower(timedRequestLines(T0, category), async follower => {
            const timed = await expectTimedRequest(follower, "chip-local", TIMEOUT, 0, Millis(500));
            return expectUnicastReceipt(timed);
        });
    }

    it("passes for a secure unicast session", async () => {
        expect((await categoryVerdict("S")).verdict).equal("pass");
    });

    it("passes for an unencrypted unicast session", async () => {
        expect((await categoryVerdict("U")).verdict).equal("pass");
    });

    it("fails for a group session", async () => {
        const check = await categoryVerdict("G");

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("group session");
    });

    it("fails when no receive line precedes the message", async () => {
        const check = await withFollower(timedRequestLines(T0).slice(1), async follower => {
            const timed = await expectTimedRequest(follower, "chip-local", TIMEOUT, 0, Millis(500));
            return expectUnicastReceipt(timed);
        });

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("No receive line");
    });

    it("reports unverified for a flavor whose log names no timed request", () => {
        expect(
            expectUnicastReceipt({ outcome: "unnamed", check: { type: "device-log", verdict: "unverified" } }).verdict,
        ).equal("unverified");
    });

    it("hands a failed search's own reason to the consumer, not a bare unverified", () => {
        // Callers gate on `check` before getting here, so this is the guard for one that forgets
        const check = expectUnicastReceipt({
            outcome: "failed",
            check: { type: "device-log", verdict: "fail", detail: "no TimedRequestMessage arrived" },
        });

        expect(check.verdict).equal("fail");
        expect(check.detail).equal("no TimedRequestMessage arrived");
    });
});

describe("expectTimedFollowUp", () => {
    async function followUp(lines: string[], message = INVOKE_REQUEST_MESSAGE) {
        return withFollower(lines, async follower => {
            const timed = await expectTimedRequest(follower, "chip-local", TIMEOUT, 0, Millis(500));
            return expectTimedFollowUp(follower, "chip-local", message, timed, TIMEOUT, Millis(500));
        });
    }

    it("passes when the flagged message follows inside the window", async () => {
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 + 20)]);

        expect(check.verdict).equal("pass");
        expect(check.detail).contains("20.0ms");
    });

    it("passes when the optional suppressResponse line is absent, as a matter.js write is", async () => {
        const lines = [
            ...timedRequestLines(T0),
            receipt(T0 + 5, "S", "06 (IM:WriteRequest)"),
            line(T0 + 5, "[DMG] WriteRequestMessage ="),
            line(T0 + 5, "[DMG] {"),
            line(T0 + 5, "[DMG] \ttimedRequest = true, "),
        ];

        expect((await followUp(lines, WRITE_REQUEST_MESSAGE)).verdict).equal("pass");
    });

    it("fails when the message arrives after the window it was promised", async () => {
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 + TIMEOUT + 1)]);

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("201.0ms");
    });

    it("does not accept a later message's flag as this one's", async () => {
        const check = await followUp([
            ...timedRequestLines(T0),
            ...invokeLines(T0 + 10, { timed: false }),
            ...invokeLines(T0 + 20),
        ]);

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("carries no timedRequest flag");
    });

    it("reports unverified for a flavor whose log names no timed request", async () => {
        const check = await withFollower([], follower =>
            expectTimedFollowUp(
                follower,
                "chip-local",
                INVOKE_REQUEST_MESSAGE,
                { outcome: "unnamed", check: { type: "device-log", verdict: "unverified" } },
                TIMEOUT,
                Millis(500),
            ),
        );

        expect(check.verdict).equal("unverified");
    });

    it("hands a failed search's own reason to the follow-up check, not a bare unverified", async () => {
        const check = await withFollower([], follower =>
            expectTimedFollowUp(
                follower,
                "chip-local",
                INVOKE_REQUEST_MESSAGE,
                {
                    outcome: "failed",
                    check: { type: "device-log", verdict: "fail", detail: "no TimedRequestMessage arrived" },
                },
                TIMEOUT,
                Millis(500),
            ),
        );

        expect(check.verdict).equal("fail");
        expect(check.detail).equal("no TimedRequestMessage arrived");
    });

    it("skips an interaction on another exchange and reports the one this request opened", async () => {
        const check = await followUp([
            ...timedRequestLines(T0),
            ...invokeLines(T0 + 10, { exchange: "9r" }),
            ...invokeLines(T0 + 20),
        ]);

        expect(check.verdict).equal("pass");
        expect(check.detail).contains("20.0ms");
    });

    it("fails when only another exchange's interaction follows", async () => {
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 + 10, { exchange: "9r" })]);

        expect(check.verdict).equal("fail");
    });

    it("fails when the log's own clock moved backwards between the two messages", async () => {
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 - 40)]);

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("-40.0ms");
    });

    it("names the message when it carries no flag and nothing later does either", async () => {
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 + 10, { timed: false })]);

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("carries no timedRequest flag");
    });
});
