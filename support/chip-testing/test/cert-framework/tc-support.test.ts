/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogFollower } from "@matter/testing";
import {
    attributePathIBSequence,
    countMatches,
    expectChunkedTransfer,
    expectMessageWithPath,
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
