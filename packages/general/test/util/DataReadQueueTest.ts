/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, InternalError } from "#MatterError.js";
import { DataReadQueue } from "#util/DataReadQueue.js";

describe("DataReadQueue", () => {
    it("returns previously written data", async () => {
        const queue = new DataReadQueue<number>();
        queue.write(1);
        queue.write(2);

        expect(queue.size).equal(2);
        expect(await queue.read()).equal(1);
        expect(await queue.read()).equal(2);
        expect(queue.size).equal(0);
    });

    it("resolves a pending read when data is written", async () => {
        const queue = new DataReadQueue<number>();

        const pending = queue.read();
        queue.write(42);

        expect(await pending).equal(42);
    });

    it("rejects reads after close", async () => {
        const queue = new DataReadQueue<number>();
        queue.close();

        await expect(queue.read()).rejectedWith(ClosedError, "Channel is closed");
    });

    it("rejects writes after close", () => {
        const queue = new DataReadQueue<number>();
        queue.close();

        expect(() => queue.write(1)).throws(ClosedError, "Channel is closed");
    });

    it("rejects a pending read when closed", async () => {
        const queue = new DataReadQueue<number>();

        const pending = queue.read();
        queue.close();

        await expect(pending).rejected;
    });

    it("supports only one pending read", async () => {
        const queue = new DataReadQueue<number>();

        const first = queue.read();
        await expect(queue.read()).rejectedWith(InternalError, "Only one pending read");

        queue.write(1);
        expect(await first).equal(1);
    });
});
