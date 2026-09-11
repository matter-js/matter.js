/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Millis, Time } from "@matter/main";
import { LineQueue } from "@matter/testing";
import { expect } from "chai";
import { registerLogOwner, unregisterLogOwner } from "../../src/cert/log-owners.js";

// Importing installs the destination this exercises
import "../../src/cert/index.js";

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
        registerLogOwner(env, kind, queue);
        return test(env, queue).finally(() => {
            unregisterLogOwner(env);
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

    it("keeps a controller adapter's line out of the device log", async () => {
        const deviceEnv = new Environment("device-owner-test", Environment.default);
        const deviceQueue = new LineQueue();
        registerLogOwner(deviceEnv, "device", deviceQueue);

        const adapterEnv = new Environment("adapter-owner-test", Environment.default);
        const adapterQueue = new LineQueue();
        registerLogOwner(adapterEnv, "adapter", adapterQueue);

        try {
            adapterEnv.logger("AdapterFacility").info("from an adapter");
        } finally {
            unregisterLogOwner(deviceEnv);
            unregisterLogOwner(adapterEnv);
            deviceQueue.close();
            adapterQueue.close();
        }

        expect(await allLines(deviceQueue)).deep.equals([]);
        expect((await allLines(adapterQueue)).join("\n")).match(/from an adapter/);
    });
});
