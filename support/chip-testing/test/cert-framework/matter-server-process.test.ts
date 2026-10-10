/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, Millis, Seconds } from "@matter/general";
import { CertConfigError } from "@matter/testing";
import { expect } from "chai";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DISABLE_AUTO_SUBSCRIPTION_FLAG, MatterServerProcess } from "../../src/matter-server/matter-server-process.js";
import { waitFor } from "./fake-chip-tool.js";

const ENTRY = fileURLToPath(new URL("./fixtures/fake-server-entry.mjs", import.meta.url));
const CJS_ENTRY = fileURLToPath(new URL("./fixtures/fake-server-entry.cjs", import.meta.url));
interface Report {
    pid: number;
    storagePath: string;
}

const ARGS_PREFIX = "fake-server args: ";

function withFlag(flag: string) {
    return `${process.execPath} ${ENTRY} ${flag}`;
}

async function argsFromLog(server: MatterServerProcess): Promise<string[]> {
    const find = () => server.log.lines.find(({ text }) => text.startsWith(ARGS_PREFIX));
    await waitFor(() => find() !== undefined, "args line in log");
    const line = find();
    expect(line).not.undefined;
    return JSON.parse((line?.text ?? "").slice(ARGS_PREFIX.length));
}

function storageOf(args: string[]) {
    return args[args.indexOf("--storage-path") + 1];
}

function isAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function rejectionOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    expect.fail("expected a rejection");
}

describe("MatterServerProcess", () => {
    let server: MatterServerProcess | undefined;
    let reportDir: string;
    let reportFile: string;

    beforeEach(async () => {
        reportDir = await mkdtemp(join(tmpdir(), "fake-server-report-"));
        reportFile = join(reportDir, "report.json");
        process.env.FAKE_SERVER_REPORT = reportFile;
    });

    afterEach(async () => {
        delete process.env.FAKE_SERVER_REPORT;
        await server?.close();
        server = undefined;
        await rm(reportDir, { recursive: true, force: true });
    });

    async function readReport(): Promise<Report> {
        await waitFor(() => existsSync(reportFile), "fixture report");
        const parsed: Report = JSON.parse(await readFile(reportFile, "utf8"));
        return parsed;
    }

    async function expectCleanedUp(report: Report) {
        expect(isAlive(report.pid), "child still alive").false;
        expect(existsSync(report.storagePath), "storage still present").false;
    }

    it("starts, connects and exposes stdout as log", async () => {
        server = await MatterServerProcess.start({ entry: ENTRY, role: "dut-controller", primaryInterface: "en9" });

        expect(server.client.serverInfo.sdk_version).equals("fake-server-entry");
        await waitFor(() => !!server?.log.lines.some(({ text }) => text === "fake-server listening"), "listening line");

        const args = await argsFromLog(server);
        expect(args).includes(DISABLE_AUTO_SUBSCRIPTION_FLAG);
        expect(args).includes("--enable-test-net-dcl");
        expect(args[args.indexOf("--log-level") + 1]).equals("debug");
        expect(args[args.indexOf("--primary-interface") + 1]).equals("en9");
        expect(existsSync(storageOf(args))).true;
    });

    it("runs a command line that ends in a script path as a command line", async () => {
        server = await MatterServerProcess.start({ entry: `${process.execPath} ${ENTRY}`, role: "dut" });

        expect(server.client.serverInfo.sdk_version).equals("fake-server-entry");
    });

    it("runs a .cjs file with the current Node", async () => {
        server = await MatterServerProcess.start({ entry: CJS_ENTRY, role: "dut" });

        expect(server.client.serverInfo.sdk_version).equals("fake-server-entry");
    });

    it("rejects an empty entry", async () => {
        expect(await rejectionOf(MatterServerProcess.start({ entry: "  ", role: "dut" }))).instanceOf(CertConfigError);
    });

    it("omits --primary-interface when none is given", async () => {
        server = await MatterServerProcess.start({ entry: ENTRY, role: "dut-controller" });

        expect(await argsFromLog(server)).not.includes("--primary-interface");
    });

    it("rejects with the last log lines when the child exits early", async () => {
        const error = await rejectionOf(MatterServerProcess.start({ entry: withFlag("--exit-early"), role: "dut" }));

        expect(error).instanceOf(CertConfigError);
        const message = error instanceof Error ? error.message : "";
        expect(message).contains("exit code 3");
        expect(message).contains("fake-server failing on purpose");
        expect(message).contains(ARGS_PREFIX);
    });

    it("kills the child and removes storage on close", async () => {
        server = await MatterServerProcess.start({ entry: ENTRY, role: "dut" });
        const storage = storageOf(await argsFromLog(server));
        expect(existsSync(storage)).true;

        const started = Date.now();
        await server.close();
        await server.close();
        // The child honors SIGTERM; waiting for the SIGKILL fallback would mean close never signalled it
        expect(Date.now() - started).lessThan(3_000);

        expect(existsSync(storage)).false;
        server = undefined;
    });

    it("shares one shutdown between repeated close calls", async () => {
        server = await MatterServerProcess.start({ entry: ENTRY, role: "dut" });
        const clientClose = server.client.close.bind(server.client);
        let clientCloses = 0;
        server.client.close = () => {
            clientCloses++;
            return clientClose();
        };

        const first = server.close();
        const second = server.close();
        expect(second).equals(first);
        await first;
        await server.close();

        expect(clientCloses).equals(1);
        server = undefined;
    });

    it("closes the websocket client when it closes", async () => {
        server = await MatterServerProcess.start({ entry: ENTRY, role: "dut" });
        const { client } = server;
        const clientClose = client.close.bind(client);
        let clientCloses = 0;
        client.close = () => {
            clientCloses++;
            return clientClose();
        };

        await server.close();

        expect(clientCloses).equals(1);
        expect(await rejectionOf(client.command("ping"))).instanceOf(ClosedError);
        server = undefined;
    });

    it("kills a child that ignores SIGTERM once the exit grace has passed", async () => {
        server = await MatterServerProcess.start({
            entry: withFlag("--ignore-sigterm"),
            role: "dut",
            exitGrace: Millis(300),
        });
        const report = await readReport();

        const started = Date.now();
        await server.close();
        const elapsed = Date.now() - started;
        server = undefined;

        // Killed by the fallback: not before the grace elapsed, and well before any default grace
        expect(elapsed).greaterThanOrEqual(250);
        expect(elapsed).lessThan(3_000);
        await expectCleanedUp(report);
    });

    it("removes storage after a failed start", async () => {
        await rejectionOf(MatterServerProcess.start({ entry: withFlag("--exit-early"), role: "dut" }));

        const report = await readReport();
        expect(existsSync(report.storagePath)).false;
    });

    it("rejects when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();

        const error = await rejectionOf(
            MatterServerProcess.start({ entry: withFlag("--never-listen"), role: "dut", signal: controller.signal }),
        );

        expect(error).instanceOf(ClosedError);
    });

    it("stops the child and removes storage when aborted while waiting for readiness", async () => {
        const controller = new AbortController();
        const starting = MatterServerProcess.start({
            entry: withFlag("--never-listen"),
            role: "dut",
            signal: controller.signal,
        });
        const outcome = rejectionOf(starting);

        const report = await readReport();
        controller.abort();

        expect(await outcome).instanceOf(ClosedError);
        await expectCleanedUp(report);
    });

    it("stops the child and removes storage when readiness times out", async () => {
        const error = await rejectionOf(
            MatterServerProcess.start({
                entry: withFlag("--never-listen"),
                role: "dut",
                readinessTimeout: Seconds(1),
            }),
        );

        expect(error).instanceOf(CertConfigError);
        const message = error instanceof Error ? error.message : "";
        expect(message).contains("did not become ready within");
        expect(message).contains("fake-server not listening");
        await expectCleanedUp(await readReport());
    });
});
