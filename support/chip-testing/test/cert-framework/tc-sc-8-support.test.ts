/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Millis } from "@matter/general";
import type {
    CertDevice,
    CertSessionInfo,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    DeviceFlavor,
    Subject,
} from "@matter/testing";
import { LineQueue, LogFollower, PicsFile } from "@matter/testing";
import {
    largePayloadSessionCheck,
    noFurtherSessionCheck,
    recordTcpInvoke,
    recordTcpSession,
    regularSizedRequestCheck,
    describeSessions,
    furtherSessionCheck,
    recordSeveredSession,
    sessionEvictionUnreadableCheck,
    sessionGoneCheck,
    sessionWithId,
    tcpSessionIdOf,
    wildcardReadInOneReportCheck,
    TcpSessionRef,
} from "../cert/tc-sc-8-support.js";
import { CertCheckFailedError } from "../cert/tc-support.js";
import { fakeCertNode } from "./fake-cert-node.js";

/** GeneralDiagnostics, and its TimeSnapshot command, which TC-SC-8.5 invokes. */
const CLUSTER = 0x33;
const COMMAND = 0x1;
const ENDPOINT = 0;

const SESSION = "@1:86c217a36142d632•c8b8";
const CHANNEL = "tcp://[fe80::1%en0]«60111";
const SESSION_FACTS = { tag: SESSION, channel: CHANNEL, controllerSessionId: 0xc8b8 };
const OTHER_SESSION = "@1:86c217a36142d632•9f2c";

function at(millis: number) {
    const iso = new Date(1786711488_000 + millis).toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`;
}

const pairingRequest = (session = SESSION) =>
    `${at(0)} INFO CaseServer •unsecured#${session}(tcp)⇵2c56 Pairing request « tcp://[fe80::1%en0]«60111`;
const newSession = (session = SESSION) =>
    `${at(1)} INFO CaseServer ${session}(tcp) New session with @1:86c217a36142d632 2↔1 address: tcp://[fe80::1%en0]«60111`;

/** What the TH holds for a TCP-backed session it established, as `CertSessionInfo` reports it. */
const TCP_HELD: CertSessionInfo = {
    id: 0xc8b8,
    transport: "tcp",
    largePayload: true,
    maxPayloadSize: 65523,
};

/** A session over the other transport a controller may hold with the same peer at the same time. */
const UDP_HELD: CertSessionInfo = {
    id: 0x9f2c,
    transport: "udp",
    largePayload: false,
    maxPayloadSize: 1280,
};

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
            expect(await recordTcpSession(cx, 0, "runs over TCP")).deep.equal({
                tag: SESSION,
                channel: CHANNEL,
            });
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
        expect((await sized([invokeMessage(1200)])).verdict).equal("fail");
    });

    it("passes for the largest payload MRP could still have carried", async () => {
        expect((await sized([invokeMessage(1178)])).verdict).equal("pass");
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
    const established = (session = OTHER_SESSION) =>
        `${at(3)} INFO CaseServer ${session}(tcp) New session with @1:86c217a36142d632 2↔1 address: tcp://[fe80::2%en0]«60999`;
    const resumed = (session = OTHER_SESSION) =>
        `${at(3)} INFO CaseServer ${session}(tcp) Resumed session with @1:86c217a36142d632 2↔1 address: tcp://[fe80::2%en0]«60999`;

    it("passes when the DUT established no further session while the interaction ran", async () => {
        const check = await withDut([unrelated, unrelated], async cx => noFurtherSessionCheck(cx, 0, 1));

        expect(check.verdict).equal("pass");
        expect(check.detail).contains("0 further session");
    });

    it("fails when a second session was established while the interaction ran", async () => {
        const check = await withDut([unrelated, established()], async cx => noFurtherSessionCheck(cx, 0, 1));

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("1 further session");
    });

    it("fails when a session was resumed while the interaction ran", async () => {
        const check = await withDut([unrelated, resumed()], async cx => noFurtherSessionCheck(cx, 0, 1));

        expect(check.verdict).equal("fail");
    });

    it("passes for an attempt the DUT never turned into a session", async () => {
        const check = await withDut([unrelated, pairingRequest()], async cx => noFurtherSessionCheck(cx, 0, 1));

        expect(check.verdict).equal("pass");
    });

    it("ignores a session established before the window", async () => {
        const check = await withDut([established(), unrelated], async cx => noFurtherSessionCheck(cx, 1, 1));

        expect(check.verdict).equal("pass");
    });

    it("ignores a session established after the interaction", async () => {
        const check = await withDut([unrelated, established()], async cx => noFurtherSessionCheck(cx, 0, 0));

        expect(check.verdict).equal("pass");
    });

    it("ignores the runner's own step banner", async () => {
        await withDut([unrelated], async cx => {
            const dut = cx.devices.dut;
            dut.log.annotate("TC-SC-8.7 — CaseServer New session with a peer");
            await dut.log.settled();

            expect((await noFurtherSessionCheck(cx, 0, dut.log.lines.length - 1)).verdict).equal("pass");
        });
    });

    it("states the gap rather than a pass on a device whose log it cannot read", async () => {
        const check = await withDut([established()], async cx => noFurtherSessionCheck(cx, 0, 0), "chip-local");

        expect(check.verdict).equal("unverified");
    });
});

describe("TcpSessionRef", () => {
    it("refuses to answer before a session was captured", () => {
        expect(() => new TcpSessionRef().require()).throw(CertCheckFailedError);
    });

    it("forgets the session a finalizer cleared", () => {
        const session = new TcpSessionRef();
        session.set(SESSION_FACTS);
        expect(session.require()).deep.equal(SESSION_FACTS);

        session.clear();
        expect(() => session.require()).throw(CertCheckFailedError);
    });
});

describe("largePayloadSessionCheck", () => {
    it("passes for the named TCP session permitting large payloads", () => {
        const check = largePayloadSessionCheck([TCP_HELD], TCP_HELD.id);

        expect(check.verdict).equal("pass");
        expect(check.detail).match(/tcp session 51384, which permits large payloads/);
    });

    it("fails when the controller holds no sessions at all", () => {
        const check = largePayloadSessionCheck([], TCP_HELD.id);

        expect(check.verdict).equal("fail");
        expect(check.detail).match(/no sessions/);
    });

    // The hole the identified API closes: a sibling session over another transport must neither
    // satisfy this check nor fail it
    it("fails when the named session is absent, whatever else is held", () => {
        const check = largePayloadSessionCheck([UDP_HELD], TCP_HELD.id);

        expect(check.verdict).equal("fail");
        expect(check.detail).match(/no session 51384 with the DUT, and holds udp session 40748/);
    });

    it("judges the named session, not the one that comes first", () => {
        expect(largePayloadSessionCheck([UDP_HELD, TCP_HELD], TCP_HELD.id).verdict).equal("pass");
    });

    // Only TCP carries a large payload, so a UDP session claiming to permit one is reporting
    // something the peer could not receive
    it("fails for a session over another transport", () => {
        const udpClaimingLargePayload = { ...UDP_HELD, largePayload: true, maxPayloadSize: 65523 };

        expect(largePayloadSessionCheck([udpClaimingLargePayload], UDP_HELD.id).verdict).equal("fail");
    });

    it("fails for a session that denies large payloads", () => {
        expect(largePayloadSessionCheck([{ ...TCP_HELD, largePayload: false }], TCP_HELD.id).verdict).equal("fail");
    });

    // The claim is about payloads MRP cannot carry, so a ceiling at the MTU leaves "permits"
    // describing nothing
    it("fails for a payload ceiling no larger than the IPv6 MTU", () => {
        expect(largePayloadSessionCheck([{ ...TCP_HELD, maxPayloadSize: 1280 }], TCP_HELD.id).verdict).equal("fail");
    });
});

describe("sessionGoneCheck", () => {
    it("passes when the controller holds no sessions at all", () => {
        expect(sessionGoneCheck(SESSION_FACTS, []).verdict).equal("pass");
    });

    it("passes when the controller holds only other sessions", () => {
        const check = sessionGoneCheck(SESSION_FACTS, [UDP_HELD]);

        expect(check.verdict).equal("pass");
        expect(check.detail).match(/no longer holds session 51384, and holds udp session 40748/);
    });

    // The failure the check exists for, and the reason it is identified rather than counted: a
    // check that asked whether any session exists — or whether the newest one differs — would pass
    // on the very session it was supposed to have destroyed
    it("fails when the severed session is still held alongside another", () => {
        const check = sessionGoneCheck(SESSION_FACTS, [UDP_HELD, TCP_HELD]);

        expect(check.verdict).equal("fail");
        expect(check.detail).match(/still holds session 51384/);
    });

    it("fails when the controller still holds the severed session alone", () => {
        expect(sessionGoneCheck(SESSION_FACTS, [TCP_HELD]).verdict).equal("fail");
    });
});

describe("tcpSessionIdOf", () => {
    it("answers the id of the one TCP session held", () => {
        expect(tcpSessionIdOf([UDP_HELD, TCP_HELD])).equal(TCP_HELD.id);
    });

    it("refuses when no TCP session is held", () => {
        expect(() => tcpSessionIdOf([UDP_HELD])).throw(CertCheckFailedError, /holds 0 TCP sessions/);
    });

    // Two is reachable — a peer-lost session lingers, an inbound session joins the same peer — so it
    // must refuse rather than pick one, or the case reasons about whichever came back first
    it("refuses when two TCP sessions are held", () => {
        expect(() => tcpSessionIdOf([TCP_HELD, { ...TCP_HELD, id: 0x1234 }])).throw(
            CertCheckFailedError,
            /holds 2 TCP sessions/,
        );
    });

    it("names what is held, so a refusal says which sessions it saw", () => {
        expect(() => tcpSessionIdOf([UDP_HELD])).throw(/holds udp session 40748/);
    });
});

describe("recordSeveredSession", () => {
    /** A TH whose `sessions()` answers each element of `reads` in turn, and the last one thereafter. */
    function thReading(reads: CertSessionInfo[][]) {
        const severed = new Array<number>();
        let call = 0;
        const th = {
            id: "th",
            log: new LogFollower(new LineQueue().follow(), "th"),
            async start() {},
            async close() {},
            async commission() {
                return "ref";
            },
            parseQrPayload: () => Promise.reject(new InternalError("not used by these tests")),
            parseManualPairingCode: () => Promise.reject(new InternalError("not used by these tests")),
            node: () =>
                fakeCertNode({
                    sessions: async () => reads[Math.min(call++, reads.length - 1)],
                    severTransportConnection: async id => void severed.push(id),
                }),
            group: (): never => {
                throw new InternalError("not used by these tests");
            },
        } satisfies ControllerAdapter;

        const checks = new Array<CheckRecord>();
        const cx: CertStepContext = {
            controllers: { th },
            devices: {},
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
        return { cx, checks, severed, reads: () => call };
    }

    /** Long enough for a few poll turns, short enough for a hermetic test's own timeout. */
    const POLL_BOUND = Millis(300);

    function refHolding(facts = SESSION_FACTS) {
        const ref = new TcpSessionRef();
        ref.set(facts);
        return ref;
    }

    it("severs the session the case captured, by id", async () => {
        const { cx, severed } = thReading([[]]);

        await recordSeveredSession(cx, "ref", refHolding());

        expect(severed).deep.equal([SESSION_FACTS.controllerSessionId]);
    });

    it("passes on the first read when the session is already gone", async () => {
        const { cx, checks, reads } = thReading([[]]);

        await recordSeveredSession(cx, "ref", refHolding());

        expect(checks.map(check => check.verdict)).deep.equal(["pass", "unverified"]);
        expect(reads()).equal(1);
    });

    // The race the poll exists for: eviction runs on a worker no step can await, so the severed
    // session is still held on the first read
    it("waits for an eviction that has not happened yet", async () => {
        const { cx, checks, reads } = thReading([[TCP_HELD], [TCP_HELD], [UDP_HELD]]);

        await recordSeveredSession(
            cx,
            "ref",
            refHolding({ ...SESSION_FACTS, controllerSessionId: TCP_HELD.id }),
            POLL_BOUND,
        );

        expect(checks[0].verdict).equal("pass");
        expect(reads()).equal(3);
    });

    // A timeout must not read as success — the severed session still being held is the failure
    it("fails when the session is never evicted", async () => {
        const { cx, checks } = thReading([[TCP_HELD]]);

        await expect(
            recordSeveredSession(
                cx,
                "ref",
                refHolding({ ...SESSION_FACTS, controllerSessionId: TCP_HELD.id }),
                POLL_BOUND,
            ),
        ).rejectedWith(CertCheckFailedError);

        expect(checks[0].verdict).equal("fail");
    });
});

describe("furtherSessionCheck", () => {
    const furtherSession = (session = OTHER_SESSION) =>
        `${at(7)} INFO CaseServer ${session}(tcp) New session with @1:86c217a36142d632 2↔1 address: tcp://[fe80::1%en0]«60222`;
    const furtherResumed = (session = OTHER_SESSION) =>
        `${at(8)} INFO CaseServer ${session}(tcp) Resumed session with @1:86c217a36142d632 address: tcp://[fe80::1%en0]«60222`;

    it("passes and names the session for a further session over TCP", async () => {
        await withDut([furtherSession()], async cx => {
            const check = await furtherSessionCheck(cx, 0);

            expect(check.verdict).equal("pass");
            expect(check.matched).equal(OTHER_SESSION);
            expect(check.detail).match(/accepted @1:86c217a36142d632•9f2c over TCP/);
        });
    });

    // Resumption is a CASE session establishment, and a DUT doing the spec-preferred thing must not
    // fail the case
    it("passes for a resumed session", async () => {
        await withDut([furtherResumed()], async cx => {
            expect((await furtherSessionCheck(cx, 0)).verdict).equal("pass");
        });
    });

    // The controller's own session id is what the step rests on, so a missing line is an accepted gap
    // rather than a failure — which is the whole reason this check does not gate the step
    it("accepts a log with no further session rather than failing", async () => {
        await withDut([], async cx => {
            const check = await furtherSessionCheck(cx, 0);

            expect(check.verdict).equal("unverified");
            expect(check.accepted).match(/controller's own session id is what this step rests on/);
        });
    });

    it("does not count a session over another transport", async () => {
        const overUdp = `${at(7)} INFO CaseServer ${OTHER_SESSION} New session with @1:86c217a36142d632 2↔1 address: udp://[fe80::1%en0]:5540`;

        await withDut([overUdp], async cx => {
            expect((await furtherSessionCheck(cx, 0)).verdict).equal("unverified");
        });
    });

    it("has no pattern for a device flavor this block does not host", async () => {
        await withDut(
            [furtherSession()],
            async cx => {
                const check = await furtherSessionCheck(cx, 0);

                expect(check.verdict).equal("unverified");
                expect(check.accepted).match(/no pattern for a chip-docker device/);
            },
            "chip-docker",
        );
    });
});

describe("sessionWithId", () => {
    it("finds the session the id names", () => {
        expect(sessionWithId([UDP_HELD, TCP_HELD], TCP_HELD.id)).deep.equal(TCP_HELD);
    });

    it("answers undefined for an id nothing holds", () => {
        expect(sessionWithId([UDP_HELD], TCP_HELD.id)).equal(undefined);
    });
});

describe("describeSessions", () => {
    it("names every session held", () => {
        expect(describeSessions([UDP_HELD, TCP_HELD])).equal("udp session 40748, tcp session 51384");
    });

    it("says so when none are held, rather than reading as an empty list", () => {
        expect(describeSessions([])).equal("no sessions");
    });
});

describe("sessionEvictionUnreadableCheck", () => {
    // The device does evict, and says so; the harness cannot attribute the line, so the record has to
    // state that rather than let an unmatched pattern read as a device that failed to evict
    it("records the device half as an accepted gap", () => {
        const check = sessionEvictionUnreadableCheck(SESSION_FACTS);

        expect(check.type).equal("device-log");
        expect(check.verdict).equal("unverified");
        expect(check.accepted).match(/carries no device attribution/);
        expect(check.detail).match(/@1:86c217a36142d632•c8b8/);
    });

    it("names the connection the session ran on", () => {
        expect(sessionEvictionUnreadableCheck(SESSION_FACTS).detail).contain(CHANNEL);
    });
});
