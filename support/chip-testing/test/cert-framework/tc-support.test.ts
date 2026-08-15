/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertNodeApi, CertStepContext, ControllerAdapter } from "@matter/testing";
import { LogFollower } from "@matter/testing";
import {
    attributePathIBSequence,
    CertCleanupError,
    CommissionedRefs,
    commandPathIBSequence,
    countMatches,
    EVENT_PATH_IBS_SEQUENCE,
    eventPathIBSequence,
    expectChunkedTransfer,
    expectCommandInvoke,
    expectMessageWithPath,
    expectSequence,
    fabricFilteredPattern,
    READ_REQUEST_MESSAGE,
    requireId,
    STATUS_RESPONSE_SUCCESS,
    WRITE_REQUEST_MESSAGE,
} from "../cert/tc-support.js";

const CHUNK = "[DMG] ReportDataMessage =";
const ACK = "[EM] <<< [E:1r S:2 M:3] (S) Msg RX from 1:0000000000000001 [1234] --- Type 0001:01 (IM:StatusResponse)";
const NOISE = "[DMG] AttributeReportIBs =";

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
        // `.lines` synchronously (e.g. countMatches) instead of waiting via `.expect()` needs the
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
    return withFollower(lines, follower => expectChunkedTransfer(follower, flavor, 0, 1_000), { endSource });
}

describe("expectChunkedTransfer", () => {
    it("passes when every chunk but the last is acked", async () => {
        const record = await check([CHUNK, NOISE, ACK, CHUNK, ACK, CHUNK, NOISE]);

        expect(record.verdict).equal("pass");
        expect(record.detail).equal("3 report chunks, each but the last followed by a StatusResponse");
    });

    it("fails when a later chunk pair has no StatusResponse between it", async () => {
        const record = await check([CHUNK, ACK, CHUNK, NOISE, CHUNK, ACK]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 2 of 3 went unacked/);
    });

    it("fails when the first chunk pair has no StatusResponse between it", async () => {
        const record = await check([CHUNK, CHUNK, ACK, CHUNK, ACK]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/chunk 1 of 3 went unacked/);
    });

    it("fails when the read never chunked", async () => {
        const record = await check([CHUNK, ACK]);

        expect(record.verdict).equal("fail");
        expect(record.detail).match(/did not chunk/);
    });

    it("treats a log source that ends mid-transfer as the end of the transfer", async () => {
        const record = await check([CHUNK, ACK, CHUNK, ACK, CHUNK], "chip-docker", true);

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
            expectSequence(follower, "chip-local", "read event path", SEQUENCE, 0, 1_000),
        );

        expect(record.verdict).equal("pass");
        expect(record.matched).equal("[DMG] },");
    });

    it("finds isFabricFiltered after the path block, which is not adjacent to it", async () => {
        const record = await withFollower(READ_EVENT_LINES, async follower => {
            const block = await expectSequence(follower, "chip-local", "read event path", SEQUENCE, 0, 1_000);
            expect(block.logLine).equal(9);
            return expectSequence(
                follower,
                "chip-local",
                "isFabricFiltered",
                [fabricFilteredPattern(true)],
                block.logLine! + 1,
                1_000,
            );
        });

        expect(record.verdict).equal("pass");
    });

    it("fails, rather than throwing, when the sequence never arrives", async () => {
        const record = await withFollower(["[DMG] ReadRequestMessage ="], follower =>
            expectSequence(follower, "chip-local", "read event path", SEQUENCE, 0, 200),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal("read event path");
    });

    it("reports unverified for a flavor with no pattern for the sequence", async () => {
        const record = await withFollower(READ_EVENT_LINES, follower =>
            expectSequence(follower, "matterjs", "read event path", SEQUENCE, 0, 1_000),
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
            expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, 1_000),
        );

        expect(record.verdict).equal("pass");
    });

    it("fails at the message stage when the path block appears without the message", async () => {
        const record = await withFollower([...PATH], follower =>
            expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, 1_000),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal(String(WRITE_REQUEST_MESSAGE));
    });

    it("fails at the path stage when a path block appears before the message but not after", async () => {
        const record = await withFollower([...PATH, WRITE], follower =>
            expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, 1_000),
        );

        expect(record.verdict).equal("fail");
        expect(record.pattern).equal(`AttributePathIB ${JSON.stringify(FIELDS)}`);
    });

    it("reports unverified for a flavor with no pattern for the message", async () => {
        const record = await withFollower([WRITE, ...PATH], follower =>
            expectMessageWithPath(follower, "matterjs", WRITE_REQUEST_MESSAGE, FIELDS, 0, 1_000),
        );

        expect(record.verdict).equal("unverified");
    });

    it("gives up within roughly one timeoutMs budget when the path block never arrives, not two", async () => {
        // The message must arrive partway through the budget, not be already buffered — otherwise
        // stage 1 costs ~0ms and remaining() is indistinguishable from a fresh timeoutMs, hiding a
        // shared-vs-fresh-budget regression in stage 2 instead of catching it.
        const timeoutMs = 600;
        const source = new OpenSource();
        const follower = new LogFollower(source, "th");
        setTimeout(() => source.push(WRITE), 300);

        const start = Date.now();
        const record = await expectMessageWithPath(follower, "chip-local", WRITE_REQUEST_MESSAGE, FIELDS, 0, timeoutMs);
        const elapsed = Date.now() - start;
        await follower.close();

        expect(record.verdict).equal("fail");
        expect(elapsed).lessThan(timeoutMs * 1.25);
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
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 0, value: 4097 }], 0, 1_000),
        );

        expect(record.verdict).equal("pass");
    });

    it("fails when a field line never appears", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [{ id: 0, value: 4097 }], 0, 1_000),
        );

        expect(record.verdict).equal("fail");
    });

    it("passes with no field checks when fields is empty", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "chip-local", 1, 0x6, 0x1, [], 0, 1_000),
        );

        expect(record.verdict).equal("pass");
    });

    it("reports unverified for a flavor with no pattern", async () => {
        const record = await withFollower([...PATH], follower =>
            expectCommandInvoke(follower, "matterjs", 1, 0x6, 0x1, [], 0, 1_000),
        );

        expect(record.verdict).equal("unverified");
    });
});

describe("countMatches", () => {
    const SUCCESS = "[DMG] Status = 0x00 (SUCCESS),";

    it("counts only lines at or after the cursor", async () => {
        await withFollower(
            [SUCCESS, "noise", SUCCESS],
            follower => {
                expect(countMatches(follower, "chip-local", STATUS_RESPONSE_SUCCESS, 0)).equal(2);
                expect(countMatches(follower, "chip-local", STATUS_RESPONSE_SUCCESS, 1)).equal(1);
                return Promise.resolve();
            },
            { drain: true },
        );
    });

    it("returns 0 when nothing matches", async () => {
        await withFollower(
            ["noise", "more noise"],
            follower => {
                expect(countMatches(follower, "chip-local", STATUS_RESPONSE_SUCCESS, 0)).equal(0);
                return Promise.resolve();
            },
            { drain: true },
        );
    });

    it("skips synthetic lines the same way LogFollower.expect does", async () => {
        await withFollower(
            [SUCCESS],
            follower => {
                follower.annotate(SUCCESS);
                expect(countMatches(follower, "chip-local", STATUS_RESPONSE_SUCCESS, 0)).equal(1);
                return Promise.resolve();
            },
            { drain: true },
        );
    });

    it("does not let a stateful /g pattern skip matches across repeated calls", async () => {
        await withFollower(
            [SUCCESS, SUCCESS, SUCCESS, SUCCESS],
            follower => {
                const stateful = new RegExp(STATUS_RESPONSE_SUCCESS.source, "g");
                expect(countMatches(follower, "chip-local", stateful, 0)).equal(4);
                expect(countMatches(follower, "chip-local", stateful, 0)).equal(4);
                return Promise.resolve();
            },
            { drain: true },
        );
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
