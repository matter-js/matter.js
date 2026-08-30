/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Millis, Time, Seconds } from "@matter/main";
import type {
    AttributePathSpec,
    CertNodeApi,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    LogExpectPatterns,
} from "@matter/testing";
import { LogFollower } from "@matter/testing";
import {
    attributePathIBSequence,
    CertCheckFailedError,
    CertCleanupError,
    commandPathIBSequence,
    CommissionedRefs,
    EVENT_PATH_IBS_SEQUENCE,
    eventPathIBSequence,
    expectAttributePathIB,
    expectChunkedTransfer,
    expectCommandInvoke,
    expectMessageWithPath,
    expectRejection,
    expectReportAck,
    expectSequence,
    expectDeviceLog,
    expectSubscriptionId,
    fabricFilteredPattern,
    fabricSessionsEnded,
    matterjsReadEventPath,
    matterjsSubscribeEventPath,
    matterjsSubscribeFlags,
    matterjsSubscribeTiming,
    READ_REQUEST_MESSAGE,
    readOwnFabricIndex,
    recordAll,
    CertCleanupErrors,
    removeFabricSucceeded,
    requireId,
    runCleanups,
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

// The read whose reports follow, as chip logs it: the inbound trace line naming the exchange it
// arrived on, then the request's own decode dump. Shapes verified against a real chip TH log.
const READ_REQUEST = "[DMG] ReadRequestMessage =";
const receivedLine = (exchange = EXCHANGE) =>
    `[DMG] << from UDP:[fe80::1%eth0]:58253 | 225728306 | [Interaction Model  (1) / Read Request (0x02) / Session = 13606 / Exchange = ${exchange}]`;
const readLines = (exchange = EXCHANGE) => [receivedLine(exchange), READ_REQUEST];

// A report's own flags, which chip prints as fields of its decode dump: every chunk but the last says
// there is more to come, the last one says the requester must not answer it.
const MORE_CHUNKS = "[DMG] \tMoreChunkedMessages = true,";
const SUPPRESSED = "[DMG] \tSuppressResponse = true,";

/**
 * One chunk as chip logs it: its own trace line, the decode dump the check matches, and the flag that
 * says whether the transfer ends here.
 */
const chunkLines = (exchange = EXCHANGE, finality: "more" | "final" = "more") => [
    sentLine(exchange),
    CHUNK,
    finality === "final" ? SUPPRESSED : MORE_CHUNKS,
];

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

// The step hands the transfer the check that already matched its own read request; here that check
// names a line the test pushed itself.
const requestCheck = (logLine?: number): CheckRecord =>
    logLine === undefined
        ? { type: "device-log", verdict: "unverified" }
        : { type: "device-log", verdict: "pass", logLine };

async function checkFrom(
    lines: string[],
    request: CheckRecord,
    flavor = "chip-docker",
    endSource = false,
    budget = Seconds(1),
) {
    return withFollower(lines, follower => expectChunkedTransfer(follower, flavor, request, budget), {
        endSource,
        drain: true,
    });
}

// Every case about the reports themselves gets the read request in front of them, anchored where the
// step's own path check leaves its match: inside the request's decode dump.
async function check(lines: string[], flavor = "chip-docker", endSource = false, budget = Seconds(1)) {
    return checkFrom([...readLines(), ...lines], requestCheck(1), flavor, endSource, budget);
}

// A case about the TH going silent needs a budget the quiet period can close inside, or the check runs
// out of its own budget first and says so instead.
const OUTLASTS_QUIET_PERIOD = Seconds(4);

describe("expectChunkedTransfer", function () {
    this.timeout(30_000);

    it("passes when every chunk but the last is acked", async () => {
        const record = await check(
            [...chunkLines(), NOISE, ackLine(), ...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final"), NOISE],
            "chip-docker",
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).equal(
            "3 report chunks, each but the last followed by a StatusResponse, and none after the last",
        );
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

    it("fails when a one-chunk read is followed by another read's own report", async () => {
        const record = await check([...chunkLines(), ackLine(), ...chunkLines(EXCHANGE + 1), ackLine(EXCHANGE + 1)]);

        expect(record.verdict).equal("fail");
        expect(record.detail).equal(
            `1 report chunk on Exchange ${EXCHANGE} — the read did not chunk; 1 on Exchange ${EXCHANGE + 1} ` +
                "belonged elsewhere",
        );
    });

    it("ignores a report of another exchange that lands before this read's first chunk", async () => {
        const record = await check(
            [
                ...chunkLines(EXCHANGE + 1),
                ackLine(EXCHANGE + 1),
                ...chunkLines(),
                ackLine(),
                ...chunkLines(EXCHANGE, "final"),
            ],
            "chip-docker",
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).equal(
            "2 report chunks, each but the last followed by a StatusResponse, and none after the last",
        );
    });

    it("ignores a report of another exchange interleaved with this read's chunks", async () => {
        const record = await check(
            [
                ...chunkLines(),
                ackLine(),
                ...chunkLines(EXCHANGE + 1),
                ackLine(EXCHANGE + 1),
                ...chunkLines(EXCHANGE, "final"),
            ],
            "chip-docker",
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).equal(
            "2 report chunks, each but the last followed by a StatusResponse, and none after the last",
        );
    });

    it("claims nothing when the step could not settle the read's own request", async () => {
        const record = await checkFrom(
            [...readLines(), ...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final")],
            requestCheck(),
        );

        expect(record.verdict).equal("unverified");
    });

    it("fails when the transfer stops on a chunk that announced another", async function () {
        this.timeout(15_000);

        const record = await check(
            [...chunkLines(), ackLine(), ...chunkLines()],
            "chip-docker",
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/announces a further chunk, and none followed within 2s/);
    });

    it("stops collecting when its own budget is spent, however fast other traffic arrives", async function () {
        this.timeout(30_000);

        // A report of another exchange matches the same pattern and is answered out of the follower's
        // buffer before its timer is consulted, so traffic that outpaces collection would carry the
        // check past its budget if the clock were left to that timer.
        const source = new OpenSource();
        const follower = new LogFollower(source, "th");
        source.push(...readLines(), ...chunkLines(), ackLine(), ...chunkLines());
        await new Promise(resolve => setImmediate(resolve));

        let storming = true;
        const stormUntil = Time.nowUs + 5000;
        const storm = (async () => {
            while (storming && Time.nowUs < stormUntil) {
                source.push(...chunkLines(EXCHANGE + 1));
                await Promise.resolve();
            }
        })();

        const started = Time.nowUs;
        try {
            const record = await expectChunkedTransfer(follower, "chip-docker", requestCheck(1), Millis(300));

            expect(Time.nowUs - started).lessThan(3000);
            expect(record.verdict).equal("unverified");
            expect(record.detail).match(/budget of 300ms was spent before the transfer ended/);
        } finally {
            storming = false;
            await storm;
            await follower.close();
        }
    });

    it("ends the wait when the quiet period closes, not a further quiet period after the last report", async function () {
        this.timeout(20_000);

        // A report of another exchange arriving late in the window must not buy the check a fresh quiet
        // period: the window runs from our own last chunk, so it closes at the same instant either way
        const source = new OpenSource();
        const follower = new LogFollower(source, "th");
        source.push(...readLines(), ...chunkLines(), ackLine(), ...chunkLines());
        await new Promise(resolve => setImmediate(resolve));

        const foreign = setTimeout(() => source.push(...chunkLines(EXCHANGE + 1)), 1700);

        const started = Time.nowUs;
        try {
            const record = await expectChunkedTransfer(follower, "chip-docker", requestCheck(1), Seconds(6));
            const elapsed = Time.nowUs - started;

            expect(record.verdict).equal("fail");
            expect(record.detail).match(/announces a further chunk, and none followed within 2s/);
            expect(elapsed).lessThan(3000);
        } finally {
            clearTimeout(foreign);
            await follower.close();
        }
    });

    it("concludes a quiet transfer while another exchange keeps reporting", async function () {
        this.timeout(15_000);

        // The quiet period that ends collection is measured from the last chunk of *ours*, so a
        // concurrent subscription reporting into the same window cannot hold the check open until its
        // whole budget is gone. The budget here has to exceed CHUNK_QUIET for the two to differ.
        const source = new OpenSource();
        const follower = new LogFollower(source, "th");
        source.push(...readLines(), ...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final"));
        // The anchor is a line the check reads out of the buffer, so the pump has to have taken it
        await new Promise(resolve => setImmediate(resolve));

        let reporting = true;
        const foreign = (async () => {
            while (reporting) {
                await new Promise(resolve => setTimeout(resolve, 250));
                source.push(...chunkLines(EXCHANGE + 1), ackLine(EXCHANGE + 1));
            }
        })();

        const started = Time.nowUs;
        try {
            const record = await expectChunkedTransfer(follower, "chip-docker", requestCheck(1), Seconds(5));
            const elapsed = Time.nowUs - started;

            expect(record.verdict).equal("pass");
            expect(record.detail).equal(
                "2 report chunks, each but the last followed by a StatusResponse, and none after the last",
            );
            expect(elapsed).lessThan(4000);
        } finally {
            reporting = false;
            await foreign;
            await follower.close();
        }
    });

    it("fails when the read request has no inbound trace line to take an exchange from", async () => {
        const record = await checkFrom(
            [READ_REQUEST, ...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final")],
            requestCheck(0),
        );

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/No inbound Read Request trace line/);
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

    it("fails when the DUT acked the final chunk as well, which a read suppresses", async () => {
        const record = await check([...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final"), ackLine(), NOISE]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/after the final one of 2 report chunks/);
    });

    it("does not let a skipped report's flag end this read's transfer", async function () {
        this.timeout(15_000);

        // Our last chunk prints neither flag; the foreign report behind it says SuppressResponse. Read
        // past the message boundary, that flag would mark our chunk final and pass the transfer off as
        // complete
        const record = await check(
            [...chunkLines(), ackLine(), sentLine(), CHUNK, sentLine(EXCHANGE + 1), CHUNK, SUPPRESSED],
            "chip-docker",
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/carries neither MoreChunkedMessages nor SuppressResponse/);
    });

    it("claims nothing about an ack after the final chunk when its own budget ran out first", async () => {
        const record = await check(
            [...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final")],
            "chip-docker",
            false,
            Millis(300),
        );

        expect(record.verdict).equal("unverified");
        expect(record.detail).match(/budget of 300ms was spent before the 2s after it had passed/);
    });

    it("ignores an ack of another exchange after the final chunk", async () => {
        const record = await check(
            [...chunkLines(), ackLine(), ...chunkLines(EXCHANGE, "final"), ackLine(EXCHANGE + 1)],
            "chip-docker",
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).match(/none after the last/);
    });

    it("claims nothing where the log ends before the transfer does", async () => {
        const record = await check(
            [...chunkLines(), ackLine(), ...chunkLines(), ackLine(), ...chunkLines()],
            "chip-docker",
            true,
        );

        expect(record.verdict).equal("unverified");
        expect(record.detail).match(/the log ends there/);
    });

    it("does not read a truncated transfer's trailing ack as an answer to a final chunk", async () => {
        // A log cut inside a transfer ends on an acked chunk by construction — the ack of chunk N
        // precedes chunk N+1 — so this must not be read as the DUT answering a final chunk
        const record = await check([...chunkLines(), ackLine(), ...chunkLines(), ackLine()], "chip-docker", true);

        expect(record.verdict).equal("unverified");
        expect(record.detail).not.match(/which a read's last chunk suppresses/);
    });

    it("records a fail instead of throwing when no report chunk ever appears", async () => {
        const record = await check([NOISE]);

        expect(record.verdict).equal("fail");
        expect(record.detail).equal(`0 report chunks on Exchange ${EXCHANGE} — the read did not chunk`);
    });

    it("reports unverified for a flavor neither implementation's patterns speak for", async () => {
        const record = await check([], "python");

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
            expectSequence(follower, "chip-local", "read event path", { chip: SEQUENCE }, 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
        expect(record.matched).equal("[DMG] },");
    });

    it("finds isFabricFiltered after the path block, which is not adjacent to it", async () => {
        const record = await withFollower(READ_EVENT_LINES, async follower => {
            const block = await expectSequence(
                follower,
                "chip-local",
                "read event path",
                { chip: SEQUENCE },
                0,
                Seconds(1),
            );
            expect(block.logLine).equal(9);
            return expectSequence(
                follower,
                "chip-local",
                "isFabricFiltered",
                { chip: [fabricFilteredPattern(true)] },
                block.logLine! + 1,
                Seconds(1),
            );
        });

        expect(record.verdict).equal("pass");
    });

    it("fails, rather than throwing, when the sequence never arrives", async () => {
        const record = await withFollower(["[DMG] ReadRequestMessage ="], follower =>
            expectSequence(follower, "chip-local", "read event path", { chip: SEQUENCE }, 0, Millis(200)),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal("read event path");
    });

    it("reports unverified for a flavor with no pattern for the sequence", async () => {
        const record = await withFollower(READ_EVENT_LINES, follower =>
            expectSequence(follower, "matterjs", "read event path", { chip: SEQUENCE }, 0, Seconds(1)),
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
            expectMessageWithPath(follower, "chip-local", "write", FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("fails at the message stage when the path block appears without the message", async () => {
        const record = await withFollower([...PATH], follower =>
            expectMessageWithPath(follower, "chip-local", "write", FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal(String(WRITE_REQUEST_MESSAGE));
    });

    it("fails at the path stage when a path block appears before the message but not after", async () => {
        const record = await withFollower([...PATH, WRITE], follower =>
            expectMessageWithPath(follower, "chip-local", "write", FIELDS, 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal(`AttributePathIB ${JSON.stringify(FIELDS)}`);
    });

    it("reports unverified for a flavor neither implementation's patterns speak for", async () => {
        const record = await withFollower([WRITE, ...PATH], follower =>
            expectMessageWithPath(follower, "python", "write", FIELDS, 0, Seconds(1)),
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
        const record = await expectMessageWithPath(follower, "chip-local", "write", FIELDS, 0, timeout);
        const elapsed = Date.now() - start;
        await follower.close();

        expect(record.verdict).equal("fail");
        expect(elapsed).lessThan(timeout * 1.25);
    });
});

describe("attribute-path checks against a matter.js TH", () => {
    // matter.js names every path of one interaction on a single line, so these are its real log
    // lines, captured from a matterjs-vs-matterjs certification run's own device log.
    const readLine = (paths: string, events = "none") =>
        `2026-08-22 16:54:44.311 DEBUG InteractionServer Read « @1:f8b164969e6633a1•678b⇵50bc fabricFiltered attributes: ${paths} events: ${events}`;
    const writeLine = (paths: string) =>
        `2026-08-22 16:54:45.781 INFO InteractionServer Write « @1:ba8dee166d614303•0db5⇵ef90 ${paths}`;
    const subscribeDetailsLine = (paths: string, tail = "") =>
        `2026-08-22 16:54:46.946 DEBUG InteractionServer Subscribe request details « @1:b62937b31fd3030•80d9⇵37a7 attributes: ${paths}${tail}`;

    const ON_OFF = { endpoint: 1, cluster: 0x6, attribute: 0x0 };

    async function read(lines: string[], fields: AttributePathSpec = ON_OFF) {
        return withFollower(lines, follower => expectAttributePathIB(follower, "matterjs", fields, 0, Millis(100)));
    }

    it("passes on the read line naming the path, with the element names matter.js resolved", async () => {
        const record = await read([readLine("1.onOff.state.onOff")]);

        expect(record.verdict).equal("pass");
        expect(record.matched).contains("1.onOff.state.onOff");
    });

    it("finds the path among the several a single read carried", async () => {
        const record = await read([
            readLine("0.basicInformation.state.vendorId, 1.onOff.state.onOff, 0.descriptor.state.partsList"),
        ]);

        expect(record.verdict).equal("pass");
    });

    it("accepts the hex rendering a wildcarded endpoint leaves matter.js with", async () => {
        const record = await read([readLine("*.0x1d.state.0x1")], { cluster: 0x1d, attribute: 0x1 });

        expect(record.verdict).equal("pass");
    });

    it("does not take another attribute of the same cluster for the one it asked for", async () => {
        const record = await read([readLine("1.onOff.state.globalSceneControl")]);

        expect(record.verdict).equal("fail");
    });

    it("does not take a read of every attribute of the cluster for a read of one", async () => {
        const record = await read([readLine("1.onOff.*")]);

        expect(record.verdict).equal("fail");
    });

    it("does not take a longer endpoint number for the endpoint it asked for", async () => {
        const record = await read([readLine("11.onOff.state.onOff")]);

        expect(record.verdict).equal("fail");
    });

    it("does not take the read's event paths for its attribute paths", async () => {
        // A wildcard event path renders exactly as a wildcard attribute path does.
        const record = await read([readLine("1.onOff.state.onOff", "*.*.*, 1 filters")], {});

        expect(record.verdict).equal("fail");
    });

    it("records the miss rather than throwing it, so the step's evidence carries it", async () => {
        const record = await read([readLine("1.onOff.state.globalSceneControl")]);

        expect(record.type).equal("device-log");
        expect(record.pattern).equal(`AttributePathIB ${JSON.stringify(ON_OFF)}`);
        expect(record.detail).match(/Timed out waiting/);
    });

    it("passes on the write line naming the path", async () => {
        const record = await withFollower([writeLine("1.levelControl.state.onLevel")], follower =>
            expectMessageWithPath(
                follower,
                "matterjs",
                "write",
                { endpoint: 1, cluster: 0x8, attribute: 0x11 },
                0,
                Millis(100),
            ),
        );

        expect(record.verdict).equal("pass");
    });

    it("records a fail when no write line carries the path", async () => {
        const record = await withFollower([writeLine("1.levelControl.state.options")], follower =>
            expectMessageWithPath(
                follower,
                "matterjs",
                "write",
                { endpoint: 1, cluster: 0x8, attribute: 0x11 },
                0,
                Millis(100),
            ),
        );

        expect(record.verdict).equal("fail");
    });

    it("passes on the subscribe line that names paths, past the filters that follow them", async () => {
        const record = await withFollower(
            [
                subscribeDetailsLine(
                    "1.onOff.state.onOff",
                    " dataVersionFilters: undefined/1/6=2788245245 events: *.*.* eventFilters: undefined/4",
                ),
            ],
            follower => expectMessageWithPath(follower, "matterjs", "subscribe", ON_OFF, 0, Millis(100)),
        );

        expect(record.verdict).equal("pass");
    });

    it("does not settle a subscribe path check on the line that carries path counts only", async () => {
        const countsOnly =
            "2026-08-22 16:54:46.945 INFO InteractionServer Subscribe « @1:b62937b31fd3030•80d9⇵37a7 fabricFiltered keepSubscriptions attributePaths: 1";
        const record = await withFollower([countsOnly], follower =>
            expectMessageWithPath(follower, "matterjs", "subscribe", ON_OFF, 0, Millis(100)),
        );

        expect(record.verdict).equal("fail");
    });
});

describe("expectChunkedTransfer against a matter.js TH", function () {
    this.timeout(30_000);

    // matter.js names the exchange on the report line itself (`⇵<exchange>✉<counter>`), so a chunk
    // carries its own attribution. Lines captured from a matterjs-vs-matterjs run's device log.
    const MATTERJS_EXCHANGE = "50c9";
    const mjsChunk = (exchange = MATTERJS_EXCHANGE, finality: "more" | "final" = "more") =>
        `2026-08-22 16:54:44.382 DEBUG MessageChannel Message » for: I/ReportData ` +
        `${finality === "final" ? "suppressResponse" : "moreChunkedMessages"} attr: 36 backOff: 371ms ` +
        `id: @1:f8b164969e6633a1•678b⇵${exchange}✉02ca1953 type: 0x1/0x5 acked: 0fcef3be reqAck size: 1139 payload: 1536`;
    const mjsAck = (exchange = MATTERJS_EXCHANGE) =>
        `2026-08-22 16:54:44.385 DEBUG MessageExchange Message « for: I/StatusResponse id: @1:f8b164969e6633a1•678b⇵${exchange}✉0fcef3bf type: 0x1/0x1 acked: 02ca1953 reqAck size: 8 payload: 0000000000000000`;
    // matter.js names the exchange on the read line itself, so the request needs no trace line of its own.
    const mjsRead = (exchange = MATTERJS_EXCHANGE) =>
        `2026-08-22 16:54:44.301 DEBUG InteractionServer Read « @1:f8b164969e6633a1•678b⇵${exchange} fabricFiltered attributes: *.*.*`;

    async function transfer(lines: string[], endSource = false, budget = Seconds(1)) {
        return withFollower(
            [mjsRead(), ...lines],
            follower => expectChunkedTransfer(follower, "matterjs", requestCheck(0), budget),
            { endSource, drain: true },
        );
    }

    it("passes when every chunk but the last is acked", async () => {
        const record = await transfer(
            [mjsChunk(), mjsAck(), mjsChunk(), mjsAck(), mjsChunk(MATTERJS_EXCHANGE, "final")],
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).equal(
            "3 report chunks, each but the last followed by a StatusResponse, and none after the last",
        );
    });

    it("fails when a chunk pair has no StatusResponse between it", async () => {
        const record = await transfer([mjsChunk(), mjsChunk(), mjsAck(), mjsChunk()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 1 of 3 went unacked/);
    });

    it("fails when the ack between two chunks answered another exchange", async () => {
        const record = await transfer([mjsChunk(), mjsAck("50ca"), mjsChunk(), mjsAck(), mjsChunk()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 1 of 3 went unacked/);
    });

    it("fails when a one-chunk read is followed by another read's own report", async () => {
        const record = await transfer([mjsChunk(), mjsAck(), mjsChunk("50ca"), mjsAck("50ca")]);

        expect(record.verdict).equal("fail");
        expect(record.detail).equal(
            `1 report chunk on Exchange ${MATTERJS_EXCHANGE} — the read did not chunk; 1 on Exchange 50ca ` +
                "belonged elsewhere",
        );
    });

    it("ignores a report of another exchange that lands before this read's first chunk", async () => {
        const record = await transfer(
            [mjsChunk("50ca"), mjsAck("50ca"), mjsChunk(), mjsAck(), mjsChunk(MATTERJS_EXCHANGE, "final")],
            false,
            OUTLASTS_QUIET_PERIOD,
        );

        expect(record.verdict).equal("pass");
        expect(record.detail).equal(
            "2 report chunks, each but the last followed by a StatusResponse, and none after the last",
        );
    });

    it("fails when the transfer stops on a chunk that announced another", async function () {
        this.timeout(15_000);

        const record = await transfer([mjsChunk(), mjsAck(), mjsChunk()], false, OUTLASTS_QUIET_PERIOD);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/announces a further chunk, and none followed within 2s/);
    });

    it("fails when the read never chunked", async () => {
        const record = await transfer([mjsChunk(), mjsAck()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/did not chunk/);
    });

    it("fails when the DUT acked the final chunk as well", async () => {
        const record = await transfer([mjsChunk(), mjsAck(), mjsChunk(MATTERJS_EXCHANGE, "final"), mjsAck()]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/after the final one of 2 report chunks/);
    });

    it("does not claim the final message was unanswered where the log ends inside the transfer", async () => {
        const record = await transfer([mjsChunk(), mjsAck(), mjsChunk(), mjsAck()], true);

        expect(record.verdict).equal("unverified");
        expect(record.detail).not.match(/which a read's last chunk suppresses/);
    });
});

describe("command, event and subscribe checks against a matter.js TH", () => {
    // matter.js's own lines, captured from a matterjs-vs-matterjs certification run.
    const SESSION = "@1:6933d77f2aac19fc•8c2d";
    const invokeLine = (paths: string, flags = "") =>
        `2026-08-22 16:56:18.684 INFO InteractionServer Invoke « ${SESSION}⇵4ef3 ${flags}invokes: ${paths}`;
    const fieldsLine = (command: string, fields: string, cluster = "generalCommissioning") =>
        `2026-08-22 16:54:43.437 INFO ProtocolService Invoke « binford-6100.${cluster}.${command} ${SESSION}⇵4ef3✉0d8128da ${fields}`;
    const readEventLine = (events: string, flags = "fabricFiltered ") =>
        `2026-08-22 16:56:19.727 DEBUG InteractionServer Read « ${SESSION}⇵9376 ${flags}attributes: none events: ${events}`;
    const subscribeFlagsLine = (flags: string) =>
        `2026-08-22 16:56:20.732 INFO InteractionServer Subscribe « ${SESSION}⇵4ef4 ${flags} eventPaths: 1`;
    const subscribeEventsLine = (events: string) =>
        `2026-08-22 16:56:20.732 DEBUG InteractionServer Subscribe request details « ${SESSION}⇵4ef4 events: ${events}`;
    const subscribeAcceptedLine = (timing: string) =>
        `2026-08-22 16:56:20.738 NOTICE InteractionServer Subscribe successful » ${SESSION}⇵4ef4 2↔1 sub#: 549d86cf timing: ${timing} sendInterval: 1m 21s`;

    const ON_OFF_ON = { endpoint: 1, cluster: 0x6, command: 0x1 };
    const START_UP = { endpoint: 0, cluster: 0x28, event: 0x0 };

    async function invoke(lines: string[], fields: { id: number; value: number }[] = []) {
        return withFollower(lines, follower =>
            expectCommandInvoke(
                follower,
                "matterjs",
                ON_OFF_ON.endpoint,
                ON_OFF_ON.cluster,
                ON_OFF_ON.command,
                fields,
                0,
                Millis(100),
            ),
        );
    }

    it("passes on the invoke line naming the command", async () => {
        expect((await invoke([invokeLine("1.onOff.on")])).verdict).equal("pass");
    });

    it("does not take another command of the same cluster for the one it asked for", async () => {
        expect((await invoke([invokeLine("1.onOff.off")])).verdict).equal("fail");
    });

    it("finds the command among the several one invoke carried", async () => {
        expect((await invoke([invokeLine("1.onOff.off, 1.onOff.on")])).verdict).equal("pass");
    });

    it("checks a command's field values by the names matter.js prints them under", async () => {
        const record = await withFollower(
            [
                invokeLine("0.generalCommissioning.armFailSafe"),
                fieldsLine("armFailSafe", "expiryLengthSeconds: 60 breadcrumb: 1"),
            ],
            follower => expectCommandInvoke(follower, "matterjs", 0, 0x30, 0x0, [{ id: 0, value: 60 }], 0, Millis(100)),
        );

        expect(record.verdict).equal("pass");
    });

    it("checks a string field by the value matter.js prints unquoted", async () => {
        const record = await withFollower(
            [
                invokeLine("1.groups.addGroupIfIdentifying"),
                fieldsLine("addGroupIfIdentifying", "groupId: 3 groupName: gp3", "groups"),
            ],
            follower =>
                expectCommandInvoke(
                    follower,
                    "matterjs",
                    1,
                    0x4,
                    0x5,
                    [
                        { id: 0, value: 3 },
                        { id: 1, value: "gp3" },
                    ],
                    0,
                    Millis(100),
                ),
        );

        expect(record.verdict).equal("pass");
    });

    it("does not take a longer string for the one the step asked for", async () => {
        const record = await withFollower(
            [
                invokeLine("1.groups.addGroupIfIdentifying"),
                fieldsLine("addGroupIfIdentifying", "groupId: 3 groupName: gp30", "groups"),
            ],
            follower =>
                expectCommandInvoke(follower, "matterjs", 1, 0x4, 0x5, [{ id: 1, value: "gp3" }], 0, Millis(100)),
        );

        expect(record.verdict).equal("fail");
    });

    it("does not take a name whose own space ends the value the step asked for", async () => {
        const record = await withFollower(
            [
                invokeLine("1.groups.addGroupIfIdentifying"),
                fieldsLine("addGroupIfIdentifying", "groupId: 3 groupName: gp 3", "groups"),
            ],
            follower =>
                expectCommandInvoke(follower, "matterjs", 1, 0x4, 0x5, [{ id: 1, value: "gp" }], 0, Millis(100)),
        );

        expect(record.verdict).equal("fail");
    });

    it("matches a name that ends the line, and one another field follows", async () => {
        for (const fields of ["groupId: 3 groupName: gp 3", "groupName: gp 3 groupId: 3"]) {
            const record = await withFollower(
                [invokeLine("1.groups.addGroupIfIdentifying"), fieldsLine("addGroupIfIdentifying", fields, "groups")],
                follower =>
                    expectCommandInvoke(follower, "matterjs", 1, 0x4, 0x5, [{ id: 1, value: "gp 3" }], 0, Millis(100)),
            );

            expect(record.verdict, fields).equal("pass");
        }
    });

    it("matches a name carrying regular-expression syntax literally", async () => {
        const record = await withFollower(
            [
                invokeLine("1.groups.addGroupIfIdentifying"),
                fieldsLine("addGroupIfIdentifying", "groupId: 3 groupName: gpX3", "groups"),
            ],
            follower =>
                expectCommandInvoke(follower, "matterjs", 1, 0x4, 0x5, [{ id: 1, value: "gp.3" }], 0, Millis(100)),
        );

        expect(record.verdict).equal("fail");
    });

    it("refuses a value matter.js cannot print as a matchable field", async () => {
        for (const value of ["", "two\nlines"]) {
            await expect(
                withFollower([invokeLine("1.groups.addGroupIfIdentifying")], follower =>
                    expectCommandInvoke(follower, "matterjs", 1, 0x4, 0x5, [{ id: 1, value }], 0, Millis(100)),
                ),
            ).rejectedWith(InternalError);
        }
    });

    it("fails when a field carried another value than the step asked for", async () => {
        const record = await withFollower(
            [
                invokeLine("0.generalCommissioning.armFailSafe"),
                fieldsLine("armFailSafe", "expiryLengthSeconds: 900 breadcrumb: 1"),
            ],
            follower => expectCommandInvoke(follower, "matterjs", 0, 0x30, 0x0, [{ id: 0, value: 60 }], 0, Millis(100)),
        );

        expect(record.verdict).equal("fail");
    });

    it("passes on the read line naming the event path, with the flag the step asked for", async () => {
        const record = await withFollower([readEventLine("0.basicInformation.events.startUp")], follower =>
            expectSequence(
                follower,
                "matterjs",
                "read event path",
                { matterjs: [matterjsReadEventPath(START_UP, ["fabricFiltered"])] },
                0,
                Millis(100),
            ),
        );

        expect(record.verdict).equal("pass");
    });

    it("does not take another event of the same cluster for the one it asked for", async () => {
        const record = await withFollower([readEventLine("0.basicInformation.events.shutDown")], follower =>
            expectSequence(
                follower,
                "matterjs",
                "read event path",
                { matterjs: [matterjsReadEventPath(START_UP)] },
                0,
                Millis(100),
            ),
        );

        expect(record.verdict).equal("fail");
    });

    it("does not pass a read the device did not fabric-filter as a filtered one", async () => {
        const record = await withFollower([readEventLine("0.basicInformation.events.startUp", "")], follower =>
            expectSequence(
                follower,
                "matterjs",
                "read event path",
                { matterjs: [matterjsReadEventPath(START_UP, ["fabricFiltered"])] },
                0,
                Millis(100),
            ),
        );

        expect(record.verdict).equal("fail");
    });

    it("passes a subscribe envelope stated across the lines matter.js prints it on", async () => {
        const record = await withFollower(
            [
                subscribeFlagsLine("fabricFiltered keepSubscriptions"),
                subscribeEventsLine("0.basicInformation.events.startUp"),
                "2026-08-22 16:56:20.735 DEBUG ServerSubscription some work of its own",
                subscribeAcceptedLine("10s - 1m 40s =>"),
            ],
            follower =>
                expectSequence(
                    follower,
                    "matterjs",
                    "subscribe envelope",
                    {
                        matterjs: {
                            ordered: [
                                matterjsSubscribeFlags("keepSubscriptions"),
                                matterjsSubscribeEventPath(START_UP),
                                matterjsSubscribeTiming(10, 100),
                            ],
                        },
                    },
                    0,
                    Millis(100),
                ),
        );

        expect(record.verdict).equal("pass");
    });

    it("fails an envelope whose interval bounds are not the ones requested", async () => {
        const record = await withFollower(
            [subscribeFlagsLine("keepSubscriptions"), subscribeAcceptedLine("20s - 1m 40s =>")],
            follower =>
                expectSequence(
                    follower,
                    "matterjs",
                    "subscribe envelope",
                    { matterjs: { ordered: [matterjsSubscribeTiming(10, 100)] } },
                    0,
                    Millis(100),
                ),
        );

        expect(record.verdict).equal("fail");
    });

    it("fails an envelope whose lines arrived in the wrong order", async () => {
        const record = await withFollower(
            [subscribeAcceptedLine("10s - 1m 40s =>"), subscribeFlagsLine("keepSubscriptions")],
            follower =>
                expectSequence(
                    follower,
                    "matterjs",
                    "subscribe envelope",
                    {
                        matterjs: {
                            ordered: [matterjsSubscribeFlags("keepSubscriptions"), matterjsSubscribeTiming(10, 100)],
                        },
                    },
                    0,
                    Millis(100),
                ),
        );

        expect(record.verdict).equal("fail");
    });

    it("does not pass a request that omitted a flag the envelope names", async () => {
        const record = await withFollower([subscribeFlagsLine("fabricFiltered")], follower =>
            expectSequence(
                follower,
                "matterjs",
                "subscribe envelope",
                { matterjs: { ordered: [matterjsSubscribeFlags("keepSubscriptions")] } },
                0,
                Millis(100),
            ),
        );

        expect(record.verdict).equal("fail");
    });
});

describe("expectReportAck against a chip TH", () => {
    // One subscription's report going out on its own exchange, and the acks that come back. chip
    // prints a trace line naming the exchange, then the message's decode dump.
    const SUBSCRIPTION_ID = 0x54c99e7e;

    function reportLines(exchange: string) {
        return [
            `[DMG] >> to UDP:[fe80::1]:5540 | 1234 | [Interaction Model  (1) / Report Data (0x05) / Session = 2 / Exchange = ${exchange}]`,
            "[DMG] ReportDataMessage =",
            "[DMG] {",
            `[DMG] \tSubscriptionId = 0x${SUBSCRIPTION_ID.toString(16)},`,
            "[DMG] \tAttributeReportIBs =",
        ];
    }

    function ackLines(exchange: string, status: string) {
        return [
            `[DMG] << from UDP:[fe80::1]:5540 | 1235 | [Interaction Model  (1) / Status Response (0x01) / Session = 2 / Exchange = ${exchange}]`,
            "[DMG] StatusResponseMessage =",
            "[DMG] {",
            `[DMG] \tStatus = ${status},`,
        ];
    }

    async function ack(lines: string[]) {
        return withFollower(
            lines,
            follower =>
                expectReportAck(
                    follower,
                    "chip-local",
                    {
                        outcome: "found",
                        subscriptionId: SUBSCRIPTION_ID,
                        check: { type: "device-log", verdict: "pass" },
                    },
                    0,
                    Millis(200),
                ),
            { endSource: true },
        );
    }

    it("reads the status out of the ack sent on the report's own exchange", async () => {
        // A run acks one report per write per live subscription, so another subscription's rejection
        // can sit between our report and our own ack
        const check = await ack([
            ...reportLines("9000"),
            ...ackLines("9001", "0x01 (FAILURE)"),
            ...ackLines("9000", "0x00 (SUCCESS)"),
        ]);

        expect(check.verdict).equal("pass");
    });

    it("fails on the status of our own ack, though another exchange succeeded first", async () => {
        const check = await ack([
            ...reportLines("9000"),
            ...ackLines("9001", "0x00 (SUCCESS)"),
            ...ackLines("9000", "0x01 (FAILURE)"),
        ]);

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("FAILURE");
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

    async function ack(lines: string[], subscriptionId = 0x54c99e7e, options?: { carriesData?: boolean }) {
        return withFollower(
            lines,
            follower =>
                expectReportAck(
                    follower,
                    "matterjs",
                    { outcome: "found", subscriptionId, check: { type: "device-log", verdict: "pass" } },
                    0,
                    Millis(200),
                    options,
                ),
            { endSource: true },
        );
    }

    it("reads the id the TH minted", async () => {
        const lookup = await withFollower([SUBSCRIBE_RESPONSE], follower =>
            expectSubscriptionId(follower, "matterjs", 0, Millis(200)),
        );

        expect(lookup.outcome).equal("found");
        expect(lookup.outcome === "found" && lookup.subscriptionId).equal(0x54c99e7e);
        expect(lookup.check.verdict).equal("pass");
    });

    it("hands a failed lookup's own reason to the ack check, not a bare unverified", async () => {
        // Callers gate on `check` before getting here, so this is the guard for one that forgets
        const record = await withFollower(
            [],
            follower =>
                expectReportAck(
                    follower,
                    "matterjs",
                    {
                        outcome: "failed",
                        check: { type: "device-log", verdict: "fail", detail: "no SubscribeResponse arrived" },
                    },
                    0,
                    Millis(200),
                ),
            { endSource: true },
        );

        expect(record.verdict).equal("fail");
        expect(record.detail).equal("no SubscribeResponse arrived");
    });

    it("reports unverified for a flavor whose log names no subscription", async () => {
        const record = await withFollower(
            [],
            follower =>
                expectReportAck(
                    follower,
                    "matterjs",
                    { outcome: "unnamed", check: { type: "device-log", verdict: "unverified" } },
                    0,
                    Millis(200),
                ),
            { endSource: true },
        );

        expect(record.verdict).equal("unverified");
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

    it("accepts a report carrying nothing where the caller allows one, with its own ack", async () => {
        const empty = REPORT.replace("attr: 1", "empty").replace("✉05ab904b", "✉05ab9052");
        const emptyAck = ACK.replace("acked: 05ab904b", "acked: 05ab9052");

        // The priming report of a subscription established with nothing to report yet — the case
        // TC-IDM-6.4 relies on.
        const record = await ack([empty, emptyAck], 0x54c99e7e, { carriesData: false });

        expect(record.verdict).equal("pass");
        expect(record.matched).equal(emptyAck);
    });

    it("still refuses a report carrying nothing whose ack never arrives", async () => {
        const empty = REPORT.replace("attr: 1", "empty").replace("✉05ab904b", "✉05ab9052");

        // Permissive about the data, not about the ack: the DUT must still answer that report.
        expect((await ack([empty], 0x54c99e7e, { carriesData: false })).verdict).equal("fail");
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

describe("readOwnFabricIndex", () => {
    function nodeReporting(value: unknown): CertNodeApi {
        const unused = () => Promise.reject(new InternalError("not used by these tests"));
        return {
            invoke: unused,
            invokeBatch: unused,
            readAttributes: unused,
            writeAttribute: unused,
            writeAttributes: unused,
            subscribe: unused,
            readEvents: unused,
            subscribeEvents: unused,
            openCommissioningWindow: unused,
            operationalMdnsInstanceName: unused,
            decommission: unused,
            readAttribute: async () => value,
        };
    }

    it("returns the index the device reported", async () => {
        expect(await readOwnFabricIndex(nodeReporting(2))).equal(2);
    });

    // The caller uses this to build a log pattern, so a non-numeric read would become a pattern
    // matching a fabric no device has rather than a failure anyone can see
    it("refuses a read that is not a number", async () => {
        await expect(readOwnFabricIndex(nodeReporting(null))).rejectedWith(
            InternalError,
            /Expected CurrentFabricIndex to read as a number/,
        );
    });
});

describe("fabric-removal log patterns", () => {
    // Lines captured from real runs against each device flavor.
    const CHIP_REMOVED = "[1787433103.742] [23362:73430237:chip] [ZCL] OpCreds: RemoveFabric successful";
    const CHIP_EXPIRING = "[1787433103.742] [23362:73430237:chip] [IN] Expiring all sessions for fabric 0x2!!";
    const MATTERJS_REMOVED =
        "2026-08-22 21:48:06.406 INFO ProtocolService Invoke » binford-6100.operationalCredentials.removeFabric @1:9a52bb47a4ee167d•c675⇵68ce✉09f1964b statusCode: 0 fabricIndex: 2";
    const MATTERJS_SESSION_ENDED = "2026-08-22 21:48:06.401 INFO Session @2:1946ee4c0f86d574•c677 Session ended";

    async function check(flavor: string, patterns: LogExpectPatterns, lines: string[]) {
        return withFollower(lines, async follower => {
            return (await expectDeviceLog(follower, flavor, patterns, 0, Millis(100))).check;
        });
    }

    const removalCheck = (flavor: string, fabricIndex: number, lines: string[]) =>
        check(flavor, removeFabricSucceeded(fabricIndex), lines);

    it("finds the removal of the fabric it asked about", async () => {
        expect((await removalCheck("chip-local", 2, [CHIP_REMOVED])).verdict).equal("pass");
        expect((await removalCheck("matterjs", 2, [MATTERJS_REMOVED])).verdict).equal("pass");
    });

    it("does not take another fabric's removal for the one it asked about", async () => {
        expect((await removalCheck("matterjs", 3, [MATTERJS_REMOVED])).verdict).equal("fail");
    });

    it("does not take fabric 20's removal for fabric 2's", async () => {
        const fabric20 = MATTERJS_REMOVED.replace("fabricIndex: 2", "fabricIndex: 20");

        expect((await removalCheck("matterjs", 2, [fabric20])).verdict).equal("fail");
    });

    it("does not pass a removal the device answered with a failure status", async () => {
        const rejected = MATTERJS_REMOVED.replace("statusCode: 0", "statusCode: 11");

        expect((await removalCheck("matterjs", 2, [rejected])).verdict).equal("fail");
    });

    it("finds the removed fabric's sessions ending in either device's log", async () => {
        expect((await check("chip-local", fabricSessionsEnded(2), [CHIP_EXPIRING])).verdict).equal("pass");
        expect((await check("matterjs", fabricSessionsEnded(2), [MATTERJS_SESSION_ENDED])).verdict).equal("pass");
    });

    it("does not take another fabric's session ending for the removed fabric's", async () => {
        expect((await check("matterjs", fabricSessionsEnded(1), [MATTERJS_SESSION_ENDED])).verdict).equal("fail");
        expect((await check("chip-local", fabricSessionsEnded(1), [CHIP_EXPIRING])).verdict).equal("fail");
    });

    it("does not take fabric 20's session ending for fabric 2's", async () => {
        const fabric20 = MATTERJS_SESSION_ENDED.replace("@2:", "@20:");

        expect((await check("matterjs", fabricSessionsEnded(2), [fabric20])).verdict).equal("fail");
    });

    it("does not take a PASE session ending for a removed fabric's", async () => {
        const unsecured = "2026-08-23 22:41:11.220 INFO Session •unsecured#7372af0fa8e6f033 Session ended";

        expect((await check("matterjs", fabricSessionsEnded(2), [unsecured])).verdict).equal("fail");
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

    it("reports unverified for a flavor neither implementation's patterns speak for", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "python", 1, 0x6, 0x1, [], 0, Seconds(1)),
        );

        expect(record.verdict).equal("unverified");
    });

    // A string field is rendered by its own TLV type, which chip states as the string's length in
    // bytes — the shape TC-G-3.2's AddGroupIfIdentifying GroupName is checked by.
    const STRING_FIELD = '[DMG] 0x1 = "gp3" (3 chars),';

    it("passes on a string field chip printed with its character count", async () => {
        const record = await withFollower([...PATH, STRING_FIELD], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 1, value: "gp3" }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("does not take a longer string for the one the step asked for", async () => {
        const record = await withFollower([...PATH, '[DMG] 0x1 = "gp30" (4 chars),'], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 1, value: "gp3" }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
    });

    it("counts a string's UTF-8 bytes, as chip does, not its code points", async () => {
        const record = await withFollower([...PATH, '[DMG] 0x1 = "gpü" (4 chars),'], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 1, value: "gpü" }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("matches a string carrying regular-expression syntax literally", async () => {
        const record = await withFollower([...PATH, '[DMG] 0x1 = "g.3" (3 chars),'], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 1, value: "g.3" }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("pass");
    });

    it("does not let a string's regular-expression syntax match another value", async () => {
        const record = await withFollower([...PATH, '[DMG] 0x1 = "gp3" (3 chars),'], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 1, value: "g.3" }], 0, Seconds(1)),
        );

        expect(record.verdict).equal("fail");
    });
});

describe("runCleanups", () => {
    it("runs every cleanup even after one fails, and reports both failures", async () => {
        const ran = new Array<string>();

        const failure = await expect(
            runCleanups(
                async () => {
                    ran.push("settle");
                    throw new CertCleanupError("an attempt is still running");
                },
                async () => {
                    ran.push("decommission");
                    throw new CertCleanupError("the fabric is still on the TH");
                },
            ),
        ).rejectedWith(CertCleanupErrors);

        expect(ran).deep.equal(["settle", "decommission"]);
        // The engine records a finalization failure as the message alone, so both have to be named there
        expect(failure.message).contains("an attempt is still running");
        expect(failure.message).contains("the fabric is still on the TH");
        expect(failure.errors.map((e: Error) => e.message)).deep.equal([
            "an attempt is still running",
            "the fabric is still on the TH",
        ]);
    });

    it("rethrows a lone failure as it arrived, so its own type survives", async () => {
        class OwnError extends CertCleanupError {}

        await expect(
            runCleanups(
                async () => {
                    throw new OwnError("only this one failed");
                },
                async () => {},
            ),
        ).rejectedWith(OwnError, /only this one failed/);
    });

    it("resolves when every cleanup does", async () => {
        const ran = new Array<string>();

        await runCleanups(
            async () => {
                ran.push("first");
            },
            async () => {
                ran.push("second");
            },
        );

        expect(ran).deep.equal(["first", "second"]);
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
