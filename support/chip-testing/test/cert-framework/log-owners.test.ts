/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, InternalError, Millis, Time } from "@matter/main";
import { LineQueue } from "@matter/testing";
import { expect } from "chai";
import { registerLogOwner } from "../../src/cert/log-owners.js";

// Importing installs the destinations this exercises
import { runTaggedForDevice } from "../../src/cert/index.js";

async function allLines(queue: LineQueue) {
    const lines = new Array<string>();
    for await (const line of queue) {
        lines.push(line);
    }
    return lines;
}

async function firstLine(queue: LineQueue) {
    for await (const line of queue) {
        return line;
    }
}

describe("cert log attribution", () => {
    function withOwner(kind: "device" | "adapter", test: (env: Environment, queue: LineQueue) => Promise<void>) {
        const env = new Environment("log-owner-test", Environment.default);
        const queue = new LineQueue();
        const release = registerLogOwner(env, kind, queue);
        return test(env, queue).finally(() => {
            release();
            queue.close();
        });
    }

    it("routes a device's line to that device's log when no call attributes it", async () => {
        await withOwner("device", async (env, queue) => {
            // From a timer callback, where no call stack names the node
            Time.getTimer("log owner test", Millis(1), () =>
                env.logger("TimerFacility").info("from a callback"),
            ).start();

            expect(await firstLine(queue)).match(/from a callback/);
        });
    });

    it("routes a line from a child environment to the node that owns it", async () => {
        await withOwner("device", async (env, queue) => {
            const child = new Environment("child", env);

            child.logger("ChildFacility").info("from a child environment");

            expect(await firstLine(queue)).match(/from a child environment/);
        });
    });

    // The attribution a step reads must beat the one the call stack suggests, or a device's line lands in whichever
    // device's lifecycle call happens to be running
    it("keeps an adapter's line out of a device's log even while that device's call is on the stack", async () => {
        const deviceEnv = new Environment("device-owner-test", Environment.default);
        const deviceQueue = new LineQueue();
        const releaseDevice = registerLogOwner(deviceEnv, "device", deviceQueue);

        const adapterEnv = new Environment("adapter-owner-test", Environment.default);
        const adapterQueue = new LineQueue();
        const releaseAdapter = registerLogOwner(adapterEnv, "adapter", adapterQueue);

        try {
            await runTaggedForDevice("device-owner-test", async () => {
                adapterEnv.logger("AdapterFacility").info("from an adapter");
            });
        } finally {
            releaseDevice();
            releaseAdapter();
            deviceQueue.close();
            adapterQueue.close();
        }

        expect(await allLines(deviceQueue)).deep.equals([]);
        expect((await allLines(adapterQueue)).join("\n")).match(/from an adapter/);
    });

    // The fallback exists because matter.js reports a crashed endpoint and a crashed runtime through this logger,
    // from work no device call encloses
    it("still reports a line nobody owns", async () => {
        const reported = new Array<string>();
        const consoleError = console.error;
        console.error = (text: string) => void reported.push(text);

        try {
            new Environment("unowned-test", Environment.default).logger("UnownedFacility").info("nobody owns this");
        } finally {
            console.error = consoleError;
        }

        expect(reported.join("\n")).match(/nobody owns this/);
    });

    it("refuses a second owner for one environment", () => {
        const env = new Environment("duplicate-owner-test", Environment.default);
        const queue = new LineQueue();
        const release = registerLogOwner(env, "device", queue);

        try {
            expect(() => registerLogOwner(env, "adapter", new LineQueue())).throws(InternalError);
        } finally {
            release();
            queue.close();
        }
    });

    it("leaves a later owner's routing alone when an earlier one releases", async () => {
        const env = new Environment("recycled-owner-test", Environment.default);

        const firstQueue = new LineQueue();
        const releaseFirst = registerLogOwner(env, "device", firstQueue);
        releaseFirst();

        const secondQueue = new LineQueue();
        const releaseSecond = registerLogOwner(env, "device", secondQueue);

        try {
            releaseFirst();

            env.logger("RecycledFacility").info("for the second owner");

            expect(await firstLine(secondQueue)).match(/for the second owner/);
        } finally {
            releaseSecond();
            firstQueue.close();
            secondQueue.close();
        }
    });
});
