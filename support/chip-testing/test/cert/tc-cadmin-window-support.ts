/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Seconds, Time } from "@matter/main";
import { AdministratorCommissioning } from "@matter/main/clusters";
import { Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import type {
    CertDevice,
    CertNodeApi,
    CertStepContext,
    CheckRecord,
    LogExpectPatterns,
    LogLine,
} from "@matter/testing";
import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import {
    checkCommissioned,
    checkWindowNotOpen,
    CommissioningMethod,
    CW_CLOCK_ALLOWANCE,
    CW_DURATION_SECONDS,
    expectNoDeviceLog,
    isGiveUpOrRefusedPase,
    METHODS,
    noRecordOrNoPase,
    OpenedWindow,
    openWindowChecked,
    PASE_ESTABLISHED,
    PendingWindow,
    REVOKE_TIMED_INTERACTION_MS,
    WINDOW_CLOSED,
    WINDOW_OPEN,
    writeAndReadNodeLabel,
} from "./tc-cadmin-support.js";
import {
    ABSENT_DEVICE_GIVE_UP,
    ABSENT_DEVICE_WAIT,
    chipToolGaveUpOrPaseFailed,
    CommissioningRefusals,
} from "./tc-dd-support.js";
import {
    attempt,
    CommissionedRefs,
    describeValue,
    expectCommandInvoke,
    expectDeviceLog,
    expectRejection,
    LOG_TIMEOUT,
    record,
    CertCheckFailedError,
    RecordedCheck,
    requireId,
    runCleanups,
    withChecks,
} from "./tc-support.js";

const ADMINISTRATOR_COMMISSIONING = Matter.clusters.require("AdministratorCommissioning");
const ADMINISTRATOR_COMMISSIONING_ID = requireId(ADMINISTRATOR_COMMISSIONING.id, "AdministratorCommissioning cluster");
const WINDOW_STATUS_PATH = {
    endpoint: 0,
    cluster: ADMINISTRATOR_COMMISSIONING_ID,
    attribute: requireId(ADMINISTRATOR_COMMISSIONING.attributes.require("WindowStatus").id, "WindowStatus attribute"),
};
const REVOKE_COMMISSIONING_ID = requireId(
    ADMINISTRATOR_COMMISSIONING.commands.require("RevokeCommissioning").id,
    "RevokeCommissioning command",
);

/** Step 4's delay: `PIXIT.CADMIN.CwDuration` + 10 seconds after the window opened. */
export const LATE_START = Seconds(CW_DURATION_SECONDS + 10);

/** How long step 8 watches the TH for a window it opens or closes after the refused revoke. */
const NO_ACTION_WINDOW = Seconds(5);

/** Bounds the DUT's answer to step 8's revoke; the TH answers at once, so this only stops a hang. */
const REVOKE_ANSWER_TIMEOUT = Seconds(30);

/** How long an opened window's commissionable record has to show up in the open step. */
const ADVERTISEMENT_TIMEOUT = Seconds(10);

/**
 * The device refusing RevokeCommissioning because no window is open (Matter Core § 11.19.8.3.1). chip logs the
 * refusal; matter.js logs the status and cluster status it answers the invoke with.
 */
export const REVOKE_WINDOW_NOT_OPEN: LogExpectPatterns = {
    chip: /Commissioning window is currently not open/,
    matterjs: new RegExp(
        "Invoke error \\d+\\.administratorCommissioning\\.revokeCommissioning: Status=Failure\\(1\\), " +
            `ClusterStatus=${AdministratorCommissioning.StatusCode.WindowNotOpen}$`,
    ),
};

/** A window opening or closing on the device: {@link WINDOW_OPEN} or {@link WINDOW_CLOSED}. */
export const WINDOW_OPENED_OR_CLOSED: LogExpectPatterns = {
    chip: new RegExp(`${WINDOW_OPEN.chip?.source}|${WINDOW_CLOSED.chip?.source}`),
    matterjs: new RegExp(`${WINDOW_OPEN.matterjs?.source}|${WINDOW_CLOSED.matterjs?.source}`),
};

/**
 * Whether `error` is the device answering RevokeCommissioning with the cluster status `WindowNotOpen` (Matter Core
 * § 11.19.8.3.1), which the controller reports as a `Failure` carrying that cluster code. Any other error says
 * nothing about the window.
 */
export function isWindowNotOpenRefusal(error: unknown): boolean {
    return (
        error instanceof StatusResponseError &&
        error.code === Status.Failure &&
        error.clusterCode === AdministratorCommissioning.StatusCode.WindowNotOpen
    );
}

/** `Duration.format` drops the milliseconds above a minute, which hides a miss of the 1.8 s clock allowance. */
function exactly(duration: Duration) {
    return `${Duration.format(duration)} (${duration.toFixed(1)} ms)`;
}

/**
 * Judges a window's lifetime from the TH's own lines: the time between the follower taking in `openLine` and
 * `closedLine` (`LogLine.receivedAt`, monotonic) must lie within the plan's clock allowance around
 * {@link CW_DURATION_SECONDS}. An absent `closedLine` fails it.
 */
export function windowLifetimeCheck(openLine: LogLine, closedLine: LogLine | undefined): CheckRecord {
    const earliest = Millis(Seconds(CW_DURATION_SECONDS) - CW_CLOCK_ALLOWANCE);
    const latest = Millis(Seconds(CW_DURATION_SECONDS) + CW_CLOCK_ALLOWANCE);
    const lifetime = closedLine === undefined ? undefined : Millis(closedLine.receivedAt - openLine.receivedAt);
    return {
        type: "device-log",
        verdict: lifetime !== undefined && lifetime >= earliest && lifetime <= latest ? "pass" : "fail",
        detail:
            "the TH's window-closed line arrived " +
            (lifetime === undefined ? "never" : `${exactly(lifetime)} after`) +
            ` its window-open line; the plan allows ${exactly(earliest)} to ${exactly(latest)}`,
        logLine: closedLine?.index,
    };
}

/**
 * Judges when step 4's commissioning started: at least {@link LATE_START} after the TH took in `openLine`, both on
 * the monotonic clock.
 */
export function lateStartCheck(openLine: LogLine, startedAt: number): CheckRecord {
    const delay = Millis(startedAt - openLine.receivedAt);
    return {
        type: "response",
        verdict: delay >= LATE_START ? "pass" : "fail",
        detail:
            `TH_CR2 started commissioning ${exactly(delay)} after the TH's window-open line; ` +
            `the plan asks for ${exactly(LATE_START)}`,
        logLine: openLine.index,
    };
}

/**
 * Sleeps until `performance.now()` reaches `deadline`.  A timer may fire up to a millisecond before its delay has
 * passed on this clock, so the wait repeats until the deadline is reached.
 */
async function sleepUntil(what: string, deadline: number) {
    for (let remaining = deadline - performance.now(); remaining > 0; remaining = deadline - performance.now()) {
        await Time.sleep(what, Millis(Math.ceil(remaining)));
    }
}

/** DUT_CR1's read of WindowStatus as a check that the TH reports no open window, for a step that records later. */
async function windowStatusCheck(node: CertNodeApi): Promise<CheckRecord> {
    const read = await attempt(
        () => node.readAttribute(WINDOW_STATUS_PATH),
        value => `DUT_CR1 read WindowStatus ${describeValue(value)}`,
    );
    if (!read.ok || read.value === AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen) {
        return read.check;
    }
    return { ...read.check, verdict: "fail", detail: `${read.check.detail}, expected WindowNotOpen` };
}

/** Waits for the TH to close the window `openLine` opened by itself, and checks when it did. */
async function windowTimeoutChecks(th: CertDevice, openLine: LogLine): Promise<RecordedCheck[]> {
    const latest = Millis(Seconds(CW_DURATION_SECONDS) + CW_CLOCK_ALLOWANCE);
    const remaining = Millis(Math.max(0, openLine.receivedAt + latest - performance.now()));
    const closed = await expectDeviceLog(
        th.log,
        th.flavor,
        WINDOW_CLOSED,
        openLine.index + 1,
        Millis(remaining + LOG_TIMEOUT),
    );
    const closedLine = closed.check.logLine === undefined ? undefined : th.log.at(closed.check.logLine);
    return [
        { what: "Commissioning-window-closed log", check: () => closed.check },
        { what: "Window lifetime", check: () => windowLifetimeCheck(openLine, closedLine) },
    ];
}

/**
 * Registers TC-CADMIN-1.7 (`enhanced`) or TC-CADMIN-1.8 (`basic`): the DUT opens windows on the TH and lets one
 * time out, revokes one and revokes again with none open; a TH commissioner may join only through the last window,
 * and only once.
 *
 * The refused steps (4, 7, 12) record the TH commissioner's give-up together with the TH's side: no commissionable
 * record for the window's discriminator, or no PASE session the TH accepted. Steps 1 and 11 record a PASE session
 * the TH accepted, and each window-opening step records the window's commissionable record, so both absences are
 * looked for with patterns and probes that find their subject in the same run. Step 12 reads WindowStatus first,
 * because the plan gives the closed window as the reason for the refusal; chip logs no window-closed line when a
 * commissioning closes the window.
 *
 * Step 4 waits at least 190 s, until the window timed out, and is not `longRunning`: skipped, it would leave step 2's window
 * open, and the TH would answer step 5's command with `Busy` (Matter Core § 11.19.8.1, § 11.19.8.2).
 */
export function windowHandlingCase(tc: string, method: CommissioningMethod): void {
    type Role = "dut" | "th_cr2" | "th_cr3";
    const { abbreviation, pics: windowPics, capabilities } = METHODS[method];
    const timeout = `with a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ${abbreviation}`;

    const commissioned = new CommissionedRefs<Role>();
    const refusals = new CommissioningRefusals<Role>();
    const pendingWindow = new PendingWindow();
    let joinedWindow: OpenedWindow | undefined;

    const openWindow = async (cx: CertStepContext) => {
        const window = await openWindowChecked(cx, cx.controllers.dut, commissioned.require("dut"), method, "DUT_CR1");
        pendingWindow.set(window);
        const { discriminator } = window;
        if (discriminator !== undefined) {
            record(
                cx,
                await expectMdns(
                    { commissioning: { discriminator } },
                    { commissionable: true },
                    { timeoutMs: ADVERTISEMENT_TIMEOUT },
                ),
                "Commissionable record for the window's discriminator, which the refused steps look for",
            );
        }
    };

    const revoke = (cx: CertStepContext) =>
        cx.controllers.dut
            .node(commissioned.require("dut"))
            .invoke("AdministratorCommissioning", "revokeCommissioning", {}, 0, {
                timedInteractionTimeoutMs: REVOKE_TIMED_INTERACTION_MS,
            });

    const revokeReceived = (th: CertDevice, from: number) =>
        expectCommandInvoke(
            th.log,
            th.flavor,
            0,
            ADMINISTRATOR_COMMISSIONING_ID,
            REVOKE_COMMISSIONING_ID,
            [],
            from,
            LOG_TIMEOUT,
        );

    /**
     * Has `role` try to commission the TH through `window` and records that it gave up or had its PASE refused, with
     * the TH's side and, on chip-tool, chip-tool's own log. `before` are the step's checks to record first.
     */
    const requireRefused = async (
        cx: CertStepContext,
        role: "th_cr2" | "th_cr3",
        who: string,
        window: OpenedWindow,
        before: RecordedCheck[] = [],
    ) => {
        const th = cx.devices.th;
        const controller = cx.controllers[role];
        const chipTool = cx.controllerSelection.helper === "chip-tool";
        await withChecks(cx, async checks => {
            checks.push(...before);
            const from = await th.log.markSettled();
            const controllerFrom = await controller.log.markSettled();

            const commissioning = controller.commission({ ...window.target, giveUpAfterMs: ABSENT_DEVICE_GIVE_UP });
            refusals.track(commissioning, role);
            const refused = await expectRejection(
                `${who} commissioning`,
                commissioning,
                ABSENT_DEVICE_WAIT,
                isGiveUpOrRefusedPase,
            );
            checks.push(
                { what: `${who} could not commission`, check: () => refused },
                {
                    what: "No commissionable record for the window's discriminator, or TH_CE refused PASE",
                    check: () => noRecordOrNoPase(th, window.discriminator, from),
                },
            );
            if (chipTool) {
                checks.push({
                    what: "chip-tool gave up on discovery, or its PASE failed",
                    check: () => chipToolGaveUpOrPaseFailed(controller.log, controllerFrom),
                });
            }
        });
    };

    const operatorOnly = (what: string) => async (cx: CertStepContext) => {
        cx.recorder.check({
            type: "response",
            verdict: "unverified",
            detail: `${what} needs a person in front of the DUT; no adapter can observe it`,
        });
    };

    certTest(tc, {
        plan: "multiplefabrics.adoc",
        pics: ["CADMIN.C", windowPics],
        app: "all-clusters",
        controllers: { dut: "dut", th_cr2: "helper", th_cr3: "helper" },
        controllerCapabilities: capabilities,
    })
        .step(
            1,
            "DUT_CR1 starts a commissioning process with TH_CE",
            async cx => {
                const dut = cx.controllers.dut;
                const th = cx.devices.th;
                const from = await th.log.markSettled();

                const ref = await dut.commission({
                    passcode: th.commissioning.passcode,
                    discriminator: th.commissioning.discriminator,
                });
                commissioned.set("dut", ref);
                await checkCommissioned(cx, dut, ref, "DUT_CR1", from);
                record(
                    cx,
                    (await expectDeviceLog(th.log, th.flavor, PASE_ESTABLISHED, from, LOG_TIMEOUT)).check,
                    "TH_CE logs the PASE session it accepted, which the refused steps look for",
                );
            },
            { pics: "CADMIN.C", expected: "TH_CE is commissioned by DUT_CR1" },
        )
        .step(2, `DUT_CR1 sends command to TH_CE to open a commissioning window ${timeout}`, openWindow, {
            pics: windowPics,
            expected: "TH_CE opens its Commissioning window to allow a second commissioning",
        })
        .step(
            "3.a",
            "A User Consent screen pops up asking for User's permission to allow second commissioner to control TH_CE",
            operatorOnly("A consent screen on the DUT"),
            {
                pics: "CADMIN.M.UserInterfaceDisplay",
                expected:
                    "Verify if the User Consent screen pops up asking for permission. Verify the pop up window closes after User gives permission and proceeds with opening commissioning window.",
            },
        )
        .step(
            "3.b",
            "11 digit Manual Code is displayed on the screen in textual format for User to see",
            operatorOnly("A code shown on the DUT's screen"),
            {
                pics: "CADMIN.M.UserInterfaceDisplay",
                expected:
                    "Verify that the displayed Manual Code is 11 digits long and doesn't contain Vendor_ID or Product_ID.",
            },
        )
        .step(
            "3.c",
            "A voice prompt of the Manual Code format should be heard",
            operatorOnly("A voice prompt from the DUT"),
            {
                pics: "CADMIN.M.AudioInterface",
                expected:
                    "Verify that a voice prompt saying the Manual Code should be uttered in hearable sound. Verify that the user can ask to repeat the Manual Code and it should be repeated.",
            },
        )
        .step(
            4,
            `TH_CR2 starts a commissioning process with TH_CE after ${CW_DURATION_SECONDS} (that was given in step 2) + 10 seconds`,
            async cx => {
                const th = cx.devices.th;
                const window = pendingWindow.require();
                const { openLine } = window;
                if (openLine === undefined) {
                    const detail = `The ${th.flavor} TH logged no window-open line in step 2, so the window's timeout cannot be measured`;
                    cx.recorder.check({ type: "device-log", verdict: "fail", detail });
                    throw new CertCheckFailedError(detail);
                }

                const timedOut = await windowTimeoutChecks(th, openLine);
                await sleepUntil("commissioning window timeout plus 10 s", openLine.receivedAt + LATE_START);
                const started = lateStartCheck(openLine, performance.now());
                await requireRefused(cx, "th_cr2", "TH_CR2", window, [
                    ...timedOut,
                    { what: "TH_CR2 started after the timeout", check: () => started },
                ]);
            },
            {
                pics: "CADMIN.C",
                expected:
                    "Verify TH_CE is NOT commissioned by TH_CR2 since the commissioning process started after the timeout",
            },
        )
        .step(5, `DUT_CR1 sends command to TH_CE to open a new commissioning window ${timeout}`, openWindow, {
            pics: windowPics,
            expected: "Verify TH_CE opens its Commissioning window to allow a second commissioning",
        })
        .step(
            6,
            "DUT_CR1 sends command to TH_CE to revoke the commissioning window",
            async cx => {
                const th = cx.devices.th;
                await withChecks(cx, async checks => {
                    const from = await th.log.markSettled();
                    const revoked = await attempt(
                        () => revoke(cx),
                        () => "DUT_CR1's RevokeCommissioning answered with success",
                    );
                    checks.push({ what: "RevokeCommissioning", check: () => revoked.check });
                    const received = await revokeReceived(th, from);
                    checks.push({ what: "TH received RevokeCommissioning", check: () => received });
                    const closed = await expectDeviceLog(th.log, th.flavor, WINDOW_CLOSED, from, LOG_TIMEOUT);
                    checks.push({ what: "Commissioning-window-closed log", check: () => closed.check });
                });
                await checkWindowNotOpen(cx, cx.controllers.dut.node(commissioned.require("dut")), "DUT_CR1");
            },
            { pics: "CADMIN.C.C02.Tx", expected: "Verify TH_CE closes its Commissioning window" },
        )
        .step(
            7,
            "TH_CR2 starts a commissioning process with TH_CE",
            cx => requireRefused(cx, "th_cr2", "TH_CR2", pendingWindow.require()),
            { pics: "CADMIN.C", expected: "Verify TH_CE is NOT commissioned by TH_CR2" },
        )
        .step(
            8,
            "DUT_CR1 sends command to TH_CE to revoke the commissioning window",
            async cx => {
                const th = cx.devices.th;
                await withChecks(cx, async checks => {
                    const from = await th.log.markSettled();
                    const refused = await expectRejection(
                        "DUT_CR1's RevokeCommissioning with no window open",
                        revoke(cx),
                        REVOKE_ANSWER_TIMEOUT,
                        isWindowNotOpenRefusal,
                    );
                    checks.push({ what: "TH answered WindowNotOpen", check: () => refused });
                    const received = await revokeReceived(th, from);
                    checks.push({ what: "TH received RevokeCommissioning", check: () => received });
                    const answered = await expectDeviceLog(
                        th.log,
                        th.flavor,
                        REVOKE_WINDOW_NOT_OPEN,
                        from,
                        LOG_TIMEOUT,
                    );
                    checks.push({ what: "TH logged that no window is open", check: () => answered.check });
                    const untouched = await expectNoDeviceLog(
                        th.log,
                        th.flavor,
                        WINDOW_OPENED_OR_CLOSED,
                        from,
                        NO_ACTION_WINDOW,
                    );
                    checks.push({
                        what: "TH opened or closed no window, which steps 5 and 6 found it logging",
                        check: () => untouched,
                    });
                });
                await checkWindowNotOpen(cx, cx.controllers.dut.node(commissioned.require("dut")), "DUT_CR1");
            },
            { pics: "CADMIN.C.C02.Tx", expected: "Verify no actions are done on TH_CE due to this command" },
        )
        .step(
            9,
            "DUT_CR1 sends commands to TH_CE to write and read the Basic Information Cluster's NodeLabel mandatory attribute",
            cx =>
                writeAndReadNodeLabel(cx, cx.controllers.dut.node(commissioned.require("dut")), "DUT_CR1", "dut-cr1-9"),
            { pics: "BINFO.C.A0005", expected: "Verify TH_CE successfully receives the read and write commands" },
        )
        .step(
            10,
            `DUT_CR1 sends command to TH_CE to open ${method === "enhanced" ? "a" : "a new"} commissioning window ${timeout}`,
            openWindow,
            {
                pics: windowPics,
                expected: "Verify TH_CE opens its Commissioning window to allow a second commissioning",
            },
        )
        .step(
            11,
            "TH_CR2 starts a commissioning process with TH_CE",
            async cx => {
                const th = cx.devices.th;
                const th_cr2 = cx.controllers.th_cr2;
                const window = pendingWindow.require();
                joinedWindow = window;
                const from = await th.log.markSettled();

                const ref = await th_cr2.commission(window.target);
                commissioned.set("th_cr2", ref);
                await checkCommissioned(cx, th_cr2, ref, "TH_CR2", from);
                record(
                    cx,
                    (await expectDeviceLog(th.log, th.flavor, PASE_ESTABLISHED, from, LOG_TIMEOUT)).check,
                    "TH_CE logs the PASE session it accepted, which step 12 looks for",
                );
            },
            { pics: "CADMIN.C", expected: "TH_CE is commissioned by TH_CR2" },
        )
        .step(
            12,
            "TH_CR3 starts a commissioning process with TH_CE",
            async cx => {
                if (joinedWindow === undefined) {
                    throw new InternalError("TH_CR2 joined through no window; step 11 must run first");
                }
                const status = await windowStatusCheck(cx.controllers.dut.node(commissioned.require("dut")));
                await requireRefused(cx, "th_cr3", "TH_CR3", joinedWindow, [
                    { what: "TH_CE closed the window TH_CR2 joined through", check: () => status },
                ]);
            },
            {
                pics: "CADMIN.C",
                expected:
                    "TH_CE fails the commissioning process with TH_CR3 since in step 10 after a successful commissioning the commissioning window has been closed",
            },
        )
        .finalize(cx =>
            runCleanups(
                () => refusals.settle(cx),
                () => commissioned.decommissionAll(cx),
            ),
        );
}
