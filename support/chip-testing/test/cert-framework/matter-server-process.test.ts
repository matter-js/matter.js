/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, Millis, Seconds } from "@matter/general";
import { CertConfigError } from "@matter/testing";
import { expect } from "chai";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    type CertContextFile,
    certContextLoadedOf,
    certContextRefusalOf,
} from "../../src/matter-server/matter-server-cert-context.js";
import {
    DISABLE_AUTO_SUBSCRIPTION_FLAG,
    MatterServerProcess,
    type MatterServerProcessOptions,
    plainLogLine,
    readinessPortOf,
} from "../../src/matter-server/matter-server-process.js";
import {
    REVOCATION_SET_FILE,
    REVOCATION_SETS_DIR_FLAG,
    revocationSetRefusalOf,
    revocationSetsLoadedOf,
} from "../../src/matter-server/matter-server-revocation.js";
import { waitFor } from "./fake-chip-tool.js";

const ENTRY = fileURLToPath(new URL("./fixtures/fake-server-entry.mjs", import.meta.url));
const CJS_ENTRY = fileURLToPath(new URL("./fixtures/fake-server-entry.cjs", import.meta.url));
const EXIT_OWNER = fileURLToPath(new URL("./fixtures/exit-owner.mjs", import.meta.url));
const PROCESS_MODULE = new URL("../../src/matter-server/matter-server-process.js", import.meta.url).href;
interface Report {
    pid: number;
    storagePath: string;
    environment: string[];
    certContext?: unknown;
    revocationSets?: { dir: string; files: Record<string, string> };
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
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

const CONTEXT: CertContextFile = {
    keySets: [
        {
            groupKeySetId: 1,
            epochKey0: "d0d1d2d3d4d5d6d7d8d9dadbdcdddedf",
            epochStartTime0: 1_600_000_000_000_000,
            groupKeySecurityPolicy: "TrustFirst",
        },
    ],
    groupKeyMap: [{ groupId: 1, groupKeySetId: 1 }],
};

describe("MatterServerProcess", () => {
    let server: MatterServerProcess | undefined;
    let reportDir: string;
    let reportFile: string;
    let abandon: AbortController;
    let starts: Promise<MatterServerProcess>[];

    /** A start the test leaves behind, on its own timeout among others, is aborted in afterEach and its child stopped. */
    function start(options: MatterServerProcessOptions) {
        const starting = MatterServerProcess.start({
            signal: abandon.signal,
            env: { FAKE_SERVER_REPORT: reportFile },
            ...options,
        });
        starts.push(starting);
        return starting;
    }

    beforeEach(async () => {
        abandon = new AbortController();
        starts = [];
        reportDir = await mkdtemp(join(tmpdir(), "fake-server-report-"));
        reportFile = join(reportDir, "report.json");
    });

    afterEach(async () => {
        abandon.abort();
        // Each test checks the outcome of its own starts; closing is idempotent
        for (const outcome of await Promise.allSettled(starts)) {
            if (outcome.status === "fulfilled") {
                await outcome.value.close();
            }
        }
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
        server = await start({ entry: ENTRY, role: "dut-controller", primaryInterface: "en9" });

        expect(server.client.serverInfo.sdk_version).equals("fake-server-entry");
        await waitFor(
            () => !!server?.log.lines.some(({ text }) => text.includes("Webserver listening on")),
            "readiness line",
        );

        const args = await argsFromLog(server);
        expect(args).includes(DISABLE_AUTO_SUBSCRIPTION_FLAG);
        expect(args).includes("--enable-test-net-dcl");
        expect(args).includes("--dcl-offline");
        expect(args[args.indexOf("--log-level") + 1]).equals("debug");
        expect(args[args.indexOf("--primary-interface") + 1]).equals("en9");
        expect(args[args.indexOf("--port") + 1]).equals("0");
        expect(args[args.indexOf("--listen-address") + 1]).equals("127.0.0.1");
        expect(existsSync(storageOf(args))).true;
    });

    it("passes the server only the variables it needs of this process's environment", async () => {
        const previous = process.env.LISTEN_ADDRESS;
        process.env.LISTEN_ADDRESS = "0.0.0.0";
        try {
            server = await start({ entry: ENTRY, role: "dut" });
        } finally {
            if (previous === undefined) {
                delete process.env.LISTEN_ADDRESS;
            } else {
                process.env.LISTEN_ADDRESS = previous;
            }
        }

        const { environment } = await readReport();
        expect(environment).not.includes("LISTEN_ADDRESS");
        expect(environment).includes("PATH");
        expect(environment).includes("FAKE_SERVER_REPORT");
    });

    it("runs a command line that ends in a script path as a command line", async () => {
        server = await start({ entry: `${process.execPath} ${ENTRY}`, role: "dut" });

        expect(server.client.serverInfo.sdk_version).equals("fake-server-entry");
    });

    it("runs a .cjs file with the current Node", async () => {
        server = await start({ entry: CJS_ENTRY, role: "dut" });

        expect(server.client.serverInfo.sdk_version).equals("fake-server-entry");
    });

    it("rejects an empty entry", async () => {
        expect(await rejectionOf(start({ entry: "  ", role: "dut" }))).instanceOf(CertConfigError);
    });

    it("omits --primary-interface when none is given", async () => {
        server = await start({ entry: ENTRY, role: "dut-controller" });

        expect(await argsFromLog(server)).not.includes("--primary-interface");
    });

    it("rejects with the last log lines when the child exits early", async () => {
        const error = await rejectionOf(start({ entry: withFlag("--exit-early"), role: "dut" }));

        expect(error).instanceOf(CertConfigError);
        const message = error instanceof Error ? error.message : "";
        expect(message).contains("exit code 3");
        expect(message).contains("fake-server failing on purpose");
        expect(message).contains(ARGS_PREFIX);
    });

    it("kills the child and removes storage on close", async () => {
        server = await start({ entry: ENTRY, role: "dut" });
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
        server = await start({ entry: ENTRY, role: "dut" });
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
        server = await start({ entry: ENTRY, role: "dut" });
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
        server = await start({
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
        await rejectionOf(start({ entry: withFlag("--exit-early"), role: "dut" }));

        const report = await readReport();
        expect(existsSync(report.storagePath)).false;
    });

    it("rejects when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();

        const error = await rejectionOf(
            start({ entry: withFlag("--never-listen"), role: "dut", signal: controller.signal }),
        );

        expect(error).instanceOf(ClosedError);
    });

    it("rejects with ClosedError before creating storage when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const tmp = process.env.TMPDIR;
        process.env.TMPDIR = join(reportDir, "missing");
        try {
            const error = await rejectionOf(start({ entry: ENTRY, role: "dut", signal: controller.signal }));
            expect(error).instanceOf(ClosedError);
        } finally {
            if (tmp === undefined) {
                delete process.env.TMPDIR;
            } else {
                process.env.TMPDIR = tmp;
            }
        }
    });

    it("stops the child and removes storage when aborted while waiting for readiness", async () => {
        const controller = new AbortController();
        const starting = start({
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
            start({
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

    it("kills its child when the owning process exits without closing it", async () => {
        const owner = spawn(process.execPath, [EXIT_OWNER, PROCESS_MODULE, ENTRY], {
            stdio: "ignore",
            env: { ...process.env, FAKE_SERVER_REPORT: reportFile },
        });
        const code = await new Promise<number | null>(resolve => owner.once("exit", resolve));
        const { pid, storagePath } = await readReport();
        try {
            expect(code).equals(0);
            await waitFor(() => !isAlive(pid), "child killed");
        } finally {
            if (isAlive(pid)) {
                process.kill(pid, "SIGKILL");
            }
            await rm(storagePath, { recursive: true, force: true });
        }
    });

    it("holds one exit listener while children live and none once they ended", async () => {
        const listeners = process.listenerCount("exit");
        server = await start({ entry: ENTRY, role: "dut" });
        const second = await start({ entry: ENTRY, role: "dut" });
        expect(process.listenerCount("exit")).equals(listeners + 1);

        await second.close();
        expect(process.listenerCount("exit")).equals(listeners + 1);
        await server.close();
        server = undefined;
        expect(process.listenerCount("exit")).equals(listeners);
    });

    describe("with a cert-context.json", () => {
        it("writes the file into the server's storage before it starts and waits for the server to load it", async () => {
            server = await start({ entry: ENTRY, role: "dut", certContext: CONTEXT });

            const report = await readReport();
            expect(report.certContext).deep.equals(CONTEXT);
            expect(
                server.log.lines.some(({ text }) => text.includes("Loaded group key configuration")),
                "the loaded line is in the log",
            ).true;
        });

        it("writes no file where none is given", async () => {
            server = await start({ entry: ENTRY, role: "dut" });

            expect((await readReport()).certContext).undefined;
        });

        it("fails with the server's own reason where the server refuses the file", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--cert-context-refuse"), role: "dut", certContext: CONTEXT }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).match(
                /^matterjs-server refused its cert-context\.json: Invalid group key configuration \S+cert-context\.json: keySets\[0\]\.groupKeySetId must not be 0/,
            );
        });

        it("fails at the refusal line, before a server that refused the file has exited", async () => {
            const started = Date.now();
            const error = await rejectionOf(
                start({
                    entry: withFlag("--cert-context-refuse --cert-context-slow-exit"),
                    role: "dut",
                    certContext: CONTEXT,
                }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains("refused its cert-context.json: Invalid group key configuration");
            expect(Date.now() - started, "failed without waiting for the exit").lessThan(10_000);
        });

        it("fails at a refusal to install the file the server already said it loaded", async () => {
            const started = Date.now();
            const error = await rejectionOf(
                start({ entry: withFlag("--cert-context-install-fail"), role: "dut", certContext: CONTEXT }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains(
                "refused its cert-context.json: Cannot install group key configuration: storage closed",
            );
            expect(Date.now() - started, "failed without waiting out the readiness timeout").lessThan(10_000);
        });

        it("fails where the server loaded other counts than it was given", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--cert-context-miscount"), role: "dut", certContext: CONTEXT }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error))
                .contains("loaded 2 key sets and 1 groups")
                .contains("wrote 1 key sets and 1 groups");
        });

        it("fails where the server loaded the key sets it was given but another number of groups", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--cert-context-group-miscount"), role: "dut", certContext: CONTEXT }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error))
                .contains("loaded 1 key sets and 2 groups")
                .contains("wrote 1 key sets and 1 groups");
        });

        it("fails where the server loaded the file from another path", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--cert-context-other-path"), role: "dut", certContext: CONTEXT }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).match(/loaded 1 key sets and 1 groups from \/elsewhere\/cert-context\.json/);
        });

        it("fails at the readiness line where the server becomes ready without saying it loaded the file", async () => {
            const started = Date.now();
            const error = await rejectionOf(
                start({ entry: withFlag("--cert-context-ignore"), role: "dut", certContext: CONTEXT }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains("became ready without logging that it loaded");
            expect(Date.now() - started, "failed without waiting out the readiness timeout").lessThan(10_000);
        });
    });

    describe("with a revocation set", () => {
        const REVOCATION_SET = JSON.stringify([
            {
                type: "revocation_set",
                issuer_subject_key_id: "63540E47F64B1C38D13884A462D16C195D8FFB3C",
                revoked_serial_numbers: ["19367D978EAC533A"],
            },
            {
                type: "revocation_set",
                issuer_subject_key_id: "A0B1C2D3E4F5061728394A5B6C7D8E9FA0B1C2D3",
                revoked_serial_numbers: ["0102", "0304"],
            },
        ]);

        it("writes the set into a directory of the server's storage, names it to the server and waits for the load", async () => {
            server = await start({ entry: ENTRY, role: "dut", revocationSet: REVOCATION_SET });

            const args = await argsFromLog(server);
            const dir = args[args.indexOf(REVOCATION_SETS_DIR_FLAG) + 1];
            expect(dir.startsWith(storageOf(args)), "the directory is in the server's storage").true;
            expect((await readReport()).revocationSets).deep.equals({
                dir,
                files: { [REVOCATION_SET_FILE]: REVOCATION_SET },
            });
            expect(
                server.log.lines.some(({ text }) =>
                    text.includes(`Loaded revocation sets from ${dir}: 1 files, 2 entries`),
                ),
                "the loaded line is in the log",
            ).true;
        });

        it("names no directory where no set is given", async () => {
            server = await start({ entry: ENTRY, role: "dut" });

            expect(await argsFromLog(server)).not.includes(REVOCATION_SETS_DIR_FLAG);
            expect((await readReport()).revocationSets).undefined;
        });

        it("fails at the line the server refuses the file with", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--revocation-refuse"), role: "dut", revocationSet: REVOCATION_SET }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).match(
                /^matterjs-server refused its revocation-set\.json: .*ERROR MatterServer\.RevocationSets Skipped revocation set revocation-set\.json: /,
            );
        });

        it("fails at the line the server refuses the directory with", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--revocation-unreadable-dir"), role: "dut", revocationSet: REVOCATION_SET }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains("Cannot read revocation sets directory");
        });

        it("waits for both files where it was given a cert-context.json too", async () => {
            server = await start({ entry: ENTRY, role: "dut", certContext: CONTEXT, revocationSet: REVOCATION_SET });

            const report = await readReport();
            expect(report.certContext).deep.equals(CONTEXT);
            expect(report.revocationSets?.files).deep.equals({ [REVOCATION_SET_FILE]: REVOCATION_SET });
        });

        it("fails at a refused revocation set where the cert-context.json loaded", async () => {
            const error = await rejectionOf(
                start({
                    entry: withFlag("--revocation-refuse"),
                    role: "dut",
                    certContext: CONTEXT,
                    revocationSet: REVOCATION_SET,
                }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains("refused its revocation-set.json");
        });

        it("fails where the server loaded other counts than it was given", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--revocation-miscount"), role: "dut", revocationSet: REVOCATION_SET }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error))
                .contains("loaded 1 revocation set files with 3 entries")
                .contains("wrote 1 file with 2 entries");
        });

        it("fails where the server loaded another number of files", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--revocation-extra-file"), role: "dut", revocationSet: REVOCATION_SET }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains("loaded 2 revocation set files with 2 entries");
        });

        it("fails where the server loaded the sets from another directory", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--revocation-other-dir"), role: "dut", revocationSet: REVOCATION_SET }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error)).contains("with 2 entries from /elsewhere/revocation-sets");
        });

        it("fails at the readiness line where the server becomes ready without saying it loaded the set", async () => {
            const error = await rejectionOf(
                start({ entry: withFlag("--revocation-ignore"), role: "dut", revocationSet: REVOCATION_SET }),
            );

            expect(error).instanceOf(CertConfigError);
            expect(messageOf(error))
                .contains("became ready without logging that it loaded")
                .contains("its log before the readiness line says why");
        });
    });
});

describe("plainLogLine", () => {
    it("removes the color codes of a server log line", () => {
        expect(plainLogLine("\x1b[0;32mWebserver listening on http://127.0.0.1:51032\x1b[0m")).equals(
            "Webserver listening on http://127.0.0.1:51032",
        );
    });
});

describe("readinessPortOf", () => {
    it("reads the port after the last colon, for an IPv4 and an unbracketed IPv6 host", () => {
        expect(readinessPortOf("2026-10-11 INFO WebServer Webserver listening on http://0.0.0.0:5580")).equals(5580);
        expect(readinessPortOf("Webserver listening on http://::1:54321")).equals(54321);
    });

    it("answers nothing for any other line, a unix socket listener or a port that is no port", () => {
        expect(readinessPortOf("Webserver listening")).undefined;
        expect(readinessPortOf("Webserver listening on unix socket /tmp/matter.sock")).undefined;
        expect(readinessPortOf("Webserver listening on http://127.0.0.1:0")).undefined;
        expect(readinessPortOf("Webserver listening on http://127.0.0.1:70000")).undefined;
        expect(readinessPortOf("Webserver listening on http://127.0.0.1:ws")).undefined;
    });
});

describe("cert-context.json log lines", () => {
    const PATH = "/private/tmp/matter-cert-server-abc/cert-context.json";

    it("reads the path and counts from the server's loaded line", () => {
        expect(
            certContextLoadedOf(
                `2026-10-16 06:46:44.840 NOTICE GroupKeyConfig Loaded group key configuration from ${PATH}: 1 key sets, 2 groups`,
            ),
        ).deep.equals({ path: PATH, keySets: 1, groups: 2 });
        expect(certContextLoadedOf("NOTICE Runtime Shutting down")).undefined;
    });

    it("reads the server's reason from its refusal line", () => {
        for (const reason of [
            `Invalid group key configuration ${PATH}: groupKeyMap[0].groupId duplicates group 1`,
            `Cannot read group key configuration ${PATH}: EACCES`,
            "Cannot install group key configuration: storage closed",
        ]) {
            expect(certContextRefusalOf(`2026-10-16 FATAL MatterServer Server failed to start ${reason}`)).equals(
                reason,
            );
        }
        expect(
            certContextRefusalOf(
                `NOTICE GroupKeyConfig Loaded group key configuration from ${PATH}: 1 key sets, 1 groups`,
            ),
        ).undefined;
    });
});

describe("revocation set log lines", () => {
    const DIR = "/private/tmp/matter-cert-server-abc/revocation-sets";

    it("reads the directory and counts from the server's loaded line", () => {
        expect(
            revocationSetsLoadedOf(
                `2026-10-16 09:12:01.204 NOTICE MatterServer.RevocationSets Loaded revocation sets from ${DIR}: 1 files, 6 entries`,
            ),
        ).deep.equals({ dir: DIR, files: 1, entries: 6 });
        expect(revocationSetsLoadedOf("NOTICE Runtime Shutting down")).undefined;
    });

    const loaded = (counts: string) =>
        revocationSetsLoadedOf(`NOTICE RevocationSets Loaded revocation sets from ${DIR}: ${counts}`);

    it("reads the singular file the server writes for a count of one", () => {
        expect(loaded("1 file, 3 entries")).deep.equals({ dir: DIR, files: 1, entries: 3 });
    });

    it("reads the singular entry the server writes for a count of one", () => {
        expect(loaded("2 files, 1 entry")).deep.equals({ dir: DIR, files: 2, entries: 1 });
    });

    it('takes a line starting with "Revocation sets directory" as a refusal', () => {
        expect(
            revocationSetRefusalOf(
                `2026-10-16 ERROR MatterServer.RevocationSets Revocation sets directory ${DIR} does not exist`,
            ),
        ).not.undefined;
    });

    it("takes an ERROR or FATAL line about a revocation set or its directory as a refusal, and nothing else", () => {
        const error = "2026-10-16 ERROR MatterServer.RevocationSets Skipped revocation set revocation-set.json: bad";
        expect(revocationSetRefusalOf(error)).equals(error);
        expect(revocationSetRefusalOf(error.replace("ERROR", "FATAL"))).not.undefined;
        expect(
            revocationSetRefusalOf(
                `2026-10-16 ERROR MatterServer.RevocationSets Revocation sets directory ${DIR} does not exist, no ` +
                    "revocation sets installed",
            ),
        ).not.undefined;
        expect(revocationSetRefusalOf(error.replace("ERROR", "DEBUG"))).undefined;
        expect(revocationSetRefusalOf("2026-10-16 ERROR MatterServer Server failed to start: storage closed"))
            .undefined;
    });
});
