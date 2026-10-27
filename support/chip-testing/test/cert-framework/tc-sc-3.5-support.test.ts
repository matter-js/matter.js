/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, InternalError, LogDestination, Logger, LogLevel, Millis } from "@matter/general";
import type { CertNodeRef, CommissioningTarget, ControllerAdapter } from "@matter/testing";
import { LineQueue, LogFollower, UnsupportedByControllerError } from "@matter/testing";
import { CommissioningAttempts } from "../cert/tc-sc-3.5-support.js";

interface FakeController {
    adapter: ControllerAdapter;
    lines: LineQueue;
    targets: CommissioningTarget[];
    settle(outcome: { ref: CertNodeRef } | { error: Error }): void;
}

function fakeController(id: number, events: string[], options: { failClose?: Error; failStart?: Error } = {}) {
    const lines = new LineQueue();
    const targets = new Array<CommissioningTarget>();
    let settle: FakeController["settle"] = () => {
        throw new InternalError("settled before commission() was called");
    };
    const log = new LogFollower(lines.follow(), `dut-${id}`);

    const adapter: ControllerAdapter = {
        id: `dut-${id}`,
        log,
        async start() {
            events.push(`start ${id}`);
            if (options.failStart !== undefined) {
                throw options.failStart;
            }
        },
        async close() {
            events.push(`close ${id}`);
            lines.close();
            await log.close();
            if (options.failClose !== undefined) {
                throw options.failClose;
            }
        },
        commission(target: CommissioningTarget) {
            events.push(`commission ${id}`);
            targets.push(target);
            return new Promise<CertNodeRef>((resolve, reject) => {
                settle = outcome => ("ref" in outcome ? resolve(outcome.ref) : reject(outcome.error));
            });
        },
        async parseQrPayload() {
            throw new InternalError("not used in this test");
        },
        async parseManualPairingCode(): Promise<never> {
            throw new InternalError("not used in this test");
        },
        group(): never {
            throw new InternalError("not used in this test");
        },
        node(): never {
            throw new InternalError("not used in this test");
        },
    };

    const controller: FakeController = {
        adapter,
        lines,
        targets,
        settle: outcome => settle(outcome),
    };
    return controller;
}

async function levelsLogged(action: () => Promise<void>) {
    const levels = new Array<LogLevel>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "TC-SC-3.5") {
                levels.push(message.level);
            }
        },
    });
    try {
        await action();
    } finally {
        delete Logger.destinations.capture;
    }
    return levels;
}

const TARGET: CommissioningTarget = { passcode: 20202021, discriminator: 1234, giveUpAfterMs: 30_000 };

describe("TC-SC-3.5 CommissioningAttempts", () => {
    it("closes the previous attempt's controller before it builds and starts the next one", async () => {
        const events = new Array<string>();
        const controllers = new Array<FakeController>();
        const attempts = new CommissioningAttempts(() => {
            const controller = fakeController(controllers.length, events);
            controllers.push(controller);
            events.push(`build ${controllers.length - 1}`);
            return controller.adapter;
        }, Millis(50));

        expect((await attempts.start(TARGET)).index).equal(0);
        expect((await attempts.start(TARGET)).index).equal(1);
        await attempts.retire();

        expect(events).deep.equal([
            "build 0",
            "start 0",
            "commission 0",
            "close 0",
            "build 1",
            "start 1",
            "commission 1",
            "close 1",
        ]);
        expect(attempts.count).equal(2);
        expect(controllers[1].targets).deep.equal([TARGET]);
    });

    it("answers without waiting for the commissioning, and keeps its rejection from the caller", async () => {
        const unhandled = new Array<unknown>();
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on("unhandledRejection", onUnhandled);
        try {
            const controller = fakeController(0, []);
            const attempts = new CommissioningAttempts(() => controller.adapter, Millis(50));

            await attempts.start(TARGET);
            // The attempt fails while the script still runs, long before the attempt is retired
            controller.settle({ error: new InternalError("CASE failed") });
            await new Promise(resolve => setImmediate(resolve));
            await attempts.retire();
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }

        expect(unhandled).deep.equal([]);
    });

    it("logs a device-side failure at debug and a refusal of the controller itself at warn", async () => {
        const failures = [
            new InternalError("CASE failed"),
            new UnsupportedByControllerError("commission", "fake", "not offered", "attestation"),
        ];
        let built = 0;
        const controllers = failures.map((_, index) => fakeController(index, []));
        const attempts = new CommissioningAttempts(() => controllers[built++].adapter, Millis(50));

        const levels = await levelsLogged(async () => {
            for (const [index, error] of failures.entries()) {
                await attempts.start(TARGET);
                controllers[index].settle({ error });
            }
            await attempts.retire();
        });

        expect(levels).deep.equal([LogLevel.DEBUG, LogLevel.WARN]);
    });

    it("retires an attempt whose commissioning never ends after a bounded wait", async () => {
        const controller = fakeController(0, []);
        const attempts = new CommissioningAttempts(() => controller.adapter, Millis(50));

        await attempts.start(TARGET);
        const started = performance.now();
        await attempts.retire();

        expect(performance.now() - started, "waited for the commissioning to end").gte(40);
    });

    it("keeps each attempt's log, named by attempt, also when its controller fails to close", async () => {
        const failure = new InternalError("close failed");
        const controllers = [fakeController(0, []), fakeController(1, [], { failClose: failure })];
        let built = 0;
        const attempts = new CommissioningAttempts(() => controllers[built++].adapter, Millis(50));

        await attempts.start(TARGET);
        controllers[0].lines.push("attempt 0 line");
        await new Promise(resolve => setImmediate(resolve));
        await attempts.start(TARGET);
        controllers[1].lines.push("attempt 1 line");
        await new Promise(resolve => setImmediate(resolve));
        await expect(attempts.retire()).rejectedWith(failure);

        expect(attempts.logs.map(({ name, lines }) => [name, lines.map(line => line.text)])).deep.equal([
            ["controller-dut-attempt-0", ["attempt 0 line"]],
            ["controller-dut-attempt-1", ["attempt 1 line"]],
        ]);

        await attempts.retire();
        expect(attempts.logs).length(2);
    });

    it("closes a controller that failed to start when the next attempt starts", async () => {
        const events = new Array<string>();
        const failure = new InternalError("start failed");
        const controllers = [fakeController(0, events, { failStart: failure }), fakeController(1, events)];
        let built = 0;
        const attempts = new CommissioningAttempts(() => controllers[built++].adapter, Millis(50));

        await expect(attempts.start(TARGET)).rejectedWith(failure);
        await attempts.start(TARGET);

        expect(events).deep.equal(["start 0", "close 0", "start 1", "commission 1"]);
    });
});
