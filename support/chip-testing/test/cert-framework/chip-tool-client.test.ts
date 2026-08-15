/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ImplementationError,
    InternalError,
    Millis,
    Seconds,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { expect } from "chai";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import type { ChipToolClientOptions } from "../../src/chip-tool/chip-tool-client.js";
import {
    assertChipToolHostSupported,
    ChipToolClient,
    ChipToolExitError,
    CHIP_TOOL_READY_MESSAGE,
    resolveChipToolBinary,
} from "../../src/chip-tool/chip-tool-client.js";
import {
    delay,
    DYING_BODY,
    FakeChipTool,
    NEVER_READY_BODY,
    READY_BODY,
    SLOW_READY_BODY,
    startStalledServer,
    waitFor,
    writeStandInBinary,
} from "./fake-chip-tool.js";

async function pidOf(pidFile: string) {
    const pid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
    if (Number.isNaN(pid)) {
        throw new InternalError(`Stand-in binary recorded no pid in ${pidFile}`);
    }
    return pid;
}

/** Whether the process whose pid the stand-in binary recorded is still alive. */
async function isRunning(pidFile: string) {
    const pid = await pidOf(pidFile);

    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

describe("ChipToolClient", function () {
    // Every test here spawns a process and opens a socket; the default 2s budget is not enough for
    // the first of them on a cold host
    this.timeout(15_000);

    let fake: FakeChipTool;
    let dir: string;
    let logs: string[];
    let asyncResults: unknown[];
    let client: ChipToolClient | undefined;
    let pidFile: string;

    beforeEach(async () => {
        fake = await FakeChipTool.start();
        dir = await mkdtemp(join(tmpdir(), "matter-chip-tool-client-test-"));
        pidFile = join(dir, "pid");
        logs = new Array<string>();
        asyncResults = new Array<unknown>();
    });

    afterEach(async () => {
        await client?.close();
        client = undefined;
        await fake.close();
        await rm(dir, { recursive: true, force: true });
    });

    async function create(
        body = READY_BODY,
        startupTimeout = Seconds(10),
        overrides: Partial<ChipToolClientOptions> = {},
    ) {
        const binaryPath = await writeStandInBinary(dir, pidFile, body);

        client = new ChipToolClient({
            binaryPath,
            storageDirectory: dir,
            commissionerName: "alpha",
            port: fake.port,
            startupTimeout,
            onLog: line => logs.push(line),
            onAsyncResult: entry => asyncResults.push(entry),
            ...overrides,
        });

        return client;
    }

    async function start(body = READY_BODY) {
        const started = await create(body);
        await started.start();
        return started;
    }

    it("serializes concurrent commands so the server's single result slot is never shared", async () => {
        const chipTool = await start();

        fake.reply = command => ({ results: [{ command }], delayMs: 40 });

        // allSettled, so an assertion below failing before the commands do cannot leave an orphaned
        // rejection that reports itself instead of the assertion
        const settled = Promise.allSettled([
            chipTool.execute("any read-by-id 0x6 0x0 1 1"),
            chipTool.execute("any read-by-id 0x6 0x0 1 2"),
        ]);

        await waitFor(() => fake.frames.length > 0, "the first command frame");
        await delay(20);
        expect(fake.frames).deep.equal(["any read-by-id 0x6 0x0 1 1"]);

        const outcomes = await settled;

        expect(fake.violations).deep.equal([]);
        expect(fake.commands).deep.equal(["any read-by-id 0x6 0x0 1 1", "any read-by-id 0x6 0x0 1 2"]);
        expect(
            outcomes.map(outcome => (outcome.status === "fulfilled" ? outcome.value.results : outcome.reason)),
        ).deep.equal([[{ command: "any read-by-id 0x6 0x0 1 1" }], [{ command: "any read-by-id 0x6 0x0 1 2" }]]);
    });

    it("decodes base64 log messages into the reply, and keeps them out of onLog", async () => {
        const chipTool = await start();

        fake.reply = () => ({ logs: ["Manual pairing code: [36217551633]"] });

        const result = await chipTool.execute("pairing open-commissioning-window 1 1 180 1000 42");

        expect(result.logs).deep.equal(["Manual pairing code: [36217551633]"]);
        expect(logs).not.to.include("Manual pairing code: [36217551633]");
    });

    it("resolves with an error entry rather than rejecting", async () => {
        const chipTool = await start();

        fake.reply = () => ({ status: 1 });

        const result = await chipTool.execute("any read-by-id 0xffff 0x0 1 1");

        expect(result.results).deep.equal([{ error: "FAILURE" }]);
    });

    it("delivers a report pushed while idle to onAsyncResult, not to a later command", async () => {
        const chipTool = await start();

        chipTool.armReports();
        await waitFor(() => fake.parked, "the client to park an async-report frame");

        expect(fake.pushReport({ clusterId: 6, endpointId: 1, attributeId: 0, value: true })).equal("sent");
        await waitFor(() => asyncResults.length === 1, "the report to reach onAsyncResult");

        expect(asyncResults).deep.equal([{ clusterId: 6, endpointId: 1, attributeId: 0, value: true }]);

        fake.reply = () => ({ results: [{ value: 42 }] });
        const result = await chipTool.execute("any read-by-id 0x6 0x0 1 1");

        expect(result.results).deep.equal([{ value: 42 }]);
    });

    it("drops nothing from a command's results when a report lands in them", async () => {
        const chipTool = await start();

        chipTool.armReports();
        await waitFor(() => fake.parked, "the client to park an async-report frame");

        fake.reply = () => ({ results: [{ value: 42 }], delayMs: 60 });
        const pending = chipTool.execute("any read-by-id 0x6 0x0 1 1");

        await waitFor(() => fake.commands.length === 1, "the command to reach the server");
        await delay(10);
        expect(fake.pushReport({ clusterId: 6, endpointId: 1, attributeId: 0, value: true })).equal("appended");

        const result = await pending;

        expect(result.results).deep.equal([
            { clusterId: 6, endpointId: 1, attributeId: 0, value: true },
            { value: 42 },
        ]);
        expect(asyncResults).deep.equal([]);
        expect(fake.violations).deep.equal([]);
    });

    it("re-arms immediately after dispatching an async report", async () => {
        const chipTool = await start();

        chipTool.armReports();
        await waitFor(() => fake.armings.length === 1, "the first arming frame");

        fake.pushReport({ value: 1 });
        await waitFor(() => asyncResults.length === 1, "the report to reach onAsyncResult");
        await waitFor(() => fake.armings.length === 2, "the client to re-arm after the report");

        fake.pushReport({ value: 2 });
        await waitFor(() => asyncResults.length === 2, "the second report to reach onAsyncResult");

        expect(asyncResults).deep.equal([{ value: 1 }, { value: 2 }]);
    });

    it("re-arms after the command queue drains", async () => {
        const chipTool = await start();

        chipTool.armReports();
        await waitFor(() => fake.armings.length === 1, "the first arming frame");

        await Promise.all([
            chipTool.execute("any read-by-id 0x6 0x0 1 1"),
            chipTool.execute("any read-by-id 0x6 0x0 1 2"),
        ]);

        await waitFor(() => fake.armings.length === 2, "the client to re-arm after the queue drained");

        expect(fake.armings).deep.equal(["", ""]);
        expect(fake.violations).deep.equal([]);
        expect(fake.pushReport({ value: 1 })).equal("sent");
        await waitFor(() => asyncResults.length === 1, "the report to reach onAsyncResult");
    });

    it("discards a report pushed while no frame is armed", async () => {
        const chipTool = await start();

        expect(fake.pushReport({ value: 1 })).equal("dropped");
        await chipTool.execute("any read-by-id 0x6 0x0 1 1");

        expect(fake.droppedReports).equal(1);
        expect(asyncResults).deep.equal([]);
    });

    it("connects once a delayed readiness line appears", async () => {
        const chipTool = await start(SLOW_READY_BODY);

        expect(logs).to.include(CHIP_TOOL_READY_MESSAGE);

        const result = await chipTool.execute("any read-by-id 0x6 0x0 1 1");
        expect(result.results).deep.equal([]);
    });

    it("carries the child's own last output into a startup failure", async () => {
        // A failed start() leaves the cert run with no recorder, so this message is the only place the
        // child's account of itself survives
        const chipTool = await create('echo "chip-tool: error while loading shared libraries" >&2\nexit 127\n');

        await expect(chipTool.start()).rejectedWith(/error while loading shared libraries/);
    });

    it("says a silent exit wrote nothing, rather than reporting a bare code", async () => {
        const chipTool = await create("exit 127\n");

        await expect(chipTool.start()).rejectedWith(/without writing any output/);
    });

    it("does not connect before the readiness line, even to a listening port", async () => {
        const chipTool = await create(NEVER_READY_BODY, Millis(300));

        await expect(chipTool.start()).rejectedWith(CHIP_TOOL_READY_MESSAGE);

        expect(fake.openedSockets).equal(0);
    });

    it("bounds a WebSocket handshake that never completes, so the retry loop advances", async () => {
        const stalled = await startStalledServer();
        try {
            const chipTool = await create(READY_BODY, Seconds(10), { port: stalled.port, connectTimeout: Millis(150) });

            // Settled rather than awaited: the assertions below run while start() is still retrying,
            // and an orphaned rejection would report itself instead of the assertion that failed
            const settled = chipTool.start().then(
                () => undefined,
                (cause: unknown) => cause,
            );

            await waitFor(
                () => logs.some(line => line.includes("did not complete the WebSocket handshake")),
                "the stalled handshake to be reported",
            );

            // The stand-in outlives the retry loop on its own, so ending it is what makes this assert
            // that the loop advanced rather than that it ran out of attempts
            await waitFor(() => existsSync(pidFile), "the stand-in binary to record its pid");
            process.kill(await pidOf(pidFile), "SIGKILL");

            expect(await settled).instanceOf(ChipToolExitError);
        } finally {
            await stalled.close();
        }
    });

    it("says the result slot is held when a command chip-tool never answers is abandoned", async () => {
        const chipTool = await start();

        chipTool.armReports();
        await waitFor(() => fake.armings.length === 1, "the first arming frame");

        fake.reply = () => ({ hang: true });
        await expect(chipTool.execute("any read-by-id 0x6 0x0 1 1", Millis(150))).rejectedWith(TimeoutError);

        const wedged = () => logs.filter(line => line.includes("still owns chip-tool's result slot"));
        expect(wedged().length).equal(1);
        expect(wedged()[0]).contains("any read-by-id 0x6 0x0 1 1");

        // What that line reports: no later command is dispatched and no report frame is parked again,
        // so every later timeout is the controller's state rather than the device's
        await expect(chipTool.execute("any read-by-id 0x6 0x0 1 2", Millis(150))).rejectedWith(TimeoutError);
        expect(fake.commands).deep.equal(["any read-by-id 0x6 0x0 1 1"]);
        expect(fake.armings.length).equal(1);
        expect(wedged().length).equal(1);
    });

    it("rejects pending and future commands when the process exits", async () => {
        const chipTool = await start(DYING_BODY);

        fake.reply = () => ({ hang: true });

        await expect(chipTool.execute("any read-by-id 0x6 0x0 1 1")).rejectedWith(/exit(ed)? .*7/);
        await expect(chipTool.execute("any read-by-id 0x6 0x0 1 2")).rejectedWith(/exit(ed)? .*7/);
    });

    it("closes cleanly after a failed start", async () => {
        const chipTool = await create(NEVER_READY_BODY, Millis(300));
        client = undefined; // close() below is this test's assertion, not afterEach's cleanup

        chipTool.armReports();

        await expect(chipTool.start()).rejectedWith(CHIP_TOOL_READY_MESSAGE);

        await waitFor(() => existsSync(pidFile), "the stand-in binary to record its pid");
        expect(await isRunning(pidFile)).equal(true);

        await chipTool.close();
        await chipTool.close();

        expect(fake.frames).deep.equal([]);
        expect(await isRunning(pidFile)).equal(false);
        await expect(chipTool.execute("any read-by-id 0x6 0x0 1 1")).rejected;
    });

    it("closes the socket on close()", async () => {
        const chipTool = await start();

        await chipTool.execute("any read-by-id 0x6 0x0 1 1");
        await chipTool.close();
        client = undefined;

        await waitFor(() => fake.closedSockets === 1, "the server to see the socket close");
    });

    it("refuses a command frame chip-tool would read as an async-report arming frame", async () => {
        const chipTool = await start();

        // A short timeout so a client that sent these anyway fails on the error class, not on the
        // suite's clock: chip-tool answers an arming frame only when a report arrives
        await expect(chipTool.execute("", Millis(200))).rejectedWith(ImplementationError);
        await expect(chipTool.execute("42", Millis(200))).rejectedWith(ImplementationError);
        expect(fake.frames).deep.equal([]);
    });

    it("preserves a uint64 result beyond the safe integer range", async () => {
        const chipTool = await start();

        fake.reply = () => ({ hang: true });
        const pending = chipTool.execute("any read-by-id 0x33 0x2 1 0");

        await waitFor(() => fake.commands.length === 1, "the command to reach the server");
        fake.sendRaw('{"results":[{"clusterId":51,"attributeId":2,"value":18446744073709551000}],"logs":[]}');

        const result = await pending;
        const [entry] = result.results;
        if (typeof entry !== "object" || entry === null || !("value" in entry)) {
            throw new InternalError("Expected a result entry carrying a value");
        }
        expect(entry.value).equal(18446744073709551000n);
    });

    it("settles a command queued behind one chip-tool never answers", async () => {
        const chipTool = await start();

        fake.reply = () => ({ hang: true });

        const outcomes = await Promise.allSettled([
            chipTool.execute("any read-by-id 0x6 0x0 1 1", Millis(200)),
            chipTool.execute("any read-by-id 0x6 0x0 1 2", Millis(200)),
        ]);

        expect(outcomes.map(outcome => outcome.status)).deep.equal(["rejected", "rejected"]);
        for (const outcome of outcomes) {
            expect(outcome.status === "rejected" && outcome.reason).instanceOf(TimeoutError);
        }
        expect(fake.commands).deep.equal(["any read-by-id 0x6 0x0 1 1"]);
    });

    it("resumes once the reply to an abandoned command finally arrives", async () => {
        const chipTool = await start();

        fake.reply = () => ({ results: [{ value: 1 }], delayMs: 300 });
        await expect(chipTool.execute("any read-by-id 0x6 0x0 1 1", Millis(100))).rejectedWith(TimeoutError);

        // The late reply belongs to a caller that gave up, so it goes where every unowned entry goes
        await waitFor(() => asyncResults.length === 1, "the late reply to be forwarded");
        expect(asyncResults).deep.equal([{ value: 1 }]);

        // The wedge the abandonment reported is over, and the evidence has to say so or every earlier
        // reader of it keeps blaming the controller for what follows
        expect(logs.filter(line => line.includes("chip-tool answered the abandoned command")).length).equal(1);

        fake.reply = () => ({ results: [{ value: 2 }] });
        const next = await chipTool.execute("any read-by-id 0x6 0x0 1 2");
        expect(next.results).deep.equal([{ value: 2 }]);
    });

    it("rejects the command in flight when its reply cannot be parsed, and keeps serving", async () => {
        const chipTool = await start();

        fake.reply = () => ({ hang: true });
        const pending = chipTool.execute("any read-by-id 0x6 0x0 1 1");

        await waitFor(() => fake.commands.length === 1, "the command to reach the server");
        fake.sendRaw("not a frame at all");

        await expect(pending).rejectedWith(UnexpectedDataError);

        fake.reply = () => ({ results: [{ value: 7 }] });
        const next = await chipTool.execute("any read-by-id 0x6 0x0 1 2");
        expect(next.results).deep.equal([{ value: 7 }]);
    });
});

describe("resolveChipToolBinary", () => {
    const originalAppDir = env.MATTER_CERT_APP_DIR;
    const originalSource = env.MATTER_CHIP_BINS_SOURCE;

    afterEach(() => {
        if (originalAppDir === undefined) {
            delete env.MATTER_CERT_APP_DIR;
        } else {
            env.MATTER_CERT_APP_DIR = originalAppDir;
        }
        if (originalSource === undefined) {
            delete env.MATTER_CHIP_BINS_SOURCE;
        } else {
            env.MATTER_CHIP_BINS_SOURCE = originalSource;
        }
    });

    it("names MATTER_CERT_APP_DIR when it is unset", async () => {
        delete env.MATTER_CHIP_BINS_SOURCE;
        delete env.MATTER_CERT_APP_DIR;

        await expect(resolveChipToolBinary()).rejectedWith("MATTER_CERT_APP_DIR");
    });

    it("resolves chip-tool from MATTER_CERT_APP_DIR", async () => {
        delete env.MATTER_CHIP_BINS_SOURCE;
        env.MATTER_CERT_APP_DIR = "/somewhere/apps";

        expect(await resolveChipToolBinary()).equal(join("/somewhere/apps", "chip-tool"));
    });

    it("explains an unsupported host rather than letting spawn fail", () => {
        expect(() => assertChipToolHostSupported("linux", "arm64")).not.to.throw();
        expect(() => assertChipToolHostSupported("darwin", "arm64")).to.throw(/darwin/);
        // The extraction is arm64-only, so an x64 Linux host cannot exec what it unpacks either
        expect(() => assertChipToolHostSupported("linux", "x64")).to.throw(/linux\/x64/);
    });
});
