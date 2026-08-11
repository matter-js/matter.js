/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogFollower } from "@matter/testing";
import { expectChunkedTransfer } from "../cert/tc-support.js";

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

async function check(lines: string[], flavor = "chip-docker", endSource = false) {
    const source = new OpenSource();
    const follower = new LogFollower(source, "th");
    source.push(...lines);
    if (endSource) {
        source.end();
    }
    try {
        return await expectChunkedTransfer(follower, flavor, 0, 1_000);
    } finally {
        await follower.close();
    }
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
