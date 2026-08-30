/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis } from "@matter/main";
import { LineQueue, LogFollower } from "@matter/testing";
import type { TimedInteraction } from "../cert/tc-idm-5.1-support.js";
import {
    expectTimedFollowUp,
    expectTimedRequest,
    expectUnicastReceipt,
    timedRequestSequence,
    timestampMsOf,
} from "../cert/tc-idm-5.1-support.js";

const TIMEOUT = Millis(200);

/** One chip log line: its own timestamp prefix, then the module tag the matchers anchor on. */
function line(atMs: number, text: string) {
    const seconds = Math.floor(atMs / 1000);
    const millis = Math.round(atMs - seconds * 1000);
    return `[${seconds}.${millis.toString().padStart(3, "0")}] [42:42] ${text}`;
}

const T0 = 1786711488_000;

function receipt(atMs: number, category: "S" | "U" | "G", type: string, exchange = "1r", session = "2") {
    return line(
        atMs,
        `[EM] >>> [E:${exchange} S:${session} M:3] (${category}) Msg RX from 1:000000000001B669 --- Type 0001:${type}`,
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

function invokeLines(
    atMs: number,
    options: { suppressResponse?: boolean; timed?: boolean; exchange?: string; session?: string } = {},
) {
    const { suppressResponse = true, timed = true, exchange = "1r", session = "2" } = options;
    return [
        receipt(atMs, "S", "08 (IM:InvokeCommandRequest)", exchange, session),
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

describe("the timed-interaction checks against a matter.js TH", () => {
    // matter.js's own lines, captured from a matterjs-vs-matterjs certification run. It names the
    // session and the exchange on the timed request itself, and clears the interaction the follow-up
    // consumed by that exchange's decimal id (0x69e4 = 27108).
    const SESSION = "@1:b3e096d0761f85d9•8657";
    const EXCHANGE = "69e4";

    function at(millis: number) {
        const iso = new Date(T0 + millis).toISOString();
        return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`;
    }

    const timedRequest = (session = SESSION, exchange = EXCHANGE, interval = "200ms") =>
        `${at(0)} DEBUG InteractionServer Timed request « ${session}⇵${exchange} interval: ${interval}`;
    const followUpMessage = (afterMs: number, kind = "InvokeRequest", exchange = EXCHANGE, session = SESSION) =>
        `${at(afterMs)} DEBUG MessageExchange Message « for: I/${kind} id: ${session}⇵${exchange}✉0133414f type: 0x1/0x8 reqAck size: 35`;
    const cleared = (afterMs: number, exId = parseInt(EXCHANGE, 16), session = SESSION) =>
        `${at(afterMs)} DEBUG MessageExchange Clearing timed interaction exId: ${exId} via: ${session}@udp://[fe80::1%eth0]:36923`;

    async function timedAndFollowUp(lines: string[], interaction: TimedInteraction = "invoke") {
        return withFollower(lines, async follower => {
            const timed = await expectTimedRequest(follower, "matterjs", TIMEOUT, 0, Millis(200));
            return {
                timed,
                followUp: await expectTimedFollowUp(follower, "matterjs", interaction, timed, TIMEOUT, Millis(200)),
            };
        });
    }

    it("finds the timed request naming the interval the step asked for", async () => {
        const { timed } = await timedAndFollowUp([timedRequest(), followUpMessage(10), cleared(10)]);

        expect(timed.outcome).equal("found");
        expect(timed.check.verdict).equal("pass");
    });

    it("does not accept a timed request asking for another interval", async () => {
        const { timed } = await timedAndFollowUp([timedRequest(SESSION, EXCHANGE, "2s")]);

        expect(timed.outcome).equal("failed");
        expect(timed.check.verdict).equal("fail");
    });

    it("reads the session the request arrived on off the request's own line", async () => {
        const { timed } = await withFollower([timedRequest()], async follower => ({
            timed: await expectTimedRequest(follower, "matterjs", TIMEOUT, 0, Millis(200)),
        }));

        expect(expectUnicastReceipt(timed).verdict).equal("pass");
        expect(expectUnicastReceipt(timed).detail).contains(EXCHANGE);
    });

    it("fails a timed request that arrived over a group session", async () => {
        const { timed } = await withFollower([timedRequest("•group#4f2b")], async follower => ({
            timed: await expectTimedRequest(follower, "matterjs", TIMEOUT, 0, Millis(200)),
        }));

        expect(expectUnicastReceipt(timed).verdict).equal("fail");
    });

    it("passes when the follow-up arrives on the same exchange and is taken as the timed one", async () => {
        const { followUp } = await timedAndFollowUp([timedRequest(), followUpMessage(20), cleared(20)]);

        expect(followUp.verdict).equal("pass");
        expect(followUp.detail).contains("20.0ms");
    });

    it("passes for a write, whose message matter.js does not flag at all", async () => {
        const { followUp } = await timedAndFollowUp(
            [timedRequest(), followUpMessage(5, "WriteRequest"), cleared(5)],
            "write",
        );

        expect(followUp.verdict).equal("pass");
    });

    it("does not take another exchange's message for this timed request's follow-up", async () => {
        const { followUp } = await timedAndFollowUp([
            timedRequest(),
            followUpMessage(10, "InvokeRequest", "69e5"),
            cleared(10, parseInt("69e5", 16)),
        ]);

        expect(followUp.verdict).equal("fail");
    });

    it("does not accept a message the device never treated as the timed interaction", async () => {
        const { followUp } = await timedAndFollowUp([timedRequest(), followUpMessage(10)]);

        expect(followUp.verdict).equal("fail");
    });

    it("does not take another session's identically numbered exchange for this one", async () => {
        // An exchange id is unique only within a session, so a second CASE session can hold one with
        // the same number at the same time.
        const OTHER = "@1:b3e096d0761f85d9•9f2c";
        const { followUp } = await timedAndFollowUp([
            timedRequest(),
            followUpMessage(10, "InvokeRequest", EXCHANGE, OTHER),
            cleared(10, parseInt(EXCHANGE, 16), OTHER),
        ]);

        expect(followUp.verdict).equal("fail");
    });

    it("does not accept another session clearing its own timed interaction as this one's proof", async () => {
        const { followUp } = await timedAndFollowUp([
            timedRequest(),
            followUpMessage(10),
            cleared(10, parseInt(EXCHANGE, 16), "@1:b3e096d0761f85d9•9f2c"),
        ]);

        expect(followUp.verdict).equal("fail");
    });

    it("fails a follow-up that arrived after the window it was promised", async () => {
        const { followUp } = await timedAndFollowUp([
            timedRequest(),
            followUpMessage(TIMEOUT + 100),
            cleared(TIMEOUT + 100),
        ]);

        expect(followUp.verdict).equal("fail");
        expect(followUp.detail).contains("300.0ms");
    });
});

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

    it("reports unverified for a flavor neither implementation's patterns speak for", async () => {
        const result = await withFollower(timedRequestLines(T0), follower =>
            expectTimedRequest(follower, "python", TIMEOUT, 0, Millis(500)),
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
    async function followUp(lines: string[], interaction: TimedInteraction = "invoke") {
        return withFollower(lines, async follower => {
            const timed = await expectTimedRequest(follower, "chip-local", TIMEOUT, 0, Millis(500));
            return expectTimedFollowUp(follower, "chip-local", interaction, timed, TIMEOUT, Millis(500));
        });
    }

    it("passes when the flagged message follows inside the window", async () => {
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 + 20)]);

        expect(check.verdict).equal("pass");
        expect(check.detail).contains("20.0ms");
    });

    it("does not take another session's identically numbered exchange for this one", async () => {
        // An exchange id is unique only within its session, so a second session can hold one with the
        // same number at the same time
        const check = await followUp([...timedRequestLines(T0), ...invokeLines(T0 + 20, { session: "3" })]);

        expect(check.verdict).equal("fail");
    });

    it("passes when the optional suppressResponse line is absent, as a matter.js write is", async () => {
        const lines = [
            ...timedRequestLines(T0),
            receipt(T0 + 5, "S", "06 (IM:WriteRequest)"),
            line(T0 + 5, "[DMG] WriteRequestMessage ="),
            line(T0 + 5, "[DMG] {"),
            line(T0 + 5, "[DMG] \ttimedRequest = true, "),
        ];

        expect((await followUp(lines, "write")).verdict).equal("pass");
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
                "invoke",
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
                "invoke",
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
