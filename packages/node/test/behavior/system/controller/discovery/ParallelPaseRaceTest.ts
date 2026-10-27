/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Millis, Seconds, Time } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { CommissioningError, PeerCommunicationError } from "@matter/protocol";
import { configure, DEVICE, DEVICE_B, DEVICE_C, settle, TestDiscovery, untilAborted } from "./discovery-helpers.js";

/** Collects unhandled rejections in Node.js (process event) and browsers (global event) until disposed. */
function trackUnhandledRejections() {
    const collected = new Array<unknown>();

    if (typeof process !== "undefined" && typeof process.on === "function") {
        const handler = (reason: unknown) => collected.push(reason);
        process.on("unhandledRejection", handler);
        return {
            collected,
            [Symbol.dispose]: () => process.removeListener("unhandledRejection", handler),
        };
    }

    const handler = (event: Event) => {
        if ("reason" in event) {
            collected.push(event.reason);
        }
        event.preventDefault();
    };
    globalThis.addEventListener("unhandledrejection", handler);
    return {
        collected,
        [Symbol.dispose]: () => globalThis.removeEventListener("unhandledrejection", handler),
    };
}

describe("ParallelPaseDiscovery race", () => {
    beforeEach(() => {
        MockTime.init();
    });

    it("resolves with the winner while a losing attempt's rejection stays handled", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE, DEVICE_B, DEVICE_C]);
            using unhandled = trackUnhandledRejections();

            const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, async (win, signal, index) => {
                if (index === 0) {
                    await Abort.sleep("test PASE", undefined, Seconds(3));
                    expect(win()).equals(true);
                    return;
                }
                if (index === 1) {
                    throw new PeerCommunicationError("Device did not answer");
                }
                await untilAborted(signal);
            });

            const result = await MockTime.resolve(discovery, { macrotasks: true });
            await MockTime.resolve(Time.sleep("late rejections", Seconds(1)), { macrotasks: true });

            expect(result.state.commissioning.deviceIdentifier).equals(DEVICE.deviceIdentifier);
            expect(unhandled.collected).empty;
        } finally {
            await node.close();
        }
    });

    it("rejects with the winner's own error", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE]);

            const failure = new CommissioningError("Commissioning failed after PASE");
            const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, async win => {
                await Abort.sleep("test PASE", undefined, Seconds(1));
                expect(win()).equals(true);
                throw failure;
            });

            expect(await MockTime.resolve(settle(discovery), { macrotasks: true })).equals(failure);
        } finally {
            await node.close();
        }
    });

    it("starts attempts one stagger slot apart", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE, DEVICE_B, DEVICE_C]);

            const startedAt = new Array<number>();
            const discovery = new TestDiscovery(node, { timeout: Seconds(5) }, async (_win, signal) => {
                startedAt.push(Time.nowUs);
                await untilAborted(signal);
            });
            await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(startedAt.map(at => at - startedAt[0])).deep.equals([0, 1000, 2000]);
        } finally {
            await node.close();
        }
    });

    it("does not start a staggered attempt once a candidate has won", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE, DEVICE_B]);

            const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, async (win, signal, index) => {
                if (index === 0) {
                    await Abort.sleep("test PASE", undefined, Millis(100));
                    expect(win()).equals(true);
                    return;
                }
                await untilAborted(signal);
            });

            await MockTime.resolve(discovery, { macrotasks: true });
            expect(discovery.discovered).equals(2);
            expect(discovery.started).equals(1);
        } finally {
            await node.close();
        }
    });

    it("ends pending stagger waits when discovery ends without a win", async () => {
        const node = await MockServerNode.createOnline();
        try {
            await configure(node, [DEVICE, DEVICE_B, DEVICE_C]);

            const discovery = new TestDiscovery(node, { timeout: Millis(1500) }, (_win, signal) =>
                untilAborted(signal),
            );
            const startedAt = Time.nowUs;
            await MockTime.resolve(settle(discovery), { macrotasks: true });

            expect(discovery.started).equals(2);
            expect(Time.nowUs - startedAt).lessThan(2000);
        } finally {
            await node.close();
        }
    });
});
