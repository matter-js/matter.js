/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDevice, CertStepContext, CheckRecord, DeviceFlavor, Subject } from "@matter/testing";
import { LineQueue, LogFollower, PicsFile } from "@matter/testing";
import {
    noFurtherSessionCheck,
    recordTcpInvoke,
    recordTcpSession,
    regularSizedRequestCheck,
    wildcardReadInOneReportCheck,
    TcpSessionRef,
} from "../cert/tc-sc-8-support.js";
import { CertCheckFailedError } from "../cert/tc-support.js";

/** GeneralDiagnostics, and its TimeSnapshot command, which TC-SC-8.5 invokes. */
const CLUSTER = 0x33;
const COMMAND = 0x1;
const ENDPOINT = 0;

const SESSION = "@1:86c217a36142d632•c8b8";
const OTHER_SESSION = "@1:86c217a36142d632•9f2c";

function at(millis: number) {
    const iso = new Date(1786711488_000 + millis).toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`;
}

const pairingRequest = (session = SESSION) =>
    `${at(0)} INFO CaseServer •unsecured#${session}(tcp)⇵2c56 Pairing request « tcp://[fe80::1%en0]«60111`;
const newSession = (session = SESSION) =>
    `${at(1)} INFO CaseServer ${session}(tcp) New session with @1:86c217a36142d632 2↔1 address: tcp://[fe80::1%en0]«60111`;

const INVOKE_EXCHANGE = "2c57";

const invokeRequest = (
    session = SESSION,
    path = "0.generalDiagnostics.timeSnapshot",
    flags = "",
    exchange = INVOKE_EXCHANGE,
) => `${at(2)} INFO InteractionServer Invoke « ${session}(tcp)⇵${exchange} ${flags}invokes: ${path}`;
const invokeFinal = (session = SESSION, commands = 1, exchange = INVOKE_EXCHANGE) =>
    `${at(3)} DEBUG InteractionServer Invoke (final) » ${session}(tcp)⇵${exchange} commands: ${commands}`;
const invokeResponse = (session = SESSION, exchange = INVOKE_EXCHANGE) =>
    `${at(4)} DEBUG MessageChannel Message » for: I/InvokeResponse id: ${session}(tcp)⇵${exchange}✉018c0504 type: 0x1/0x9 size: 42`;

/** A device whose log is exactly `lines`, and a recorder that keeps what a helper records. */
async function withDut<T>(
    lines: string[],
    body: (cx: CertStepContext, checks: CheckRecord[]) => Promise<T>,
    flavor: DeviceFlavor = "matterjs",
) {
    const source = new LineQueue();
    const log = new LogFollower(source.follow(), "dut");
    for (const text of lines) {
        source.push(text);
    }
    // The log ends where these lines do, so a pattern that cannot match fails at once rather than
    // waiting out the follower's budget
    source.close();

    const subject = {
        id: "dut",
        app: "all-clusters",
        commissioning: { kind: "on-network", passcode: 20202021, discriminator: 3840, qrPairingCode: "" },
        pics: new PicsFile([]),
        async initialize() {},
        async start() {},
        async stop() {},
        async close() {},
        async snapshot() {
            return {};
        },
        async restore() {},
        async backchannel() {},
    } satisfies Subject;

    const dut: CertDevice = { ...subject, flavor, log, exit: new Promise(() => {}) };

    const checks = new Array<CheckRecord>();
    const cx: CertStepContext = {
        controllers: {},
        devices: { dut },
        recorder: {
            beginStep() {},
            check(record) {
                checks.push(record);
            },
            endStep() {
                return [];
            },
            async flush() {
                return "";
            },
        },
    };

    try {
        return await body(cx, checks);
    } finally {
        await log.close();
    }
}

describe("recordTcpSession", () => {
    it("returns the session tag the DUT's own line names", async () => {
        await withDut([pairingRequest(), newSession()], async (cx, checks) => {
            expect(await recordTcpSession(cx, 0, "runs over TCP")).equal(SESSION);
            expect(checks.map(check => check.verdict)).deep.equal(["pass", "pass"]);
        });
    });

    it("does not pair the pairing request with another connection's session line", async () => {
        const other = `${at(1)} INFO CaseServer @1:86c217a36142d632•9f2c(tcp) New session with @1:86c217a36142d632 2↔1 address: tcp://[fe80::2%en0]«60999`;

        await withDut([pairingRequest(), other], async (cx, checks) => {
            await expect(recordTcpSession(cx, 0, "runs over TCP")).rejectedWith(CertCheckFailedError);
            expect(checks.map(check => check.verdict)).deep.equal(["pass", "fail"]);
        });
    });

    it("records a failing check, rather than only throwing, for a session line naming no session", async () => {
        const anonymous = `${at(1)} INFO CaseServer (tcp) New session with a peer 2↔1 address: tcp://[fe80::1%en0]«60111`;

        await withDut([pairingRequest(), anonymous], async (cx, checks) => {
            await expect(recordTcpSession(cx, 0, "runs over TCP")).rejectedWith(CertCheckFailedError);
            expect(checks.map(check => check.verdict)).deep.equal(["pass", "pass", "fail"]);
        });
    });
});

describe("recordTcpInvoke", () => {
    async function invoke(lines: string[], session = SESSION) {
        return withDut(lines, async (cx, checks) => {
            try {
                await recordTcpInvoke(cx, session, ENDPOINT, CLUSTER, COMMAND, 0, "invoked over TCP");
            } catch (e) {
                // A failing check is what several of these cases assert; anything else is a real error
                if (!(e instanceof CertCheckFailedError)) {
                    throw e;
                }
            }
            return checks;
        });
    }

    it("passes for an invoke dispatched and answered on the session", async () => {
        const checks = await invoke([invokeRequest(), invokeFinal(), invokeResponse()]);

        expect(checks).length(1);
        expect(checks[0].verdict).equal("pass");
    });

    it("passes for a timed invoke, whose flags matter.js writes before the path", async () => {
        const checks = await invoke([
            invokeRequest(SESSION, "0.generalDiagnostics.timeSnapshot", "timedRequest "),
            invokeFinal(),
            invokeResponse(),
        ]);

        expect(checks[0].verdict).equal("pass");
    });

    it("fails for the same command on another session", async () => {
        const checks = await invoke([
            invokeRequest(OTHER_SESSION),
            invokeFinal(OTHER_SESSION),
            invokeResponse(OTHER_SESSION),
        ]);

        expect(checks[0].verdict).equal("fail");
    });

    it("fails for another command on the session", async () => {
        const checks = await invoke([
            invokeRequest(SESSION, "0.generalDiagnostics.testEventTrigger"),
            invokeFinal(),
            invokeResponse(),
        ]);

        expect(checks[0].verdict).equal("fail");
    });

    it("fails for the same command on another endpoint", async () => {
        const checks = await invoke([
            invokeRequest(SESSION, "1.generalDiagnostics.timeSnapshot"),
            invokeFinal(),
            invokeResponse(),
        ]);

        expect(checks[0].verdict).equal("fail");
    });

    it("does not take a response carrying more commands than the one invoked", async () => {
        const checks = await invoke([invokeRequest(), invokeFinal(SESSION, 12), invokeResponse()]);

        expect(checks[0].verdict).equal("fail");
    });

    it("does not take another exchange's answer for this invoke's", async () => {
        const checks = await invoke([
            invokeRequest(),
            invokeFinal(SESSION, 1, "2c58"),
            invokeResponse(SESSION, "2c58"),
        ]);

        expect(checks[0].verdict).equal("fail");
    });

    it("fails when the DUT never answered the invoke", async () => {
        const checks = await invoke([invokeRequest()]);

        expect(checks[0].verdict).equal("fail");
    });
});

describe("wildcardReadInOneReportCheck", () => {
    const EXCHANGE = "9200";

    const wildcardRead = (session = SESSION, exchange = EXCHANGE, paths = "*.*.*") =>
        `${at(5)} DEBUG InteractionServer Read « ${session}(tcp)⇵${exchange} fabricFiltered attributes: ${paths} events: none`;
    const reportData = (bytes: number, session = SESSION, exchange = EXCHANGE) =>
        `${at(6)} DEBUG MessageChannel Message » for: I/ReportData suppressResponse attr: 838 id: ${session}(tcp)⇵${exchange}✉08e2433e type: 0x1/0x5 size: ${bytes} payload: 1536`;

    async function report(lines: string[]) {
        return withDut(lines, async cx => [await wildcardReadInOneReportCheck(cx, SESSION, 0)]);
    }

    it("passes for one report larger than an MRP message may be", async () => {
        const checks = await report([wildcardRead(), reportData(27432)]);

        expect(checks[0].verdict).equal("pass");
        expect(checks[0].detail).contains("27432");
    });

    it("fails for a report an MRP session could have carried", async () => {
        const checks = await report([wildcardRead(), reportData(1280)]);

        expect(checks[0].verdict).equal("fail");
    });

    it("fails when the device chunked the report", async () => {
        const checks = await report([wildcardRead(), reportData(20000), reportData(7432)]);

        expect(checks[0].verdict).equal("fail");
        expect(checks[0].detail).contains("2 ReportData");
    });

    it("does not take a report sent on another exchange", async () => {
        const checks = await report([wildcardRead(), reportData(27432, SESSION, "9201")]);

        expect(checks[0].verdict).equal("fail");
    });

    it("does not take a report of the same exchange on another session", async () => {
        const checks = await report([wildcardRead(), reportData(27432, OTHER_SESSION)]);

        expect(checks[0].verdict).equal("fail");
    });

    it("fails a report line that states no size", async () => {
        const sizeless = `${at(6)} DEBUG MessageChannel Message » for: I/ReportData suppressResponse attr: 838 id: ${SESSION}(tcp)⇵${EXCHANGE}✉08e2433e type: 0x1/0x5`;
        const checks = await report([wildcardRead(), sizeless]);

        expect(checks[0].verdict).equal("fail");
    });

    it("keeps the evidence short, though the report line carries its whole payload", async () => {
        const long = `${reportData(27432)}${"ab".repeat(30000)}`;
        const checks = await report([wildcardRead(), long]);

        expect(checks[0].verdict).equal("pass");
        expect(checks[0].matched?.length).most(300);
    });

    it("does not take a read of one attribute for the wildcard read", async () => {
        const checks = await report([
            wildcardRead(SESSION, EXCHANGE, "0.basicInformation.state.vendorName"),
            reportData(27432),
        ]);

        expect(checks[0].verdict).equal("fail");
    });

    it("does not take another session's wildcard read", async () => {
        const checks = await report([wildcardRead(OTHER_SESSION), reportData(27432, OTHER_SESSION)]);

        expect(checks[0].verdict).equal("fail");
    });
});

describe("regularSizedRequestCheck", () => {
    const invokeMessage = (bytes: number | undefined, session = SESSION, exchange = INVOKE_EXCHANGE) =>
        `${at(2)} DEBUG MessageExchange Message « for: I/InvokeRequest id: ${session}(tcp)⇵${exchange}✉0ca20aa0 type: 0x1/0x8${bytes === undefined ? "" : ` size: ${bytes} payload: 1528`}`;

    async function sized(lines: string[]) {
        return withDut(lines, async cx => regularSizedRequestCheck(cx, SESSION, INVOKE_EXCHANGE, 0));
    }

    it("passes for a request an MRP session could equally have carried", async () => {
        const check = await sized([invokeMessage(29)]);

        expect(check.verdict).equal("pass");
        expect(check.detail).contains("29 bytes");
    });

    it("fails for a request larger than MRP's own payload limit, though smaller than the large-payload floor", async () => {
        expect((await sized([invokeMessage(1250)])).verdict).equal("fail");
    });

    it("fails for a request line stating no size", async () => {
        expect((await sized([invokeMessage(undefined)])).verdict).equal("fail");
    });

    it("does not take another session's request", async () => {
        expect((await sized([invokeMessage(29, OTHER_SESSION)])).verdict).equal("fail");
    });

    it("does not take another exchange's request", async () => {
        expect((await sized([invokeMessage(29, SESSION, "2c58")])).verdict).equal("fail");
    });

    it("keeps the evidence short, though a request line carries its whole payload", async () => {
        const check = await sized([`${invokeMessage(29)}${"ab".repeat(30000)}`]);

        expect(check.verdict).equal("pass");
        expect(check.matched?.length).most(300);
    });
});

describe("noFurtherSessionCheck", () => {
    const unrelated = `${at(2)} DEBUG MessageExchange New exchange « ${SESSION}(tcp)⇵2c57 protocol: 1`;

    it("passes when the DUT accepted no further connection while the interaction ran", async () => {
        const check = await withDut([unrelated, unrelated], async cx => noFurtherSessionCheck(cx, 0, 1));

        expect(check.verdict).equal("pass");
        expect(check.detail).contains("0 further pairing");
    });

    it("fails when a second session was established while the interaction ran", async () => {
        const check = await withDut([unrelated, pairingRequest()], async cx => noFurtherSessionCheck(cx, 0, 1));

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("1 further pairing");
    });

    it("ignores a pairing request that preceded the window", async () => {
        const check = await withDut([pairingRequest(), unrelated], async cx => noFurtherSessionCheck(cx, 1, 1));

        expect(check.verdict).equal("pass");
    });

    it("ignores a pairing request that followed the interaction", async () => {
        const check = await withDut([unrelated, pairingRequest()], async cx => noFurtherSessionCheck(cx, 0, 0));

        expect(check.verdict).equal("pass");
    });

    it("ignores the runner's own step banner", async () => {
        await withDut([unrelated], async (cx, _checks) => {
            const dut = cx.devices.dut;
            dut.log.annotate("TC-SC-8.7 — Pairing request « tcp://[fe80::1%en0]«60111");
            await dut.log.settled();

            expect((await noFurtherSessionCheck(cx, 0, dut.log.lines.length - 1)).verdict).equal("pass");
        });
    });

    it("states the gap rather than a pass on a device whose log it cannot read", async () => {
        const check = await withDut([pairingRequest()], async cx => noFurtherSessionCheck(cx, 0, 0), "chip-local");

        expect(check.verdict).equal("unverified");
    });
});

describe("TcpSessionRef", () => {
    it("refuses to answer before a session was captured", () => {
        expect(() => new TcpSessionRef().require()).throw(CertCheckFailedError);
    });

    it("forgets the session a finalizer cleared", () => {
        const session = new TcpSessionRef();
        session.set(SESSION);
        expect(session.require()).equal(SESSION);

        session.clear();
        expect(() => session.require()).throw(CertCheckFailedError);
    });
});
