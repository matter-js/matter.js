/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { ManagedChildProcess } from "@matter/testing";
import { expect } from "chai";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { waitFor } from "./fake-chip-tool.js";

const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

/** Node code run with `-e`. */
function node(
    code: string,
    options: { stopGraceMs?: number; onExit?: () => void; onLine?: (line: string) => void } = {},
) {
    return ManagedChildProcess.spawn(process.execPath, ["-e", code], options);
}

function isAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

const SLEEP = "setInterval(() => {}, 1 << 30)";

describe("ManagedChildProcess", () => {
    const leftovers = new Array<number>();

    afterEach(() => {
        for (const pid of leftovers.splice(0)) {
            if (isAlive(pid)) {
                process.kill(pid, "SIGKILL");
            }
        }
    });

    it("delivers every line, also the last one before the exit, then settles exited", async () => {
        const lines = new Array<string>();
        const child = node('console.log("one"); console.error("two"); process.exit(3)', {
            onLine: line => lines.push(line),
        });

        const exit = await child.exited;
        expect(exit).deep.equal({ code: 3, signal: null, requested: false });
        expect(lines.sort()).deep.equal(["one", "two"]);
    });

    it("stops a child with SIGTERM, also when called again or after it ended", async () => {
        const child = node(SLEEP);
        await child.started();

        const first = child.stop();
        expect(child.stop()).equal(first);
        expect(await first).deep.equal({ code: null, signal: "SIGTERM", requested: true });
        expect(await child.stop()).deep.equal({ code: null, signal: "SIGTERM", requested: true });
    });

    it("kills a child that ignores SIGTERM once the grace period passed", async () => {
        const child = node(`process.on("SIGTERM", () => {}); console.log("ready"); ${SLEEP}`, {
            stopGraceMs: 200,
            onLine: () => {},
        });
        await child.started();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect((await child.stop()).signal).equal("SIGKILL");
    });

    it("kills a child at once", async () => {
        const child = node(SLEEP);
        await child.started();

        child.kill();
        const exit = await child.exited;
        expect(exit.signal).equal("SIGKILL");
        expect(exit.requested).equal(true);
    });

    it("finishes stop() once the child exited, although a process it started holds its output open", async function () {
        this.timeout(10_000);
        const lines = new Array<string>();
        const child = node(
            `const { spawn } = require("node:child_process");
             const grandchild = spawn(process.execPath, ["-e", "${SLEEP}"], { stdio: "inherit" });
             console.log(String(grandchild.pid));
             ${SLEEP}`,
            { onLine: line => lines.push(line) },
        );
        await waitFor(() => lines.length > 0, "the grandchild's pid");
        leftovers.push(Number(lines[0]));

        const started = Date.now();
        await child.stop();
        expect(Date.now() - started).lessThan(4_000);
        expect(isAlive(Number(lines[0]))).equal(true);
    });

    it("reports an exit as not requested when stop() comes after it, while a process it started holds its output open", async function () {
        this.timeout(10_000);
        const lines = new Array<string>();
        const child = node(
            `const { spawn } = require("node:child_process");
             const grandchild = spawn(process.execPath, ["-e", "${SLEEP}"], { stdio: "inherit" });
             console.log(String(grandchild.pid));
             process.exit(3);`,
            { onLine: line => lines.push(line) },
        );
        await waitFor(() => lines.length > 0, "the grandchild's pid");
        leftovers.push(Number(lines[0]));
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(await child.stop()).deep.equal({ code: 3, signal: null, requested: false });
    });

    it("reports a command that cannot be started through started() and exited, not onExit", async () => {
        let exits = 0;
        const child = ManagedChildProcess.spawn("/nonexistent/managed-child-process", [], { onExit: () => exits++ });

        let error: unknown;
        try {
            await child.started();
        } catch (e) {
            error = e;
        }
        expect(error).instanceOf(Error);
        const exit = await child.exited;
        expect(exit.error).equal(error);
        expect(exits).equal(0);
    });

    it("tells onExit once how the process ended, and survives a listener that throws", async () => {
        const exits = new Array<number | null>();
        const child = ManagedChildProcess.spawn(process.execPath, ["-e", "process.exit(4)"], {
            onExit: ({ code }) => {
                exits.push(code);
                throw new InternalError("listener failure");
            },
        });

        await child.exited;
        expect(exits).deep.equal([4]);
    });

    it("holds one listener each for exit, SIGINT and SIGTERM while children live, and none once they ended", async () => {
        const events = ["exit", "SIGINT", "SIGTERM"] as const;
        const before = events.map(event => process.listenerCount(event));
        const first = node(SLEEP);
        const second = node(SLEEP);
        await Promise.all([first.started(), second.started()]);

        expect(events.map(event => process.listenerCount(event))).deep.equal(before.map(count => count + 1));
        await first.stop();
        expect(events.map(event => process.listenerCount(event))).deep.equal(before.map(count => count + 1));
        await second.stop();
        expect(events.map(event => process.listenerCount(event))).deep.equal(before);
    });

    for (const signal of ["SIGTERM", "SIGINT"] as const) {
        // A process started in the background may inherit SIGINT as ignored, so only SIGTERM's end is asserted
        it(`kills its children when the test process gets ${signal}, and lets the test process end`, async () => {
            const owner = spawn(
                process.execPath,
                [
                    "--input-type=module",
                    "-e",
                    `import { InternalError } from "@matter/general";
import { ManagedChildProcess } from "@matter/testing";
                     const child = ManagedChildProcess.spawn(process.execPath, ["-e", "${SLEEP}"]);
                     await child.started();
                     process.stdout.write("ready\\n");`,
                ],
                { cwd: PACKAGE_DIR, stdio: ["ignore", "pipe", "inherit"] },
            );
            const output = new Array<string>();
            owner.stdout.on("data", chunk => output.push(String(chunk)));
            await waitFor(() => output.join("").includes("ready"), "the owner to start its child", 10_000);

            const childPids = await childrenOf(owner.pid ?? 0);
            leftovers.push(...childPids);
            expect(childPids).lengthOf(1);

            const ended = new Promise<NodeJS.Signals | null>(resolve =>
                owner.once("exit", (_code, how) => resolve(how)),
            );
            owner.kill(signal);

            const how = await ended;
            if (signal === "SIGTERM") {
                expect(how).equal(signal);
            }
            await waitFor(() => childPids.every(pid => !isAlive(pid)), "the child to be killed");
        });
    }
});

/** The pids of the direct children of `pid`, from `ps`. */
async function childrenOf(pid: number): Promise<number[]> {
    const ps = spawn("ps", ["-A", "-o", "pid=,ppid="], { stdio: ["ignore", "pipe", "inherit"] });
    const chunks = new Array<string>();
    ps.stdout.on("data", chunk => chunks.push(String(chunk)));
    await new Promise(resolve => ps.once("close", resolve));
    return chunks
        .join("")
        .split("\n")
        .map(line => line.trim().split(/\s+/).map(Number))
        .filter(([, parent]) => parent === pid)
        .map(([child]) => child);
}
