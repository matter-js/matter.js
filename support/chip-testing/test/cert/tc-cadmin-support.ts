/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Duration, Environment, InternalError, Millis, Seconds, Time } from "@matter/main";
import { OperationalCredentials } from "@matter/main/clusters";
import {
    DeviceAlreadyCommissionedToThisFabricError,
    getOperationalDeviceQname,
    PeerCommunicationError,
} from "@matter/main/protocol";
import { FabricId, GlobalFabricId, NodeId, Status, StatusResponseError, ValidationError } from "@matter/main/types";
import { Matter } from "@matter/model";
import type {
    CertDevice,
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    CommissioningTarget,
    ControllerAdapter,
    ControllerCapability,
    LogExpectPatterns,
    LogFlavor,
    LogFollower,
    LogLine,
} from "@matter/testing";
import { certTest, flavorFamily } from "@matter/testing";
import { ControllerCommandError } from "../../src/cert/controller-command-error.js";
import { NoCommissionedPeerError } from "../../src/cert/InProcessControllerAdapter.js";
import { expectMdns } from "../../src/cert/mdns-check.js";
import {
    ABSENT_DEVICE_GIVE_UP,
    ABSENT_DEVICE_WAIT,
    chipToolDiscoveryGaveUp,
    CommissioningRefusals,
    isCommissioningGiveUp,
    PARSES_PAYLOAD,
    qrPayloadFields,
    thQrPayload,
} from "./tc-dd-support.js";
import {
    attempt,
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    expectAttributePathIB,
    expectDeviceLog,
    expectMessageWithPath,
    expectRejection,
    fabricSessionsEnded,
    LOG_TIMEOUT,
    MATTERJS_COMMISSIONED_FABRIC,
    readOwnFabricIndex,
    record,
    recordAll,
    RecordedCheck,
    removeFabricSucceeded,
    runCleanups,
    withChecks,
} from "./tc-support.js";

// The TC-CADMIN cases share their steps and device-log patterns through this module because a
// `TC-*.test.ts` registers a device-driven mocha test at import time, so the cert-framework spec set
// cannot import one to unit-test what it declares.

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const VENDOR_ID = BASIC_INFORMATION.attributes.require("vendorId");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const FABRICS = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");
const ADMINISTRATOR_COMMISSIONING = Matter.clusters.require("AdministratorCommissioning");
const WINDOW_STATUS = ADMINISTRATOR_COMMISSIONING.attributes.require("windowStatus");

const NODE_LABEL_PATH = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id };
const WINDOW_STATUS_PATH = { endpoint: 0, cluster: ADMINISTRATOR_COMMISSIONING.id, attribute: WINDOW_STATUS.id };

/** `PIXIT.CADMIN.CwDuration`: the plan asks for more than 179 and less than 901 seconds. */
export const CW_DURATION_SECONDS = 180;

/**
 * The plan's clock allowance for a commissioning window timeout: 1 % of the window, at least 100 ms
 * (multiplefabrics.adoc, "Clock allowances for commissioning test cases").
 */
const CW_CLOCK_ALLOWANCE = Millis(Math.max(100, Seconds(CW_DURATION_SECONDS) / 100));

/** `WindowNotOpen` of `CommissioningWindowStatusEnum` (Matter Core § 11.19.5.1). */
const WINDOW_NOT_OPEN = 0;

/** RevokeCommissioning requires a timed invoke (Matter Core § 11.19.8, command table). */
const REVOKE_TIMED_INTERACTION_MS = 10_000;

/** A completed commissioning: chip announces it, matter.js names the fabric it completed for. */
export const COMMISSIONING_COMPLETE: LogExpectPatterns = {
    chip: /Commissioning completed successfully/,
    matterjs: MATTERJS_COMMISSIONED_FABRIC,
};

/** An opened commissioning window, as each device logs it once the window is open. */
export const WINDOW_OPEN: LogExpectPatterns = {
    chip: /Commissioning window is now open/,
    matterjs: /AdministratorCommissioningServer Commissioning window opened for/,
};

/** A commissioning window closing, whatever closed it: a revoke, its timeout or a commissioning. */
export const WINDOW_CLOSED: LogExpectPatterns = {
    chip: /Closing pairing window/,
    matterjs: /AdministratorCommissioningServer Commissioning window closed/,
};

/** A PASE session the device accepted for commissioning. */
export const PASE_ESTABLISHED: LogExpectPatterns = {
    chip: /Commissioning completed session establishment step/,
    matterjs: /PaseServer .*New session with/,
};

/**
 * The device answering AddNOC with `FabricConflict` (9, Matter Core § 11.18.4.3, § 11.18.6.7.2). The plan
 * quotes chip's error text for it, "Trying to add a NOC for a fabric that already exists". chip logs the
 * status as a number; matter.js logs the NOCResponse it sends.
 */
export const ADD_NOC_FABRIC_CONFLICT: LogExpectPatterns = {
    chip: /OpCreds: Failed AddNOC request \(err=.*\) with OperationalCert error 9$/,
    matterjs: /operationalCredentials\.addNoc .*statusCode: 9(?!\d)/,
};

/**
 * Any message the device received on a secure session of fabric `fabricIndex`. chip names the fabric
 * index in decimal before the peer's node id, for every message it decrypted. matter.js names a session
 * `@<fabricIndex in hex>:<node id>•<id>`: on the line for a message an exchange took, and on the `Ignore «` line
 * for one an existing exchange dropped. A message matter.js drops before any exchange takes it is logged with its
 * transport address only, so no pattern can attribute it to a fabric.
 */
export function messageReceivedOnFabric(fabricIndex: number): LogExpectPatterns {
    const session = `@${fabricIndex.toString(16)}:[0-9a-f]+•[0-9a-f]+(?:\\(\\w+\\))?`;
    return {
        chip: new RegExp(`Msg RX from ${fabricIndex}:[0-9A-F]{16} `),
        matterjs: new RegExp(`Message « for: .* id: ${session}|${session}⇵[0-9a-f]+ Ignore «`),
    };
}

/**
 * How step 8's post-removal write/read fails on a controller whose fabric the device removed, as
 * captured across all six CI legs. The in-process controller normally refuses locally: it reacts to
 * the device's Leave event by deleting the peer, so every later node operation reports
 * {@link NoCommissionedPeerError}. Leave processing is conditional on an active subscription, so a
 * controller that missed it instead attempts a connection the device no longer serves and surfaces a
 * {@link PeerCommunicationError} — the plan's own expected symptom ("TH_CR2 is no longer on the
 * network"). chip-tool reports a {@link ControllerCommandError} — its output cannot separate a failed
 * device interaction from every other command failure, so on those legs this only excludes a
 * controller that would not start or crashed — or a status the device answered with
 * ({@link StatusResponseError}). {@link ValidationError} is a {@link StatusResponseError} but is the
 * client's own encode-time rejection before anything goes on the wire, so it proves nothing here.
 * Anything else says nothing about the removal and must not pass the step.
 *
 * A status the device answered has to be one the removal explains. Once the fabric is gone the
 * controller's own access is gone with it, so `UnsupportedAccess` is that status (Matter Core
 * § 8.4.3.2); a device that answered `ConstraintError` or `InvalidCommand` processed the interaction
 * on a fabric it still honours and refused it for a reason of its own, which is the opposite of what
 * this step claims.
 */
export function isPostRemovalRefusal(error: unknown): boolean {
    if (error instanceof ValidationError) {
        return false;
    }
    if (error instanceof StatusResponseError) {
        return error.code === Status.UnsupportedAccess;
    }
    return (
        error instanceof NoCommissionedPeerError ||
        error instanceof PeerCommunicationError ||
        error instanceof ControllerCommandError
    );
}

/**
 * Whether `error` is a commissioner reporting that the device refused AddNOC because the fabric is
 * already on it. The in-process controller names that status ({@link DeviceAlreadyCommissionedToThisFabricError});
 * chip-tool reports every failure as a {@link ControllerCommandError}, so on that leg the device's own
 * log ({@link ADD_NOC_FABRIC_CONFLICT}) is what attributes the failure to the conflict.
 */
export function isFabricConflictRefusal(error: unknown): boolean {
    return error instanceof DeviceAlreadyCommissionedToThisFabricError || error instanceof ControllerCommandError;
}

/**
 * Checks the NOCResponse a RemoveFabric invoke returned (Matter Core § 11.18.6.10): `statusCode` must be
 * `NodeOperationalCertStatus.Ok`, and a `fabricIndex` it carries must name the removed fabric.
 * Returns what disqualifies `response`, or undefined for a success response.
 */
export function removeFabricResponseFailure(response: unknown, fabricIndex: number): string | undefined {
    if (typeof response !== "object" || response === null || !("statusCode" in response)) {
        return `expected a NOCResponse with a statusCode, got ${describeValue(response)}`;
    }
    const { statusCode } = response;
    if (statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
        return `NOCResponse statusCode is ${describeValue(statusCode)}, not Ok`;
    }
    if ("fabricIndex" in response && response.fabricIndex !== undefined && response.fabricIndex !== fabricIndex) {
        return `NOCResponse names fabricIndex ${describeValue(response.fabricIndex)}, not the removed ${fabricIndex}`;
    }
    return undefined;
}

/**
 * Records that no line `patterns` holds for `flavor` arrived at or after `from` while `window` elapsed.
 * The window is waited out before the buffer is read, because a message still on its way when the step
 * checks arrives after it. A log that ended by then fails the check: a device that stopped writing
 * shows no line either.
 */
export async function expectNoDeviceLog(
    log: LogFollower,
    flavor: LogFlavor,
    patterns: LogExpectPatterns,
    from: number,
    window: Duration,
): Promise<CheckRecord> {
    const family = flavorFamily(flavor);
    const pattern = family === undefined ? undefined : patterns[family];
    if (pattern === undefined) {
        return { type: "device-log", verdict: "unverified" };
    }

    await Time.sleep("device log absence window", window);
    await log.settled();

    const line = log.window(from, Number.MAX_SAFE_INTEGER).find(line => !line.synthetic && pattern.test(line.text));
    if (line !== undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: pattern.source,
            matched: line.text,
            logLine: line.index,
        };
    }
    if (log.closed) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: pattern.source,
            detail: `the log of "${log.name}" ended before the ${Duration.format(window)} window did`,
            logLine: from,
        };
    }
    return {
        type: "device-log",
        verdict: "pass",
        pattern: pattern.source,
        detail: `no match after line ${from} within ${Duration.format(window)}`,
        logLine: from,
    };
}

/**
 * The plan's outcome for a PASE attempt through a revoked window (TC-CADMIN-1.1/1.2 step 11): either no
 * `_matterc._udp` record for the window's discriminator exists, or the TH refused PASE. Passes when one of the two
 * observations does, and names both. `noRecord` is absent where the window's discriminator is unknown.
 */
export function eitherNoRecordOrNoPase(noRecord: CheckRecord | undefined, noPase: CheckRecord): CheckRecord {
    const pass = noRecord?.verdict === "pass" || noPase.verdict === "pass";
    return {
        type: "device-log",
        verdict: pass ? "pass" : "fail",
        detail:
            `mDNS: ${noRecord === undefined ? "not checked, the window's discriminator is unknown" : `${noRecord.verdict}, ${noRecord.detail}`}; ` +
            `PASE: ${noPase.verdict}, ${noPase.detail ?? noPase.matched}`,
        pattern: noPase.pattern,
        matched: noPase.matched,
        logLine: noPase.logLine,
    };
}

async function noRecordOrNoPase(th: CertDevice, discriminator: number | undefined, from: number) {
    const [noRecord, noPase] = await Promise.all([
        discriminator === undefined
            ? undefined
            : expectMdns({ commissioning: { discriminator } }, { commissionable: false }, { timeoutMs: 10_000 }),
        expectNoDeviceLog(th.log, th.flavor, PASE_ESTABLISHED, from, Millis(0)),
    ]);
    return eitherNoRecordOrNoPase(noRecord, noPase);
}

/**
 * The two commissioning methods a window can be opened with. Each test case pair (TC-CADMIN-1.1/1.2,
 * 1.17/1.18) is the same procedure once per method.
 */
export type CommissioningMethod = "enhanced" | "basic";

const METHODS = {
    enhanced: { abbreviation: "ECM", name: "Enhanced Commissioning Method", pics: "CADMIN.C.C00.Tx", capabilities: [] },
    basic: {
        abbreviation: "BCM",
        name: "Basic Commissioning Method",
        pics: "CADMIN.C.C01.Tx",
        capabilities: ["basic-commissioning-window"],
    },
} as const satisfies Record<
    CommissioningMethod,
    { abbreviation: string; name: string; pics: string; capabilities: readonly ControllerCapability[] }
>;

/** A window a step opened, with what the next commissioner needs to join through it. */
export interface OpenedWindow {
    target: CommissioningTarget;

    /**
     * The discriminator the window advertises under `_matterc._udp`: a fresh one for an enhanced window, read from
     * its QR pairing code, and the device's own for a basic window. Absent where the controller returned no QR code.
     */
    discriminator?: number;

    /** The device's own window-open line, absent where the running flavor has no pattern for it. */
    openLine?: LogLine;
}

/**
 * A one-shot slot for the window a later step commissions through: {@link require} clears it on read
 * so a commissioning attempt that throws can't leave a used window behind for a later step to pair
 * through instead of failing "the window-opening step must run first".
 */
export class PendingWindow {
    #window: OpenedWindow | undefined;

    set(window: OpenedWindow): void {
        this.#window = window;
    }

    /** The window without consuming it, for a step that only looks at its code. */
    peek(): OpenedWindow {
        if (this.#window === undefined) {
            throw new InternalError("No pending commissioning window; a commissioning-window step must run first");
        }
        return this.#window;
    }

    require(): OpenedWindow {
        const window = this.peek();
        this.#window = undefined;
        return window;
    }
}

/**
 * Has `opener` open a commissioning window on the TH with the plan's duration and records the device's
 * window-open line.
 *
 * An enhanced window carries a fresh passcode that only the returned pairing code holds. A basic window
 * reuses the device's own setup code (Matter Core § 5.6.2), so the next commissioner joins with the
 * device's own onboarding payload. A payload rather than the bare passcode and discriminator, because
 * chip-tool bounds its discovery only for a code (`pairing code`), and a step that expects the
 * commissioning to fail needs that bound.
 */
export async function openWindowChecked(
    cx: CertStepContext,
    opener: ControllerAdapter,
    ref: CertNodeRef,
    method: CommissioningMethod,
    who: string,
): Promise<OpenedWindow> {
    const th = cx.devices.th;
    const from = await th.log.markSettled();
    const enhanced = method === "enhanced";

    const { manualPairingCode, qrPairingCode } = await opener
        .node(ref)
        .openCommissioningWindow({ timeout: CW_DURATION_SECONDS, enhanced });

    let target: CommissioningTarget;
    let discriminator: number | undefined;
    if (enhanced) {
        if (manualPairingCode === undefined) {
            throw new InternalError("openCommissioningWindow({enhanced: true}) returned no manualPairingCode");
        }
        target = { manualPairingCode };
        discriminator = qrPairingCode === undefined ? undefined : qrPayloadFields(qrPairingCode).discriminator;
    } else {
        target = { qrPairingCode: await thQrPayload(th) };
        discriminator = th.commissioning.discriminator;
    }
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: enhanced
            ? `${who} opened an ECM window; manualPairingCode length=${manualPairingCode?.length}, ` +
              `discriminator ${discriminator ?? "not in a QR code"}`
            : `${who} opened a BCM window`,
    });

    const { check } = await expectDeviceLog(th.log, th.flavor, WINDOW_OPEN, from, LOG_TIMEOUT);
    record(cx, check, "Commissioning-window-open log");
    const openLine = check.logLine === undefined ? undefined : th.log.at(check.logLine);
    return { target, discriminator, openLine };
}

/** Reads VendorID back through `ref` as proof the just-commissioned CASE session actually works. */
export async function checkCommissioned(
    cx: CertStepContext,
    controller: ControllerAdapter,
    ref: CertNodeRef,
    who: string,
    logFrom: number,
): Promise<void> {
    const th = cx.devices.th;

    const vendorId = await controller
        .node(ref)
        .readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: VENDOR_ID.id });
    const pass = vendorId === 0xfff1;
    cx.recorder.check({
        type: "response",
        verdict: pass ? "pass" : "fail",
        detail: `${who} read VendorID = ${vendorId}`,
    });
    if (!pass) {
        throw new CertCheckFailedError(
            `${who}: expected VendorID 0xfff1 after commissioning, got ${JSON.stringify(vendorId)}`,
        );
    }

    const { check } = await expectDeviceLog(th.log, th.flavor, COMMISSIONING_COMPLETE, logFrom, LOG_TIMEOUT);
    record(cx, check, `Commissioning-complete log for ${who}`);
}

/** The fields of a `FabricDescriptorStruct` (Matter Core § 11.18.4.5) these cases read. */
interface FabricEntry {
    fabricIndex: number;
    label: string;
    rootPublicKey: Bytes;
    vendorId: number;
    fabricId: number | bigint;
    nodeId: number | bigint;
}

function isFabricEntry(entry: unknown): entry is FabricEntry {
    return (
        typeof entry === "object" &&
        entry !== null &&
        "fabricIndex" in entry &&
        "label" in entry &&
        "rootPublicKey" in entry &&
        "vendorId" in entry &&
        "fabricId" in entry &&
        "nodeId" in entry &&
        typeof entry.fabricIndex === "number" &&
        typeof entry.label === "string" &&
        Bytes.isBytes(entry.rootPublicKey) &&
        typeof entry.vendorId === "number" &&
        (typeof entry.fabricId === "number" || typeof entry.fabricId === "bigint") &&
        (typeof entry.nodeId === "number" || typeof entry.nodeId === "bigint")
    );
}

/** Every entry of the Fabrics attribute, not only the reader's own: the attribute is fabric-sensitive. */
export async function readFabrics(node: CertNodeApi): Promise<FabricEntry[]> {
    const value = await node.readAttribute(
        { endpoint: 0, cluster: OPERATIONAL_CREDENTIALS.id, attribute: FABRICS.id },
        { fabricFiltered: false },
    );
    if (!Array.isArray(value) || !value.every(isFabricEntry)) {
        throw new InternalError(
            `Expected the Fabrics attribute to read as a list of FabricDescriptorStruct entries, got ${describeValue(value)}`,
        );
    }
    return value;
}

function describeFabrics(fabrics: FabricEntry[]) {
    return fabrics
        .map(
            ({ label, fabricIndex, fabricId, nodeId, vendorId }) =>
                `${label}#${fabricIndex} fabricId=0x${fabricId.toString(16)} nodeId=0x${nodeId.toString(16)} ` +
                `vendorId=0x${vendorId.toString(16)}`,
        )
        .join(", ");
}

/**
 * The operational instance name the device advertises for `entry`'s fabric, computed from the entry's root public key,
 * fabric id and node id (Matter Core § 4.3.2.1).
 */
async function operationalInstanceNameOf(entry: FabricEntry): Promise<string> {
    const globalId = await GlobalFabricId.compute(
        Environment.default.get(Crypto),
        FabricId(entry.fabricId),
        entry.rootPublicKey,
    );
    return getOperationalDeviceQname(globalId, NodeId(entry.nodeId));
}

/** A controller's own fabric on the TH, as that controller knows it. */
export interface ControllerFabric {
    /** The fabric index the controller reads as `CurrentFabricIndex`. */
    fabricIndex: number;

    /** The operational instance name the controller reports for the node ({@link CertNodeApi.operationalMdnsInstanceName}). */
    instanceName: string;
}

/** What `controller` knows of its own fabric on the TH: the fabric index it reads and the instance name it reports. */
export async function controllerFabricOf(node: CertNodeApi): Promise<ControllerFabric> {
    return { fabricIndex: await readOwnFabricIndex(node), instanceName: await node.operationalMdnsInstanceName() };
}

/**
 * Has `who` read the Fabrics attribute and records that it lists exactly the fabrics of `expected`, and that each
 * entry's root public key, fabric id and node id produce the operational instance name its controller reports.
 *
 * That is the "commissioning information" the controllers can know: the root key and fabric id are the controller's
 * own, and the node id is the one it assigned. VendorID and Label are recorded but not compared, because no adapter
 * reports the values it sent.
 */
async function checkFabricList(
    cx: CertStepContext,
    reader: CertNodeApi,
    who: string,
    expected: Record<string, ControllerFabric>,
): Promise<void> {
    const fabrics = await readFabrics(reader);
    const mismatches = new Array<string>();
    if (fabrics.length !== Object.keys(expected).length) {
        mismatches.push(`expected ${Object.keys(expected).length} entries`);
    }
    for (const [role, { fabricIndex, instanceName }] of Object.entries(expected)) {
        const entry = fabrics.find(entry => entry.fabricIndex === fabricIndex);
        if (entry === undefined) {
            mismatches.push(`no entry for ${role}'s fabric index ${fabricIndex}`);
            continue;
        }
        const entryName = await operationalInstanceNameOf(entry);
        if (entryName !== instanceName) {
            mismatches.push(`${role}'s entry names ${entryName}, ${role} reports ${instanceName}`);
        }
    }
    record(
        cx,
        {
            type: "response",
            verdict: mismatches.length ? "fail" : "pass",
            detail:
                `${who} read ${fabrics.length} fabric(s): ${describeFabrics(fabrics)}; expected ` +
                Object.entries(expected)
                    .map(([role, { fabricIndex, instanceName }]) => `${role}#${fabricIndex} as ${instanceName}`)
                    .join(", ") +
                (mismatches.length ? `; ${mismatches.join("; ")}` : ""),
        },
        "Fabrics list",
    );
}

/**
 * Has `who` write `label` to the TH's NodeLabel and read it back, recording the TH receiving both
 * requests and the value read.
 */
async function writeAndReadNodeLabel(
    cx: CertStepContext,
    node: CertNodeApi,
    who: string,
    label: string,
): Promise<void> {
    const th = cx.devices.th;
    await withChecks(cx, async checks => {
        const writeFrom = await th.log.markSettled();
        const write = await attempt(
            () => node.writeAttribute(NODE_LABEL_PATH, label),
            () => `${who} wrote NodeLabel "${label}"`,
        );
        checks.push({ what: `${who} NodeLabel write`, check: () => write.check });
        const writeLog = await expectMessageWithPath(
            th.log,
            th.flavor,
            "write",
            NODE_LABEL_PATH,
            writeFrom,
            LOG_TIMEOUT,
        );
        checks.push({ what: "TH received the NodeLabel write", check: () => writeLog });
        if (!write.ok) {
            return;
        }

        await readNodeLabelChecked(cx, node, who, label, checks);
    });
}

/** Has `who` read NodeLabel, adding a check that it equals `expected` and one that the TH received the read. */
async function readNodeLabelChecked(
    cx: CertStepContext,
    node: CertNodeApi,
    who: string,
    expected: string,
    checks: RecordedCheck[],
): Promise<void> {
    const th = cx.devices.th;
    const readFrom = await th.log.markSettled();
    const read = await attempt(
        () => node.readAttribute(NODE_LABEL_PATH),
        value => `${who} read NodeLabel ${describeValue(value)}`,
    );
    const readLog = await expectAttributePathIB(th.log, th.flavor, NODE_LABEL_PATH, readFrom, LOG_TIMEOUT);
    checks.push({ what: "TH received the NodeLabel read", check: () => readLog });
    checks.push({
        what: `${who} NodeLabel read-back`,
        check: () =>
            read.ok && read.value !== expected
                ? { ...read.check, verdict: "fail", detail: `${read.check.detail}, expected "${expected}"` }
                : read.check,
    });
}

/** Has `who` read WindowStatus and records that the TH reports no open window. */
async function checkWindowNotOpen(cx: CertStepContext, node: CertNodeApi, who: string): Promise<void> {
    const status = await node.readAttribute(WINDOW_STATUS_PATH);
    record(
        cx,
        {
            type: "response",
            verdict: status === WINDOW_NOT_OPEN ? "pass" : "fail",
            detail: `${who} read WindowStatus ${describeValue(status)}, expected WindowNotOpen (${WINDOW_NOT_OPEN})`,
        },
        "WindowStatus",
    );
}

/**
 * The plan writes `FabricIndex = 2` into step 7; the fabric index is derived from TH_CR2's own read
 * instead and compared with the plan's value, which holds for a dut→th_cr2→th_cr3 commissioning order.
 */
const EXPECTED_CR2_FABRIC_INDEX = 2;

/**
 * Must outlast the slowest controller's own give-up: chip-tool retries operational discovery for a
 * node it can no longer reach for ~45s ("Checking node lookup status ... after 45025 ms") before
 * failing the command, which is longer than its 20s ModelCommand wait because the wait starts after
 * resolution. A budget under that reports "neither resolved nor rejected" for a controller that was
 * about to reject.
 */
const POST_REMOVAL_TIMEOUT = Seconds(60);

/** The step texts 1.17 and 1.18 word differently beyond the method's name. */
interface FabricRemovalTexts {
    step6: string;
    step9: string;
    step11Expected: string;
    step13: string;
}

const FABRIC_REMOVAL_TEXTS: Record<CommissioningMethod, FabricRemovalTexts> = {
    enhanced: {
        step6: "DUT_CR1 sends command to TH_CE to read the list of Fabrics",
        step9: "DUT_CR1 sends command to TH_CE to read the list of Fabrics on TH_CE",
        step11Expected:
            "TH_CE opens its Commissioning window to allow a second commissioning and verify success response on DUT_CR1",
        step13: "TH_CR2 sends command to TH_CE to read the list of Fabrics on TH_CE",
    },
    basic: {
        step6: "DUT_CR1 sends command to TH_CE to read the list of Fabrics on TH_CE",
        step9: "DUT_CR1 sends command to TH_CE to read the list of Fabrics",
        step11Expected: "TH_CE opens its Commissioning window to allow a second commissioning",
        step13: "TH_CR2 sends command to TH_CE to read the list of Fabrics",
    },
};

/**
 * Registers TC-CADMIN-1.17 (`enhanced`) or TC-CADMIN-1.18 (`basic`): the DUT commissions the TH and
 * opens windows for two more commissioners, removes one of their fabrics, and opens a window for it to
 * join again.
 */
export function fabricRemovalCase(tc: string, method: CommissioningMethod): void {
    type Role = "dut" | "th_cr2" | "th_cr3";
    const { abbreviation, pics: windowPics, capabilities } = METHODS[method];
    const texts = FABRIC_REMOVAL_TEXTS[method];
    const openWindowText = `DUT_CR1 sends command to TH_CE to open a commissioning window with a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ${abbreviation}`;

    const commissioned = new CommissionedRefs<Role>();
    const pendingWindow = new PendingWindow();
    let cr2FabricIndex: number | undefined;
    // Captured in step 7 while TH_CR2 can still be asked: chip-tool derives the name from a live fabric
    // read, and the in-process controller deletes the peer once the device announces the removal.
    let cr2OperationalInstanceName: string | undefined;
    // Set only once step 7's log checks confirm TH_CE actually removed th_cr2's fabric — until then
    // `commissioned` keeps owning th_cr2, so an inconclusive check leaves the finalizer able to
    // decommission it. Step 8 needs this ref to reach the now-decommissioned node.
    let removedCr2Ref: CertNodeRef | undefined;

    const openWindow = async (cx: CertStepContext) => {
        pendingWindow.set(
            await openWindowChecked(cx, cx.controllers.dut, commissioned.require("dut"), method, "DUT_CR1"),
        );
    };

    const commissionThrough = (role: "th_cr2" | "th_cr3", who: string) => async (cx: CertStepContext) => {
        const controller = cx.controllers[role];
        const { target } = pendingWindow.require();
        const from = await cx.devices.th.log.markSettled();
        const ref = await controller.commission(target);
        commissioned.set(role, ref);
        await checkCommissioned(cx, controller, ref, who, from);
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

                const dutRef = await dut.commission({
                    passcode: th.commissioning.passcode,
                    discriminator: th.commissioning.discriminator,
                });
                commissioned.set("dut", dutRef);
                await checkCommissioned(cx, dut, dutRef, "DUT_CR1", from);
            },
            { pics: "CADMIN.C", expected: "TH_CE is commissioned by DUT_CR1" },
        )
        .step(2, openWindowText, openWindow, {
            pics: windowPics,
            expected: "TH_CE opens its Commissioning window to allow a second commissioning",
        })
        .step(3, "TH_CR2 starts a commissioning process with TH_CE", commissionThrough("th_cr2", "TH_CR2"), {
            pics: "CADMIN.C",
            expected: "TH_CE is commissioned by TH_CR2",
        })
        .step(4, openWindowText, openWindow, {
            pics: windowPics,
            expected: "TH_CE opens its Commissioning window to allow commissioning",
        })
        .step(5, "TH_CR3 starts a commissioning process with TH_CE", commissionThrough("th_cr3", "TH_CR3"), {
            pics: "CADMIN.C",
            expected: "TH_CE is commissioned by TH_CR3",
        })
        .step(
            6,
            texts.step6,
            async cx => {
                const dut = cx.controllers.dut;
                const dutRef = commissioned.require("dut");

                const fabrics = await readFabrics(dut.node(dutRef));
                cr2FabricIndex = await readOwnFabricIndex(cx.controllers.th_cr2.node(commissioned.require("th_cr2")));
                if (!fabrics.some(entry => entry.fabricIndex === cr2FabricIndex)) {
                    throw new CertCheckFailedError(
                        `TH_CR2 reports fabric index ${cr2FabricIndex}, absent from DUT_CR1's own read: ` +
                            describeFabrics(fabrics),
                    );
                }

                const pass = fabrics.length === 3;
                cx.recorder.check({
                    type: "response",
                    verdict: pass ? "pass" : "fail",
                    detail: `${fabrics.length} fabrics; th_cr2 fabricIndex=${cr2FabricIndex}`,
                });
                if (!pass) {
                    throw new CertCheckFailedError(`Expected 3 fabrics (dut, th_cr2, th_cr3), got ${fabrics.length}`);
                }
            },
            { pics: "OPCREDS.C.A0001", expected: "Verify TH_CE receives and processes the command successfully" },
        )
        .step(
            7,
            `DUT_CR1 sends RemoveFabric with FabricIndex = ${EXPECTED_CR2_FABRIC_INDEX} command to TH_CE`,
            async cx => {
                const dut = cx.controllers.dut;
                const th = cx.devices.th;
                const dutRef = commissioned.require("dut");

                if (cr2FabricIndex === undefined) {
                    throw new InternalError("th_cr2's fabricIndex was not captured; step 6 must run first");
                }
                const fabricIndex = cr2FabricIndex;

                cx.recorder.check({
                    type: "response",
                    verdict: fabricIndex === EXPECTED_CR2_FABRIC_INDEX ? "pass" : "fail",
                    detail: `th_cr2 fabricIndex=${fabricIndex} (plan assumes ${EXPECTED_CR2_FABRIC_INDEX} for a dut→th_cr2→th_cr3 commissioning order)`,
                });
                if (fabricIndex !== EXPECTED_CR2_FABRIC_INDEX) {
                    throw new CertCheckFailedError(
                        `th_cr2's fabricIndex was ${fabricIndex}, not the plan's assumed ${EXPECTED_CR2_FABRIC_INDEX}`,
                    );
                }

                cr2OperationalInstanceName = await cx.controllers.th_cr2
                    .node(commissioned.require("th_cr2"))
                    .operationalMdnsInstanceName();

                const from = await th.log.markSettled();
                const response = await dut.node(dutRef).invoke("OperationalCredentials", "removeFabric", {
                    fabricIndex,
                });

                const responseFailure = removeFabricResponseFailure(response, fabricIndex);
                cx.recorder.check({
                    type: "response",
                    verdict: responseFailure === undefined ? "pass" : "fail",
                    detail: responseFailure ?? `NOCResponse statusCode Ok for fabricIndex ${fabricIndex}`,
                });
                if (responseFailure !== undefined) {
                    throw new CertCheckFailedError(`RemoveFabric did not answer with success: ${responseFailure}`);
                }

                await withChecks(cx, async checks => {
                    const removed = await expectDeviceLog(
                        th.log,
                        th.flavor,
                        removeFabricSucceeded(fabricIndex),
                        from,
                        LOG_TIMEOUT,
                    );
                    checks.push({ check: () => removed.check, what: "RemoveFabric-successful log" });

                    // From the step's mark: matter.js ends the sessions before it answers, chip after. The
                    // step drives the only removal after that mark, and on chip only this line names the fabric.
                    const expiring = await expectDeviceLog(
                        th.log,
                        th.flavor,
                        fabricSessionsEnded(fabricIndex),
                        from,
                        LOG_TIMEOUT,
                    );
                    checks.push({ check: () => expiring.check, what: '"Expiring all sessions" log' });
                });

                // Only surrender th_cr2 to step 8 once every check above confirms TH_CE actually removed
                // it. Clearing any earlier left `commissioned` with no owner for a fabric that (per an
                // ambiguous or timed-out check) might still be live.
                removedCr2Ref = commissioned.require("th_cr2");
                commissioned.clear("th_cr2");
            },
            {
                pics: "OPCREDS.C.C0a.Tx",
                expected: `Verify TH_CE responses with "RemoveFabric successful" and "Expiring all sessions for fabric 0x${EXPECTED_CR2_FABRIC_INDEX}"`,
            },
        )
        .step(
            8,
            "TH_CR2 sends command to TH_CE to write and read the Basic Information Cluster's NodeLabel mandatory attribute",
            async cx => {
                const th_cr2 = cx.controllers.th_cr2;
                if (removedCr2Ref === undefined) {
                    throw new InternalError("Step ran before TH_CR2's fabric was removed");
                }
                const node = th_cr2.node(removedCr2Ref);

                const writeCheck = await expectRejection(
                    "writeAttribute(NodeLabel)",
                    node.writeAttribute(NODE_LABEL_PATH, "post-removal"),
                    POST_REMOVAL_TIMEOUT,
                    isPostRemovalRefusal,
                );
                cx.recorder.check(writeCheck);

                const readCheck = await expectRejection(
                    "readAttribute(NodeLabel)",
                    node.readAttribute(NODE_LABEL_PATH),
                    POST_REMOVAL_TIMEOUT,
                    isPostRemovalRefusal,
                );
                cx.recorder.check(readCheck);

                if (writeCheck.verdict !== "pass" || readCheck.verdict !== "pass") {
                    // A failed step can't vouch the fabric is gone — a call that succeeded even proves it
                    // outlived RemoveFabric — so cleanup owns it again.
                    commissioned.set("th_cr2", removedCr2Ref);
                    throw new CertCheckFailedError(
                        `Expected both write and read to fail post-removal: ${JSON.stringify({ writeCheck, readCheck })}`,
                    );
                }
            },
            {
                pics: "BINFO.C.A0005",
                expected: "Verify read/write commands fail as expected since the TH_CR2 is no longer on the network",
            },
        )
        .step(
            9,
            texts.step9,
            async cx => {
                const dut = cx.controllers.dut;
                const dutRef = commissioned.require("dut");

                if (cr2FabricIndex === undefined) {
                    throw new InternalError("Step ran before TH_CR2's own fabric index was read");
                }
                const removedIndex = cr2FabricIndex;

                const fabrics = await readFabrics(dut.node(dutRef));
                const pass = fabrics.length === 2 && !fabrics.some(entry => entry.fabricIndex === removedIndex);
                cx.recorder.check({
                    type: "response",
                    verdict: pass ? "pass" : "fail",
                    detail:
                        `${fabrics.length} fabrics after removing index ${removedIndex}: ` +
                        fabrics.map(entry => entry.fabricIndex).join(", "),
                });
                if (!pass) {
                    throw new CertCheckFailedError(
                        `Expected 2 fabrics with index ${removedIndex} (TH_CR2) removed, got ` +
                            describeFabrics(fabrics),
                    );
                }
            },
            { pics: "OPCREDS.C.A0001", expected: "Verify TH_CE receives and processes the command successfully" },
        )
        .step(
            10,
            "Verify TH_CE is now discoverable over DNS-SD with 2 Operational service records (_matter._tcp SRV records)",
            async cx => {
                const dut = cx.controllers.dut;
                const th_cr3 = cx.controllers.th_cr3;
                const th = cx.devices.th;
                const dutRef = commissioned.require("dut");
                const cr3Ref = commissioned.require("th_cr3");

                if (cr2OperationalInstanceName === undefined) {
                    throw new InternalError("Step ran before TH_CR2's operational instance name was captured");
                }

                const [dutInstanceName, cr3InstanceName] = await Promise.all([
                    dut.node(dutRef).operationalMdnsInstanceName(),
                    th_cr3.node(cr3Ref).operationalMdnsInstanceName(),
                ]);

                // Counting only the survivors' records leaves the removed fabric's — the record this step
                // exists to prove withdrawn — invisible, so its absence is checked by name alongside.
                const [survivors, removedGone] = await Promise.all([
                    expectMdns(
                        th,
                        { operationalRecords: 2 },
                        { timeoutMs: 20_000, operationalInstanceName: [dutInstanceName, cr3InstanceName] },
                    ),
                    expectMdns(
                        th,
                        { operationalRecords: 0 },
                        { timeoutMs: 10_000, operationalInstanceName: cr2OperationalInstanceName },
                    ),
                ]);
                await recordAll(cx, [
                    { check: () => survivors, what: "Exactly 2 operational mDNS records (dut + th_cr3)" },
                    { check: () => removedGone, what: "No operational mDNS record for the removed fabric (th_cr2)" },
                ]);
            },
            {
                expected:
                    "Verify TH_CE is now discoverable over DNS-SD with 2 Operational service records (_matter._tcp SRV records)",
            },
        )
        .step(11, openWindowText, openWindow, { pics: windowPics, expected: texts.step11Expected })
        .step(12, "TH_CR2 starts a commissioning process with TH_CE", commissionThrough("th_cr2", "TH_CR2"), {
            pics: "CADMIN.C",
            expected: "TH_CE is commissioned by TH_CR2",
        })
        .step(
            13,
            texts.step13,
            async cx => {
                const th_cr2 = cx.controllers.th_cr2;
                const th_cr2Ref = commissioned.require("th_cr2");

                const fabrics = await readFabrics(th_cr2.node(th_cr2Ref));
                const pass = fabrics.length === 3;
                cx.recorder.check({
                    type: "response",
                    verdict: pass ? "pass" : "fail",
                    detail: `${fabrics.length} fabrics: ${describeFabrics(fabrics)}`,
                });
                if (!pass) {
                    throw new CertCheckFailedError(
                        `Expected 3 fabrics after th_cr2 re-commissioned, got ${fabrics.length}`,
                    );
                }
            },
            { pics: "OPCREDS.C.A0001", expected: "Verify TH_CE receives and processes the command successfully" },
        )
        .finalize(cx => commissioned.decommissionAll(cx));
}

/** How long step 8 watches the TH for a message from the controller that was turned off. */
const TURNED_OFF_WINDOW = Seconds(10);

/**
 * Inserts dashes and a space into an 11-digit manual pairing code, as step 3.b asks: `XXXX-XXX XXXX`.
 */
export function withDashesAndSpaces(code: string): string {
    if (!/^\d{11}$/.test(code)) {
        throw new InternalError(`Expected an 11-digit manual pairing code, got "${code}"`);
    }
    return `${code.slice(0, 4)}-${code.slice(4, 7)} ${code.slice(7)}`;
}

/**
 * Registers TC-CADMIN-1.1 (`enhanced`) or TC-CADMIN-1.2 (`basic`): TH_CR1 commissions the TH and opens a
 * window for the DUT, which joins as a second administrator, takes over after TH_CR1 is turned off, and
 * then opens, revokes and lets expire windows of its own.
 *
 * "Turn off TH_CR1" (step 8) has to leave TH_CR1 able to commission again in step 16, where the TH
 * refuses it as a fabric it already holds. TH_CR1 is therefore commissioned without a subscription of
 * its own, so between commands it sends the TH nothing — which is what step 8 verifies on the TH — and
 * the controller and its fabric survive until step 16.
 */
export function administratorBehaviorCase(tc: string, method: CommissioningMethod): void {
    type Role = "th_cr1" | "dut" | "th_cr3";
    const { abbreviation, name: methodName, pics: windowPics, capabilities } = METHODS[method];
    const enhanced = method === "enhanced";

    const commissioned = new CommissionedRefs<Role>();
    const refusals = new CommissioningRefusals<Role>();
    const pendingWindow = new PendingWindow();
    let cr1Fabric: ControllerFabric | undefined;
    let enteredCode: string | undefined;
    let expiringWindow: OpenedWindow | undefined;

    const requireCr1Fabric = () => {
        if (cr1Fabric === undefined) {
            throw new InternalError("TH_CR1's fabric was not read; step 3 must run first");
        }
        return cr1Fabric;
    };

    const dutOpensWindow = async (cx: CertStepContext) =>
        openWindowChecked(cx, cx.controllers.dut, commissioned.require("dut"), method, "DUT_CR2");

    const builder = certTest(tc, {
        plan: "multiplefabrics.adoc",
        pics: ["CADMIN.C", windowPics],
        app: "all-clusters",
        controllers: { th_cr1: "helper", dut: "dut", th_cr3: "helper" },
        controllerCapabilities: capabilities,
    })
        .step(
            1,
            "TH_CR1 starts a commissioning process with TH_CE",
            async cx => {
                const th_cr1 = cx.controllers.th_cr1;
                const th = cx.devices.th;
                const from = await th.log.markSettled();

                const ref = await th_cr1.commission({
                    passcode: th.commissioning.passcode,
                    discriminator: th.commissioning.discriminator,
                    withoutSubscription: true,
                });
                commissioned.set("th_cr1", ref);
                await checkCommissioned(cx, th_cr1, ref, "TH_CR1", from);
            },
            { pics: "CADMIN.C", expected: "TH_CE is commissioned by TH_CR1" },
        )
        .step(
            2,
            `TH_CR1 sends command to TH_CE to open a commissioning window with a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ${abbreviation} (${methodName})${enhanced ? "." : ""}`,
            async cx => {
                const th_cr1 = cx.controllers.th_cr1;
                const ref = commissioned.require("th_cr1");
                // Opening a window without a subscription needs the root endpoint read first (`withoutSubscription`).
                await th_cr1.node(ref).readAttribute({ endpoint: 0 });
                pendingWindow.set(await openWindowChecked(cx, th_cr1, ref, method, "TH_CR1"));
            },
            { pics: windowPics, expected: "TH_CE opens its Commissioning window to allow a second commissioning" },
        )
        .step(
            enhanced ? "3.a" : 3,
            "TH_CR1 sends command to TH_CE to read the list of Fabrics",
            async cx => {
                const node = cx.controllers.th_cr1.node(commissioned.require("th_cr1"));
                cr1Fabric = await controllerFabricOf(node);
                await checkFabricList(cx, node, "TH_CR1", { th_cr1: cr1Fabric });
            },
            {
                pics: "OPCREDS.C.A0001",
                expected:
                    "Verify TH_CE reports 1 entry in the Fabrics list attribute, and that this entry matches the first commissioning's information.",
            },
        );

    if (enhanced) {
        builder.step(
            "3.b",
            "Introduce dashes and spaces into the 11 digit Manual Code provided in step 2 and enter it in the userinterfacedisplay of DUT_CR2",
            async cx => {
                const dut = cx.controllers.dut;
                const { target } = pendingWindow.peek();
                if (target.manualPairingCode === undefined) {
                    throw new InternalError("Step 2's window carries no manual pairing code");
                }
                const entered = withDashesAndSpaces(target.manualPairingCode);
                enteredCode = entered;
                const [plain, formatted] = await Promise.all([
                    dut.parseManualPairingCode(target.manualPairingCode),
                    dut.parseManualPairingCode(entered),
                ]);
                const same =
                    formatted.passcode === plain.passcode && formatted.shortDiscriminator === plain.shortDiscriminator;
                record(
                    cx,
                    {
                        type: "response",
                        verdict: same ? "pass" : "fail",
                        detail: `DUT_CR2 read "${entered}" as ${describeValue(formatted)}, the code without dashes and spaces as ${describeValue(plain)}`,
                    },
                    "Manual code with dashes and spaces",
                );
            },
            {
                pics: "CADMIN.M.UserInterfaceDisplay",
                controllerCapabilities: PARSES_PAYLOAD,
                expected: "Verify that Manual Code entered in DUT_CR2 contains dashes and spaces",
            },
        );
    }

    builder
        .step(
            "4.a",
            "DUT_CR2 starts a commissioning process with TH_CE",
            async cx => {
                const dut = cx.controllers.dut;
                const th = cx.devices.th;
                const { target } = pendingWindow.require();
                const from = await th.log.markSettled();
                const ref = await dut.commission(
                    enteredCode === undefined ? target : { manualPairingCode: enteredCode },
                );
                commissioned.set("dut", ref);
                await checkCommissioned(cx, dut, ref, "DUT_CR2", from);
                record(
                    cx,
                    (await expectDeviceLog(th.log, th.flavor, PASE_ESTABLISHED, from, LOG_TIMEOUT)).check,
                    "TH_CE logs the PASE session it accepted, which step 11 looks for",
                );
            },
            { pics: "CADMIN.C", expected: "TH_CE is commissioned by DUT_CR2" },
        )
        .step("4.b", "Verify TH_CE is now discoverable over DNS-SD with two SRV Records", async cx => {
            const names = await Promise.all([
                cx.controllers.th_cr1.node(commissioned.require("th_cr1")).operationalMdnsInstanceName(),
                cx.controllers.dut.node(commissioned.require("dut")).operationalMdnsInstanceName(),
            ]);
            record(
                cx,
                await expectMdns(
                    cx.devices.th,
                    { operationalRecords: 2 },
                    { timeoutMs: 20_000, operationalInstanceName: names },
                ),
                "Two operational mDNS records (th_cr1 + dut)",
            );
        })
        .step(
            "4.c",
            "DUT_CR2 sends command to TH_CE to write and read the Basic Information Cluster's NodeLabel mandatory attribute",
            cx =>
                writeAndReadNodeLabel(
                    cx,
                    cx.controllers.dut.node(commissioned.require("dut")),
                    "DUT_CR2",
                    "dut-cr2-4c",
                ),
            { pics: "BINFO.C.A0005", expected: "Verify TH_CE successfully receives the read and write commands" },
        )
        .step(
            5,
            `DUT_CR2 sends command to TH_CE to read the list of Fabrics${enhanced ? "" : " on TH_CE"}`,
            async cx => {
                const node = cx.controllers.dut.node(commissioned.require("dut"));
                await checkFabricList(cx, node, "DUT_CR2", {
                    th_cr1: requireCr1Fabric(),
                    dut: await controllerFabricOf(node),
                });
            },
            {
                pics: "OPCREDS.C.A0001",
                expected:
                    "Verify TH_CE reports 2 entries in the Fabrics list attribute, and that these entries match the commissioning state to date.",
            },
        )
        .step(
            6,
            "TH_CR1 sends command to TH_CE to write and read the Basic Information Cluster's NodeLabel mandatory attribute",
            async cx => {
                const th = cx.devices.th;
                const from = await th.log.markSettled();
                await writeAndReadNodeLabel(
                    cx,
                    cx.controllers.th_cr1.node(commissioned.require("th_cr1")),
                    "TH_CR1",
                    "th-cr1-6",
                );
                record(
                    cx,
                    (
                        await expectDeviceLog(
                            th.log,
                            th.flavor,
                            messageReceivedOnFabric(requireCr1Fabric().fabricIndex),
                            from,
                            LOG_TIMEOUT,
                        )
                    ).check,
                    "TH_CE logs TH_CR1's messages by its fabric index, which step 8 looks for",
                );
            },
            { pics: "BINFO.C.A0005", expected: "Verify TH_CE successfully receives the read and write commands" },
        )
        .step(
            7,
            "DUT_CR2 sends command to TH_CE to read, write and then read the Basic Information Cluster's NodeLabel mandatory attribute",
            async cx => {
                const node = cx.controllers.dut.node(commissioned.require("dut"));
                await withChecks(cx, checks => readNodeLabelChecked(cx, node, "DUT_CR2", "th-cr1-6", checks));
                await writeAndReadNodeLabel(cx, node, "DUT_CR2", "dut-cr2-7");
            },
            {
                pics: "BINFO.C.A0005",
                expected: `Verify TH_CE successfully receives ${enhanced ? "" : "all "}the read and write commands. Verify the initial read reflect the value written in the above step. Verify the subsequent write/read are successful.`,
            },
        )
        .step(
            8,
            "Turn off TH_CR1",
            async cx => {
                const th = cx.devices.th;
                const from = await th.log.markSettled();
                record(
                    cx,
                    await expectNoDeviceLog(
                        th.log,
                        th.flavor,
                        messageReceivedOnFabric(requireCr1Fabric().fabricIndex),
                        from,
                        TURNED_OFF_WINDOW,
                    ),
                    "No message from TH_CR1's fabric",
                );
            },
            { expected: "Verify no interactions are received by TH_CE from TH_CR1" },
        )
        .step(
            9,
            `DUT_CR2 sends command to TH_CE to open a commissioning window ${enhanced ? "using" : "with"} a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ${abbreviation} (${methodName})`,
            async cx => pendingWindow.set(await dutOpensWindow(cx)),
            {
                pics: windowPics,
                expected: `${enhanced ? "Verify " : ""}TH_CE opens its Commissioning window to allow a new commissioning`,
            },
        )
        .step(
            10,
            "DUT_CR2 sends command to TH_CE to revoke the commissioning window using the `Revoke Commissioning` command",
            async cx => {
                const th = cx.devices.th;
                const node = cx.controllers.dut.node(commissioned.require("dut"));
                const from = await th.log.markSettled();
                await withChecks(cx, async checks => {
                    const revoke = await attempt(
                        () =>
                            node.invoke("AdministratorCommissioning", "revokeCommissioning", {}, 0, {
                                timedInteractionTimeoutMs: REVOKE_TIMED_INTERACTION_MS,
                            }),
                        () => "DUT_CR2's RevokeCommissioning answered with success",
                    );
                    checks.push({ what: "RevokeCommissioning", check: () => revoke.check });
                    const closed = await expectDeviceLog(th.log, th.flavor, WINDOW_CLOSED, from, LOG_TIMEOUT);
                    checks.push({ what: "Commissioning-window-closed log", check: () => closed.check });
                });
                await checkWindowNotOpen(cx, node, "DUT_CR2");
            },
            {
                pics: "CADMIN.C.C02.Tx",
                expected: `${enhanced ? "Verify " : ""}TH_CE closes its commissioning window`,
            },
        )
        .step(
            11,
            "TH_CR3 attempts to execute a PASE to starts a commissioning process with TH_CE",
            async cx => {
                const th = cx.devices.th;
                const th_cr3 = cx.controllers.th_cr3;
                const { target, discriminator } = pendingWindow.require();
                const chipTool = cx.controllerSelection.helper === "chip-tool";
                const from = await th.log.markSettled();
                const cr3From = await th_cr3.log.markSettled();

                const commissioning = th_cr3.commission({ ...target, giveUpAfterMs: ABSENT_DEVICE_GIVE_UP });
                refusals.track(commissioning, "th_cr3");
                const refused = await expectRejection(
                    `TH_CR3 commissioning through the revoked window`,
                    commissioning,
                    ABSENT_DEVICE_WAIT,
                    isCommissioningGiveUp,
                );
                const checks: RecordedCheck[] = [
                    { what: "TH_CR3 could not commission", check: () => refused },
                    {
                        what: "No commissionable record for the window's discriminator, or TH_CE refused PASE",
                        check: () => noRecordOrNoPase(th, discriminator, from),
                    },
                ];
                if (chipTool) {
                    checks.push({
                        what: "chip-tool gave up on discovery",
                        check: () => chipToolDiscoveryGaveUp(th_cr3.log, cr3From),
                    });
                }
                await recordAll(cx, checks);
            },
            {
                pics: "CADMIN.C",
                expected:
                    "Verify that either no `_matterc._udp` commissionable records exist matching the previously obtained discriminator, or that TH_CE refuses to allow a PASE with the provided passcode from the onboarding payload.",
            },
        )
        .step(
            12,
            "DUT_CR2 sends command to TH_CE to write and read the Basic Information Cluster's NodeLabel mandatory attribute",
            cx =>
                writeAndReadNodeLabel(
                    cx,
                    cx.controllers.dut.node(commissioned.require("dut")),
                    "DUT_CR2",
                    "dut-cr2-12",
                ),
            { pics: "BINFO.C.A0005", expected: "Verify TH_CE successfully receives the read and write commands" },
        )
        .step(
            13,
            `DUT_CR2 sends command to TH_CE to open a commissioning window using ${abbreviation}`,
            async cx => {
                expiringWindow = await dutOpensWindow(cx);
            },
            { pics: windowPics, expected: "TH_CE opens its Commissioning window to allow a new commissioning" },
        )
        .step(
            14,
            "Wait for commissioning window that was opened in step 13 to timeout",
            async cx => {
                const th = cx.devices.th;
                if (expiringWindow === undefined) {
                    throw new InternalError("Step 13 opened no window");
                }
                const { openLine } = expiringWindow;
                if (openLine === undefined) {
                    record(
                        cx,
                        {
                            type: "device-log",
                            verdict: "unverified",
                            detail: `the ${th.flavor} TH logged no window-open line, so the window's lifetime has no start`,
                        },
                        "Window lifetime",
                    );
                    return;
                }
                const latest = Millis(Seconds(CW_DURATION_SECONDS) + CW_CLOCK_ALLOWANCE);
                const earliest = Millis(Seconds(CW_DURATION_SECONDS) - CW_CLOCK_ALLOWANCE);
                const remaining = Millis(Math.max(0, openLine.receivedAt + latest - performance.now()));
                const closed = await expectDeviceLog(
                    th.log,
                    th.flavor,
                    WINDOW_CLOSED,
                    openLine.index + 1,
                    Millis(remaining + LOG_TIMEOUT),
                );
                const closedLine = closed.check.logLine === undefined ? undefined : th.log.at(closed.check.logLine);
                const lifetime =
                    closedLine === undefined ? undefined : Millis(closedLine.receivedAt - openLine.receivedAt);
                await recordAll(cx, [
                    { what: "Commissioning-window-closed log", check: () => closed.check },
                    {
                        what: "Window lifetime",
                        check: () => ({
                            type: "device-log",
                            verdict:
                                lifetime !== undefined && lifetime >= earliest && lifetime <= latest ? "pass" : "fail",
                            detail:
                                "the TH's window-closed line arrived " +
                                (lifetime === undefined ? "never" : `${Duration.format(lifetime)} after`) +
                                ` its window-open line; the plan allows ${Duration.format(earliest)} to ` +
                                Duration.format(latest),
                            logLine: closed.check.logLine,
                        }),
                    },
                ]);
                await checkWindowNotOpen(cx, cx.controllers.dut.node(commissioned.require("dut")), "DUT_CR2");
            },
            {
                pics: enhanced ? undefined : windowPics,
                expected: "Commissioning window opened in the above step should get closed (Timedout)",
            },
        )
        .step(
            15,
            `DUT_CR2 sends command to TH_CE to open a commissioning window using ${abbreviation}`,
            async cx => pendingWindow.set(await dutOpensWindow(cx)),
            { pics: windowPics, expected: "TH_CE opens its Commissioning window to allow a new commissioning" },
        )
        .step(
            16,
            "TH_CR1 starts a commissioning process with TH_CE before the timeout from step 15",
            async cx => {
                const th = cx.devices.th;
                const th_cr1 = cx.controllers.th_cr1;
                const { target } = pendingWindow.require();
                const from = await th.log.markSettled();

                const commissioning = th_cr1.commission({ ...target, withoutSubscription: true });
                refusals.track(commissioning, "th_cr1");
                const refused = await expectRejection(
                    "TH_CR1 commissioning a second time",
                    commissioning,
                    ABSENT_DEVICE_WAIT,
                    isFabricConflictRefusal,
                );
                await recordAll(cx, [
                    { what: "TH_CR1 could not commission again", check: () => refused },
                    {
                        what: "TH_CE answered AddNOC with FabricConflict",
                        check: async () =>
                            (await expectDeviceLog(th.log, th.flavor, ADD_NOC_FABRIC_CONFLICT, from, LOG_TIMEOUT))
                                .check,
                    },
                ]);
            },
            {
                pics: "CADMIN.C",
                expected:
                    'Verify TH_CE shows OperationalCert error code 9 response "Trying to add a NOC for a fabric that already exists" as TH_CR1 already commissioned TH_CE in step 1',
            },
        )
        .finalize(cx =>
            runCleanups(
                () => refusals.settle(cx),
                () => commissioned.decommissionAll(cx),
            ),
        );
}
