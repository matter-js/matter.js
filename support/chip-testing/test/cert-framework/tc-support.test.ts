/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Millis, Time, Seconds } from "@matter/main";
import type { CertNodeApi, CertStepContext, CheckRecord, ControllerAdapter } from "@matter/testing";
import { LogFollower } from "@matter/testing";
import {
    attributePathIBSequence,
    CertCheckFailedError,
    CertCleanupError,
    CommissionedRefs,
    commandPathIBSequence,
    EVENT_PATH_IBS_SEQUENCE,
    eventPathIBSequence,
    expectChunkedTransfer,
    expectCommandInvoke,
    expectMessageWithPath,
    expectRejection,
    expectReportAck,
    expectSequence,
    expectSubscriptionId,
    fabricFilteredPattern,
    READ_REQUEST_MESSAGE,
    recordAll,
    requireId,
    WRITE_REQUEST_MESSAGE,
} from "../cert/tc-support.js";

const EXCHANGE = 26481;
const CHUNK = "[DMG] ReportDataMessage =";
const NOISE = "[DMG] AttributeReportIBs =";

// chip prints the outbound trace line, then the chunk's decode dump; the DUT's ack arrives on the
// same Exchange, on a different Session. Shapes verified against a real chip-all-clusters-app log.
const sentLine = (exchange = EXCHANGE) =>
    `[DMG] >> to UDP:[fe80::1%eth0]:58253 | 92720281 | [Interaction Model  (1) / Report Data (0x05) / Session = 56179 / Exchange = ${exchange}]`;
const ackLine = (exchange = EXCHANGE) =>
    `[DMG] << from UDP:[fe80::1%eth0]:58253 | 208635799 | [Interaction Model  (1) / Status Response (0x01) / Session = 13606 / Exchange = ${exchange}]`;

/** One chunk as chip logs it: its own trace line, then the decode dump the check matches. */
const chunkLines = (exchange = EXCHANGE) => [sentLine(exchange), CHUNK];

/**
 * A log source the test feeds by hand and never ends — a source that finishes closes the follower,
 * which turns the "no further chunk" wait into a close error instead of the timeout the transfer's
 * end is detected by.
 */
class OpenSource implements AsyncIterable<string> {
    #queue = new Array<string>();
    #waiters = new Array<() => void>();
    #ended = false;

    push(...lines: string[]): void {
        this.#queue.push(...lines);
        this.#wake();
    }

    end(): void {
        this.#ended = true;
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
        for (;;) {
            while (this.#queue.length) {
                yield this.#queue.shift()!;
            }
            if (this.#ended) {
                return;
            }
            await new Promise<void>(resolve => this.#waiters.push(resolve));
        }
    }
}

async function withFollower<T>(
    lines: string[],
    body: (follower: LogFollower) => Promise<T>,
    options: { endSource?: boolean; drain?: boolean } = {},
): Promise<T> {
    const { endSource = false, drain = false } = options;
    const source = new OpenSource();
    const follower = new LogFollower(source, "th");
    source.push(...lines);
    if (endSource) {
        source.end();
    }
    if (drain) {
        // The follower buffers pushed lines through its own async pump; a caller that reads
        // the buffer synchronously (e.g. `count`) instead of waiting via `.expect()` needs the
        // pump to have drained them first. The pump chain is all microtasks, which the event loop
        // fully drains before running a macrotask callback, so one `setImmediate` tick suffices.
        await new Promise(resolve => setImmediate(resolve));
    }
    try {
        return await body(follower);
    } finally {
        await follower.close();
    }
}

async function check(lines: string[], flavor = "chip-docker", endSource = false) {
    return withFollower(lines, follower => expectChunkedTransfer(follower, flavor, 0, Seconds(1)), { endSource });
}

describe("expectChunkedTransfer", () => {
    it("passes when every chunk but the last is acked", async () => {
        const record = await check([
            ...chunkLines(),
            NOISE,
            ackLine(),
            ...chunkLines(),
            ackLine(),
            ...chunkLines(),
            NOISE,
        ]);

        expect(record.verdict).equal("pass");
        expect(record.detail).equal("3 report chunks, each but the last followed by a StatusResponse");
    });

    it("fails when a later chunk pair has no StatusResponse between it", async () => {
        const record = await check([...chunkLines(), ackLine(), ...chunkLines(), NOISE, ...chunkLines(), ackLine()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 2 of 3 went unacked/);
    });

    it("fails when the first chunk pair has no StatusResponse between it", async () => {
        const record = await check([...chunkLines(), ...chunkLines(), ackLine(), ...chunkLines(), ackLine()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 1 of 3 went unacked/);
    });

    it("fails when the only StatusResponse between two chunks answered another exchange", async () => {
        const record = await check([
            ...chunkLines(),
            ackLine(EXCHANGE + 1),
            ...chunkLines(),
            ackLine(),
            ...chunkLines(),
            NOISE,
        ]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 1 of 3 went unacked/);
        expect(record.detail).contains(`Exchange ${EXCHANGE}`);
    });

    it("fails when two one-chunk reads, each acked on its own exchange, look like a chunked one", async () => {
        const record = await check([...chunkLines(), ackLine(), ...chunkLines(EXCHANGE + 1), ackLine(EXCHANGE + 1)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/belongs to another read/);
    });

    it("fails when a chunk has no outbound trace line to take an exchange from", async () => {
        const record = await check([CHUNK, ackLine(), ...chunkLines(), ackLine(), ...chunkLines(), NOISE]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/No outbound Report Data trace line/);
    });

    it("fails when the read never chunked", async () => {
        const record = await check([...chunkLines(), ackLine()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/did not chunk/);
    });

    it("treats a log source that ends mid-transfer as the end of the transfer", async () => {
        const record = await check(
            [...chunkLines(), ackLine(), ...chunkLines(), ackLine(), ...chunkLines()],
            "chip-docker",
            true,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).equal("3 report chunks, each but the last followed by a StatusResponse");
    });

    it("records a fail instead of throwing when no report chunk ever appears", async () => {
        const record = await check([NOISE]);

        expect(record.verdict).equal("fail");
        expect(record.detail).equal("0 report chunks — the read did not chunk");
    });

    it("reports unverified for a flavor with no pattern", async () => {
        const record = await check([], "matterjs");

        expect(record.verdict).equal("unverified");
    });
});

describe("attributePathIBSequence", () => {
    it("has no field line for a fully wildcarded path", () => {
        const sequence = attributePathIBSequence({});

        expect(sequence).to.have.lengthOf(3);
        expect(sequence[0].test("[DMG] AttributePathIB =")).equal(true);
        expect(sequence[1].test("[DMG] {")).equal(true);
        expect(sequence[2].test("[DMG] }")).equal(true);
    });

    it("emits one line per concrete field, in Endpoint/Cluster/Attribute order", () => {
        const sequence = attributePathIBSequence({ endpoint: 1, cluster: 0x28, attribute: 0x10 });

        expect(sequence).to.have.lengthOf(6);
        expect(sequence[2].test("[DMG] Endpoint = 0x1,")).equal(true);
        expect(sequence[3].test("[DMG] Cluster = 0x28,")).equal(true);
        expect(sequence[4].test("[DMG] Attribute = 0x0000_0010,")).equal(true);
    });

    it("omits the line for a wildcarded field between two concrete ones", () => {
        const sequence = attributePathIBSequence({ endpoint: 1, attribute: 0x10 });

        expect(sequence).to.have.lengthOf(5);
        expect(sequence[2].test("[DMG] Endpoint = 0x1,")).equal(true);
        expect(sequence[3].test("[DMG] Attribute = 0x0000_0010,")).equal(true);
    });
});

describe("eventPathIBSequence", () => {
    it("has no field line for a fully wildcarded path", () => {
        const sequence = eventPathIBSequence({});

        expect(sequence).to.have.lengthOf(3);
        expect(sequence[0].test("[DMG] EventPath =")).equal(true);
        expect(sequence[1].test("[DMG] {")).equal(true);
        expect(sequence[2].test("[DMG] },")).equal(true);
    });

    it("emits one bare-hex line per concrete field, in Endpoint/Cluster/Event order", () => {
        const sequence = eventPathIBSequence({ endpoint: 1, cluster: 0x28, event: 0x10 });

        expect(sequence).to.have.lengthOf(6);
        expect(sequence[2].test("[DMG] Endpoint = 0x1,")).equal(true);
        expect(sequence[3].test("[DMG] Cluster = 0x28,")).equal(true);
        expect(sequence[4].test("[DMG] Event = 0x10,")).equal(true);
    });

    it("does not match an AttributePathIB's own closing line", () => {
        const sequence = eventPathIBSequence({});

        expect(sequence[0].test("[DMG] AttributePathIB =")).equal(false);
        expect(sequence[2].test("[DMG] }")).equal(false);
    });
});

describe("expectSequence", () => {
    // One chip ReadRequestMessage carrying a single concrete event path, as EventPathIBs::Parser and
    // EventPathIB::Parser print it: the whole run below is consecutive, and isFabricFiltered is not.
    const READ_EVENT_LINES = [
        "[DMG] ReadRequestMessage =",
        "[DMG] {",
        "[DMG] EventPathIBs =",
        "[DMG] [",
        "[DMG] EventPath =",
        "[DMG] {",
        "[DMG] Endpoint = 0x0,",
        "[DMG] Cluster = 0x28,",
        "[DMG] Event = 0x0,",
        "[DMG] },",
        "[DMG] ",
        "[DMG] ],",
        "[DMG] ",
        "[DMG] isFabricFiltered = true, ",
    ];
    const PATH = { endpoint: 0, cluster: 0x28, event: 0 };
    const SEQUENCE = [READ_REQUEST_MESSAGE, /\{\s*$/, ...EVENT_PATH_IBS_SEQUENCE, ...eventPathIBSequence(PATH)];

    it("passes on the consecutive read-request-with-event-path run", async () => {
        const record = await withFollower(READ_EVENT_LINES, follower =>
            expectSequence(follower, "chip-local", "read event path", SEQUENCE, 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
        expect(record.matched).equal("[DMG] },");
    });

    it("finds isFabricFiltered after the path block, which is not adjacent to it", async () => {
        const record = await withFollower(READ_EVENT_LINES, async follower => {
            const block = await expectSequence(follower, "chip-local", "read event path", SEQUENCE, 0, Seconds(1));
            expect(block.logLine).equal(9);
            return expectSequence(
                follower,
                "chip-local",
                "isFabricFiltered",
                [fabricFilteredPattern(true)],
                block.logLine! + 1,
                Seconds(1),
            );
        });

        expect(record.verdict).equal("pass");
    });

    it("fails, rather than throwing, when the sequence never arrives", async () => {
        const record = await withFollower(["[DMG] ReadRequestMessage ="], follower =>
            expectSequence(follower, "chip-local", "read event path", SEQUENCE, 0, Millis(200)),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal("read event path");
    });

    it("reports unverified for a flavor with no pattern for the sequence", async () => {
        const record = await withFollower(READ_EVENT_LINES, follower =>
            expectSequence(follower, "matterjs", "read event path", SEQUENCE, 0, Seconds(1)),
        );

        expect(record.verdict).equal("unverified");
    });
});

describe("expectMessageWithPath", () => {
    const WRITE = "[DMG] WriteRequestMessage =";
    const PATH = [
        "[DMG] AttributePathIB =",
        "[DMG] {",
        "[DMG] Endpoint = 0x0,",
        "[DMG] Cluster = 0x28,",
        "[DMG] Attribute = 0x0000_0010,",
        "[DMG] }",
    ];
    const FIELDS = { endpoint: 0, cluster: 0x28, attribute: 0x10 };

    it("passes when the path block follows the message", async () => {
        const record = await withFollower([WRITE, ...PATH], follower =>
            expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("fails at the message stage when the path block appears without the message", async () => {
        const record = await withFollower([...PATH], follower =>
            expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal(String(WRITE_REQUEST_MESSAGE));
    });

    it("fails at the path stage when a path block appears before the message but not after", async () => {
        const record = await withFollower([...PATH, WRITE], follower =>
            expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal(`AttributePathIB ${JSON.stringify(FIELDS)}`);
    });

    it("reports unverified for a flavor with no pattern for the message", async () => {
        const record = await withFollower([WRITE, ...PATH], follower =>
            expectMessageWithPath(follower, "matterjs", WRITE_REQUEST_MESSAGE, FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("unverified");
    });

    it("gives up within roughly one timeout budget when the path block never arrives, not two", async () => {
        // The message must arrive partway through the budget, not be already buffered — otherwise
        // stage 1 costs ~0ms and remaining() is indistinguishable from a fresh timeout, hiding a
        // shared-vs-fresh-budget regression in stage 2 instead of catching it.
        const timeout = Millis(600);
        const source = new OpenSource();
        const follower = new LogFollower(source, "th");
        setTimeout(() => source.push(WRITE), 300);

        const start = Date.now();
        const record = await expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, timeout);
        const elapsed = Date.now() - start;
        await follower.close();

        expect(record.verdict).equal("fail");
        expect(elapsed).lessThan(timeout * 1.25);
    });
});

describe("expectSubscriptionId and expectReportAck against a matter.js TH", () => {
    // Lines a matter.js TH writes for one subscription: the response naming the id it minted, the
    // report it then sends on that subscription, and the DUT's answer to that very report — the
    // payload is a StatusResponseMessage whose context tag 0 holds the status, so 00 is Success
    const SUBSCRIBE_RESPONSE =
        "DEBUG MessageChannel Message » for: I/SubscribeResponse sub#: 54c99e7e maxInterval: 1m 27s " +
        "id: @1:1b669•2d86⇵7689✉05ab904c type: 0x1/0x4";
    const REPORT =
        "DEBUG MessageChannel Message » for: I/ReportData sub#: 54c99e7e attr: 1 backOff: 342ms " +
        "id: @1:1b669•2d86⇵7689✉05ab904b type: 0x1/0x5";
    const ACK =
        "DEBUG MessageExchange Message « for: I/StatusResponse id: @1:1b669•2d86⇵7689✉082f5518 type: 0x1/0x1 " +
        "acked: 05ab904b reqAck size: 8 payload: 1524000024ff0c18";

    async function ack(lines: string[], subscriptionId = 0x54c99e7e) {
        return withFollower(lines, follower => expectReportAck(follower, "matterjs", subscriptionId, 0, Millis(200)), {
            endSource: true,
        });
    }

    it("reads the id the TH minted", async () => {
        const lookup = await withFollower([SUBSCRIBE_RESPONSE], follower =>
            expectSubscriptionId(follower, "matterjs", 0, Millis(200)),
        );

        expect(lookup.subscriptionId).equal(0x54c99e7e);
        expect(lookup.check.verdict).equal("pass");
    });

    it("passes when the DUT acked this report with Success", async () => {
        const record = await ack([REPORT, ACK]);

        expect(record.verdict).equal("pass");
        expect(record.matched).equal(ACK);
    });

    it("fails on an ack for another report, however close it sits", async () => {
        const record = await ack([REPORT, ACK.replace("acked: 05ab904b", "acked: 05ab9999")]);

        expect(record.verdict).equal("fail");
    });

    it("fails on a report of another subscription", async () => {
        const record = await ack([REPORT.replace("sub#: 54c99e7e", "sub#: 54c99e7f"), ACK]);

        expect(record.verdict).equal("fail");
    });

    it("ignores the keepalive an idle subscription sends, which carries no data", async () => {
        const keepalive = REPORT.replace("attr: 1", "empty").replace("✉05ab904b", "✉05ab9052");
        const keepaliveAck = ACK.replace("acked: 05ab904b", "acked: 05ab9052");

        expect((await ack([keepalive, keepaliveAck])).verdict).equal("fail");
        expect((await ack([keepalive, keepaliveAck, REPORT, ACK])).verdict).equal("pass");
    });

    it("matches an id of fewer digits, which the TH pads to eight", async () => {
        const short = 0xa6c2b1e;
        const record = await ack([REPORT.replace("sub#: 54c99e7e", `sub#: 0${short.toString(16)}`), ACK], short);

        expect(record.verdict).equal("pass");
    });

    it("does not take a longer id that merely starts with ours", async () => {
        const record = await ack([REPORT.replace("sub#: 54c99e7e", "sub#: 54c99e7ef"), ACK]);

        expect(record.verdict).equal("fail");
    });

    it("accepts an event report, which says `ev:` where an attribute report says `attr:`", async () => {
        const record = await ack([REPORT.replace("attr: 1", "ev: 1"), ACK]);

        expect(record.verdict).equal("pass");
    });

    it("fails when the DUT acked with a status other than Success", async () => {
        const record = await ack([REPORT, ACK.replace("payload: 15240000", "payload: 15240001")]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/status 0x01/);
    });
});

describe("requireId", () => {
    it("returns the id when defined", () => {
        expect(requireId(5, "thing")).equal(5);
    });

    it("throws when the id is undefined", () => {
        expect(() => requireId(undefined, "thing")).to.throw(/thing has no numeric id/);
    });
});

describe("commandPathIBSequence", () => {
    it("emits the CommandDataIB/CommandPathIB block in EndpointId/ClusterId/CommandId order", () => {
        const sequence = commandPathIBSequence(1, 0x6, 0x1);

        expect(sequence).to.have.lengthOf(7);
        expect(sequence[0].test("[DMG] CommandDataIB =")).equal(true);
        expect(sequence[2].test("[DMG] CommandPathIB =")).equal(true);
        expect(sequence[4].test("[DMG] EndpointId = 0x1,")).equal(true);
        expect(sequence[5].test("[DMG] ClusterId = 0x6,")).equal(true);
        expect(sequence[6].test("[DMG] CommandId = 0x1,")).equal(true);
    });
});

describe("expectCommandInvoke", () => {
    const PATH = [
        "[DMG] CommandDataIB =",
        "[DMG] {",
        "[DMG] CommandPathIB =",
        "[DMG] {",
        "[DMG] EndpointId = 0x1,",
        "[DMG] ClusterId = 0x6,",
        "[DMG] CommandId = 0x1,",
        "[DMG] },",
    ];
    const FIELD = "[DMG] 0x0 = 4097 (unsigned),";

    it("passes when the path block matches and every field line follows in order", async () => {
        const record = await withFollower([...PATH, FIELD], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 0, value: 4097 }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("fails when a field line never appears", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 0, value: 4097 }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
    });

    it("passes with no field checks when fields is empty", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [], 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("reports unverified for a flavor with no pattern", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "matterjs", 1, 0x6, 0x1, [], 0, Seconds(1)),
        );

        expect(record.verdict).equal("unverified");
    });
});

describe("CommissionedRefs", () => {
    function contextWith(decommission: (role: string) => Promise<void>): CertStepContext {
        function nodeFor(role: string): CertNodeApi {
            const unused = () => Promise.reject(new Error("not used by these tests"));
            return {
                invoke: unused,
                invokeBatch: unused,
                readAttribute: unused,
                readAttributes: unused,
                writeAttribute: unused,
                writeAttributes: unused,
                subscribe: unused,
                readEvents: unused,
                subscribeEvents: unused,
                openCommissioningWindow: unused,
                operationalMdnsInstanceName: unused,
                decommission: () => decommission(role),
            };
        }

        // An ended source lets the follower close itself; this file's OpenSource would leave one
        // pending consume promise per controller per test.
        const noLines = async function* (): AsyncGenerator<string> {};

        const controllerFor = (role: string): ControllerAdapter => ({
            id: role,
            log: new LogFollower(noLines(), role),
            async start() {},
            async close() {},
            async commission() {
                return "ref";
            },
            async parseQrPayload() {
                throw new InternalError("not used in this test");
            },
            async parseManualPairingCode(): Promise<never> {
                throw new InternalError("not used in this test");
            },
            node: () => nodeFor(role),
        });

        return {
            controllers: { dut: controllerFor("dut"), th_cr2: controllerFor("th_cr2") },
            devices: {},
            recorder: {
                beginStep() {},
                check() {},
                endStep() {
                    return [];
                },
                async flush() {
                    return "";
                },
            },
        };
    }

    it("decommissions every role that holds a ref", async () => {
        const decommissioned = new Array<string>();
        const refs = new CommissionedRefs<"dut" | "th_cr2">();
        refs.set("dut", "ref-dut");
        refs.set("th_cr2", "ref-cr2");

        await refs.decommissionAll(contextWith(async role => void decommissioned.push(role)));

        expect(decommissioned).deep.equal(["dut", "th_cr2"]);
        expect(refs.get("dut")).equal(undefined);
    });

    it("throws naming every role whose decommission failed, rather than warning", async () => {
        const refs = new CommissionedRefs<"dut" | "th_cr2">();
        refs.set("dut", "ref-dut");
        refs.set("th_cr2", "ref-cr2");

        const cx = contextWith(async role => {
            if (role === "th_cr2") {
                throw new Error("node is reconnecting");
            }
        });

        await expect(refs.decommissionAll(cx)).rejectedWith(CertCleanupError, /th_cr2: node is reconnecting/);
    });

    it("drops a failed role's ref so a second pass doesn't retry it", async () => {
        const attempts = new Array<string>();
        const refs = new CommissionedRefs();
        refs.set("dut", "ref-dut");

        const cx = contextWith(async role => {
            attempts.push(role);
            throw new Error("node is reconnecting");
        });

        await expect(refs.decommissionAll(cx)).rejected;
        await refs.decommissionAll(cx);

        expect(attempts).deep.equal(["dut"]);
    });
});

describe("expectRejection", () => {
    const BUDGET = Millis(200);

    it("passes on a rejection and reports what it rejected with", async () => {
        const check = await expectRejection("op", Promise.reject(new Error("refused")), BUDGET);

        expect(check.verdict).equal("pass");
        expect(check.detail).match(/^op rejected after .*: refused$/);
    });

    it("fails on an unexpected success", async () => {
        const check = await expectRejection("op", Promise.resolve("commissioned"), BUDGET);

        expect(check.verdict).equal("fail");
        expect(check.detail).match(/^op unexpectedly succeeded after /);
    });

    it("fails once the budget expires rather than waiting for the call", async () => {
        const check = await expectRejection("op", new Promise(() => {}), BUDGET);

        expect(check.verdict).equal("fail");
        expect(check.detail).match(/^op neither resolved nor rejected within /);
    });

    it("fails a rejection the caller does not accept", async () => {
        const check = await expectRejection(
            "op",
            Promise.reject(new InternalError("the process died")),
            BUDGET,
            error => error instanceof TypeError,
        );

        expect(check.verdict).equal("fail");
        expect(check.detail).match(/^op failed after .* for an unrelated reason: InternalError: the process died$/);
    });

    it("passes a rejection the caller accepts", async () => {
        const check = await expectRejection(
            "op",
            Promise.reject(new InternalError("refused")),
            BUDGET,
            error => error instanceof InternalError,
        );

        expect(check.verdict).equal("pass");
    });

    it("leaves no timer armed after a settled call", async () => {
        // A budget nothing waits out would otherwise hold the process open past teardown
        const before = Time.timers.size;

        await expectRejection("op", Promise.reject(new Error("refused")), Seconds(60));

        expect(Time.timers.size).equal(before);
    });
});

describe("recordAll", () => {
    function recordingContext() {
        const checks = new Array<CheckRecord>();
        const cx = {
            controllers: {},
            devices: {},
            recorder: {
                beginStep() {},
                check(check: CheckRecord) {
                    checks.push(check);
                },
                endStep() {
                    return [];
                },
                async flush() {
                    return "";
                },
            },
        } satisfies CertStepContext;

        return { checks, cx };
    }

    const pass = (detail: string): CheckRecord => ({ type: "response", verdict: "pass", detail });
    const fail = (detail: string): CheckRecord => ({ type: "response", verdict: "fail", detail });

    it("records every check when they all pass", () => {
        const { checks, cx } = recordingContext();

        recordAll(cx, [
            { check: () => pass("first"), what: "one" },
            { check: () => pass("second"), what: "two" },
        ]);

        expect(checks.map(check => check.detail)).deep.equal(["first", "second"]);
    });

    it("records the checks after a failing one rather than stopping at it", () => {
        const { checks, cx } = recordingContext();

        expect(() =>
            recordAll(cx, [
                { check: () => fail("first"), what: "one" },
                { check: () => pass("second"), what: "two" },
                { check: () => fail("third"), what: "three" },
            ]),
        ).throw(CertCheckFailedError, /2 of 3 checks failed/);

        expect(checks.map(check => check.detail)).deep.equal(["first", "second", "third"]);
    });

    it("names every failure in the error it throws", () => {
        const { cx } = recordingContext();

        expect(() =>
            recordAll(cx, [
                { check: () => fail("first"), what: "one" },
                { check: () => fail("third"), what: "three" },
            ]),
        ).throw(CertCheckFailedError, /one:.*three:/);
    });

    it("keeps the checks recorded before a builder threw", () => {
        const { checks, cx } = recordingContext();

        expect(() =>
            recordAll(cx, [
                { check: () => pass("first"), what: "one" },
                {
                    check: (): CheckRecord => {
                        throw new InternalError("generator produced no artifact");
                    },
                    what: "two",
                },
            ]),
        ).throw(InternalError);

        expect(checks.map(check => check.detail)).deep.equal(["first"]);
    });

    it("passes an unverified check through, as record does", () => {
        const { checks, cx } = recordingContext();

        recordAll(cx, [
            { check: () => ({ type: "device-log", verdict: "unverified" }), what: "matterjs has no pattern" },
        ]);

        expect(checks).length(1);
    });
});
