/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Time } from "@matter/main";
import { Matter } from "@matter/model";
import type {
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    LogExpectPatterns,
    LogFollower,
} from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError, certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { CommissionedRefs, PendingPairingCode } from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const VENDOR_ID = BASIC_INFORMATION.attributes.require("vendorId");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const FABRICS = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");

const CW_DURATION_SECONDS = 180;
const EXPECTED_CR2_FABRIC_INDEX = 2;
const POST_REMOVAL_TIMEOUT_MS = 25_000;

const WINDOW_OPEN_PATTERN = /Commissioning window is now open/;
const COMMISSIONING_COMPLETE_PATTERN = /Commissioning completed successfully/;
const REMOVE_FABRIC_SUCCESS_PATTERN = /OpCreds: RemoveFabric successful/;

type Role = "dut" | "th_cr2" | "th_cr3";

const commissioned = new CommissionedRefs<Role>();
const pendingPairingCode = new PendingPairingCode();
let cr2FabricIndex: number | undefined;
// TH_CE removed this fabric itself in step 7, so it is no longer the finalizer's to decommission —
// but step 8 still needs the ref to prove its sessions are gone.
let removedCr2Ref: CertNodeRef | undefined;

interface FabricEntry {
    fabricIndex: number;
    label: string;
}

function isFabricEntry(entry: unknown): entry is FabricEntry {
    return (
        typeof entry === "object" &&
        entry !== null &&
        "fabricIndex" in entry &&
        "label" in entry &&
        typeof entry.fabricIndex === "number" &&
        typeof entry.label === "string"
    );
}

function asFabricEntries(value: unknown[]): FabricEntry[] {
    if (!value.every(isFabricEntry)) {
        throw new InternalError(
            `Expected Fabrics attribute entries with fabricIndex/label, got ${describeFabrics(value)}`,
        );
    }
    return value;
}

/**
 * The Fabrics attribute is fabric-scoped, so this read must not be fabric-filtered: a
 * multi-controller TC needs to see (and label-match) fabrics the reading controller didn't itself
 * create.
 */
async function readFabrics(node: CertNodeApi): Promise<FabricEntry[]> {
    const value = await node.readAttribute(
        { endpoint: 0, cluster: OPERATIONAL_CREDENTIALS.id, attribute: FABRICS.id },
        { fabricFiltered: false },
    );
    if (!Array.isArray(value)) {
        throw new InternalError(`Expected the Fabrics attribute to read as a list, got ${describeFabrics(value)}`);
    }
    return asFabricEntries(value);
}

// A FabricDescriptorStruct's nodeId/fabricId fields decode to bigint, which JSON.stringify cannot
// serialize on its own — every diagnostic below that stringifies a fabric list needs this replacer.
function describeFabrics(fabrics: unknown): string {
    return JSON.stringify(fabrics, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

interface DeviceLogCheck {
    check: CheckRecord;
    /** Cursor a subsequent, causally-later log check should search from. */
    from: number;
}

/**
 * Runs a single-pattern {@link LogFollower.expect} and converts every outcome (match, timeout, or a
 * closed follower) into a {@link CheckRecord} instead of letting the latter two propagate as thrown
 * errors — mirrors `TC-ACT-3.2.test.ts`'s identical `CertLogTimeoutError`/`CertLogClosedError` handling,
 * so a timed-out or closed-mid-wait check still lands in the evidence bundle rather than vanishing.
 */
async function expectDeviceLog(
    log: LogFollower,
    flavor: string,
    patterns: LogExpectPatterns,
    from: number,
    timeoutMs: number,
): Promise<DeviceLogCheck> {
    try {
        const result = await log.expect(patterns, { flavor, timeoutMs, from });
        if (result.verdict === "unverified") {
            return { check: { type: "device-log", verdict: "unverified" }, from };
        }
        return {
            check: {
                type: "device-log",
                verdict: "pass",
                pattern: result.pattern,
                matched: result.matched.text,
                logLine: result.matched.index,
            },
            from: result.matched.index + 1,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError) {
            return { check: { type: "device-log", verdict: "fail", pattern: e.pattern, detail: e.message }, from };
        }
        if (e instanceof CertLogClosedError) {
            return { check: { type: "device-log", verdict: "fail", detail: e.message }, from };
        }
        throw e;
    }
}

/** Reads VendorID back through `ref` as proof the just-commissioned CASE session actually works. */
async function checkCommissioned(
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
        throw new Error(`${who}: expected VendorID 0xfff1 after commissioning, got ${JSON.stringify(vendorId)}`);
    }

    const { check } = await expectDeviceLog(
        th.log,
        th.flavor,
        { chip: COMMISSIONING_COMPLETE_PATTERN },
        logFrom,
        15_000,
    );
    cx.recorder.check(check);
    if (check.verdict === "fail") {
        throw new Error(`Commissioning-complete log check failed for ${who}: ${JSON.stringify(check)}`);
    }
}

/** DUT_CR1 opens an enhanced commissioning window and stashes the manual pairing code for the next step. */
async function openWindowAndCheck(cx: CertStepContext): Promise<void> {
    const dut = cx.controllers.dut;
    const th = cx.devices.th;
    const dutRef = commissioned.require("dut");
    const from = th.log.mark();

    const { manualPairingCode } = await dut
        .node(dutRef)
        .openCommissioningWindow({ timeout: CW_DURATION_SECONDS, enhanced: true });
    if (manualPairingCode === undefined) {
        throw new InternalError("openCommissioningWindow({enhanced: true}) returned no manualPairingCode");
    }
    pendingPairingCode.set(manualPairingCode);
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: `manualPairingCode length=${manualPairingCode.length}`,
    });

    const { check } = await expectDeviceLog(th.log, th.flavor, { chip: WINDOW_OPEN_PATTERN }, from, 15_000);
    cx.recorder.check(check);
    if (check.verdict === "fail") {
        throw new Error(`Commissioning-window-open log check failed: ${JSON.stringify(check)}`);
    }
}

type SettleOutcome = { kind: "resolved" } | { kind: "rejected"; error: unknown } | { kind: "timeout" };

function settled(promise: Promise<unknown>): Promise<SettleOutcome> {
    return promise.then(
        (): SettleOutcome => ({ kind: "resolved" }),
        (error: unknown): SettleOutcome => ({ kind: "rejected", error }),
    );
}

/**
 * Asserts `op` rejects (the TH_CR2-post-removal expectation) rather than resolves, bounded by
 * {@link POST_REMOVAL_TIMEOUT_MS} so a session that neither errors nor times out at the transport layer
 * can't hang this step for the full mocha timeout. `settled()` attaches its handlers before the race
 * starts, so a late resolution/rejection after the timeout branch wins is still observed, just not
 * awaited — no unhandled-rejection risk.
 */
async function expectRejection(label: string, op: Promise<unknown>): Promise<CheckRecord> {
    const start = Time.nowMs;
    const timeout = Time.sleep("TC-CADMIN-1.17 post-removal check timeout", Millis(POST_REMOVAL_TIMEOUT_MS));
    let outcome: SettleOutcome;
    try {
        outcome = await Promise.race([settled(op), timeout.then((): SettleOutcome => ({ kind: "timeout" }))]);
    } finally {
        // A lost race leaves the sleep armed for its full duration, keeping the process alive past teardown
        timeout.cancel();
    }
    const elapsed = Duration.format(Millis(Time.nowMs - start));

    switch (outcome.kind) {
        case "resolved":
            return { type: "response", verdict: "fail", detail: `${label} unexpectedly succeeded after ${elapsed}` };
        case "timeout":
            return {
                type: "response",
                verdict: "fail",
                detail: `${label} neither resolved nor rejected within ${Duration.format(Millis(POST_REMOVAL_TIMEOUT_MS))}`,
            };
        case "rejected": {
            const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
            return { type: "response", verdict: "pass", detail: `${label} rejected after ${elapsed}: ${message}` };
        }
    }
}

certTest("TC-CADMIN-1.17", {
    plan: "multiplefabrics.adoc",
    pics: ["CADMIN.C", "CADMIN.C.C00.Tx"],
    app: "all-clusters",
    controllers: { dut: "dut", th_cr2: "helper", th_cr3: "helper" },
})
    .step(
        1,
        "DUT_CR1 starts a commissioning process with TH_CE",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;
            const from = th.log.mark();

            const dutRef = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", dutRef);
            await checkCommissioned(cx, dut, dutRef, "DUT_CR1", from);
        },
        { pics: "CADMIN.C", expected: "TH_CE is commissioned by DUT_CR1" },
    )
    .step(
        2,
        `DUT_CR1 sends command to TH_CE to open a commissioning window with a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ECM`,
        openWindowAndCheck,
        { pics: "CADMIN.C.C00.Tx", expected: "TH_CE opens its Commissioning window to allow a second commissioning" },
    )
    .step(
        3,
        "TH_CR2 starts a commissioning process with TH_CE",
        async cx => {
            const th_cr2 = cx.controllers.th_cr2;
            const th = cx.devices.th;
            const manualPairingCode = pendingPairingCode.require();
            const from = th.log.mark();

            const th_cr2Ref = await th_cr2.commission({ manualPairingCode });
            commissioned.set("th_cr2", th_cr2Ref);
            await checkCommissioned(cx, th_cr2, th_cr2Ref, "TH_CR2", from);
        },
        { pics: "CADMIN.C", expected: "TH_CE is commissioned by TH_CR2" },
    )
    .step(
        4,
        `DUT_CR1 sends command to TH_CE to open a commissioning window with a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ECM`,
        openWindowAndCheck,
        { pics: "CADMIN.C.C00.Tx", expected: "TH_CE opens its Commissioning window to allow commissioning" },
    )
    .step(
        5,
        "TH_CR3 starts a commissioning process with TH_CE",
        async cx => {
            const th_cr3 = cx.controllers.th_cr3;
            const th = cx.devices.th;
            const manualPairingCode = pendingPairingCode.require();
            const from = th.log.mark();

            const th_cr3Ref = await th_cr3.commission({ manualPairingCode });
            commissioned.set("th_cr3", th_cr3Ref);
            await checkCommissioned(cx, th_cr3, th_cr3Ref, "TH_CR3", from);
        },
        { pics: "CADMIN.C", expected: "TH_CE is commissioned by TH_CR3" },
    )
    .step(
        6,
        "DUT_CR1 sends command to TH_CE to read the list of Fabrics",
        async cx => {
            const dut = cx.controllers.dut;
            const dutRef = commissioned.require("dut");

            const fabrics = await readFabrics(dut.node(dutRef));
            const cr2Entry = fabrics.find(entry => entry.label === "th_cr2");
            if (!cr2Entry) {
                throw new Error(`Expected a fabric entry labeled "th_cr2", got ${describeFabrics(fabrics)}`);
            }
            cr2FabricIndex = cr2Entry.fabricIndex;

            const pass = fabrics.length === 3;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${fabrics.length} fabrics; th_cr2 fabricIndex=${cr2FabricIndex}`,
            });
            if (!pass) {
                throw new Error(`Expected 3 fabrics (dut, th_cr2, th_cr3), got ${fabrics.length}`);
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
                throw new Error(
                    `th_cr2's fabricIndex was ${fabricIndex}, not the plan's assumed ${EXPECTED_CR2_FABRIC_INDEX}`,
                );
            }

            const from = th.log.mark();
            await dut.node(dutRef).invoke("OperationalCredentials", "removeFabric", { fabricIndex });
            removedCr2Ref = commissioned.require("th_cr2");
            commissioned.clear("th_cr2");

            const removed = await expectDeviceLog(
                th.log,
                th.flavor,
                { chip: REMOVE_FABRIC_SUCCESS_PATTERN },
                from,
                15_000,
            );
            cx.recorder.check(removed.check);
            if (removed.check.verdict === "fail") {
                throw new Error(`RemoveFabric-successful log check failed: ${JSON.stringify(removed.check)}`);
            }

            const expiringPattern = new RegExp(`Expiring all sessions for fabric 0x${fabricIndex.toString(16)}!!`);
            const expiring = await expectDeviceLog(th.log, th.flavor, { chip: expiringPattern }, removed.from, 15_000);
            cx.recorder.check(expiring.check);
            if (expiring.check.verdict === "fail") {
                throw new Error(`"Expiring all sessions" log check failed: ${JSON.stringify(expiring.check)}`);
            }
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
            const path = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id };

            const writeCheck = await expectRejection(
                "writeAttribute(NodeLabel)",
                node.writeAttribute(path, "post-removal"),
            );
            cx.recorder.check(writeCheck);

            const readCheck = await expectRejection("readAttribute(NodeLabel)", node.readAttribute(path));
            cx.recorder.check(readCheck);

            if (writeCheck.verdict !== "pass" || readCheck.verdict !== "pass") {
                // A call that succeeded proves the fabric outlived RemoveFabric, so cleanup owns it again.
                commissioned.set("th_cr2", removedCr2Ref);
                throw new Error(
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
        "DUT_CR1 sends command to TH_CE to read the list of Fabrics on TH_CE",
        async cx => {
            const dut = cx.controllers.dut;
            const dutRef = commissioned.require("dut");

            const fabrics = await readFabrics(dut.node(dutRef));
            const stillHasCr2 = fabrics.some(entry => entry.label === "th_cr2");
            const pass = fabrics.length === 2 && !stillHasCr2;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${fabrics.length} fabrics after removal: ${fabrics.map(entry => entry.label).join(", ")}`,
            });
            if (!pass) {
                throw new Error(
                    `Expected 2 fabrics (dut, th_cr3) with th_cr2 removed, got ${describeFabrics(fabrics)}`,
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

            const [dutInstanceName, cr3InstanceName] = await Promise.all([
                dut.node(dutRef).operationalMdnsInstanceName(),
                th_cr3.node(cr3Ref).operationalMdnsInstanceName(),
            ]);

            const result = await expectMdns(
                th,
                { operationalRecords: 2 },
                { timeoutMs: 20_000, operationalInstanceName: [dutInstanceName, cr3InstanceName] },
            );
            cx.recorder.check(result);
            if (result.verdict !== "pass") {
                throw new Error(
                    `Expected exactly 2 operational mDNS records (dut + th_cr3), got ${JSON.stringify(result)}`,
                );
            }
        },
        {
            expected:
                "Verify TH_CE is now discoverable over DNS-SD with 2 Operational service records (_matter._tcp SRV records)",
        },
    )
    .step(
        11,
        `DUT_CR1 sends command to TH_CE to open a commissioning window with a commissioning timeout of ${CW_DURATION_SECONDS} seconds using ECM`,
        openWindowAndCheck,
        {
            pics: "CADMIN.C.C00.Tx",
            expected:
                "TH_CE opens its Commissioning window to allow a second commissioning and verify success response on DUT_CR1",
        },
    )
    .step(
        12,
        "TH_CR2 starts a commissioning process with TH_CE",
        async cx => {
            const th_cr2 = cx.controllers.th_cr2;
            const th = cx.devices.th;
            const manualPairingCode = pendingPairingCode.require();
            const from = th.log.mark();

            const th_cr2Ref = await th_cr2.commission({ manualPairingCode });
            commissioned.set("th_cr2", th_cr2Ref);
            await checkCommissioned(cx, th_cr2, th_cr2Ref, "TH_CR2", from);
        },
        { pics: "CADMIN.C", expected: "TH_CE is commissioned by TH_CR2" },
    )
    .step(
        13,
        "TH_CR2 sends command to TH_CE to read the list of Fabrics on TH_CE",
        async cx => {
            const th_cr2 = cx.controllers.th_cr2;
            const th_cr2Ref = commissioned.require("th_cr2");

            const fabrics = await readFabrics(th_cr2.node(th_cr2Ref));
            const pass = fabrics.length === 3;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${fabrics.length} fabrics: ${fabrics.map(entry => `${entry.label}#${entry.fabricIndex}`).join(", ")}`,
            });
            if (!pass) {
                throw new Error(`Expected 3 fabrics after th_cr2 re-commissioned, got ${fabrics.length}`);
            }
        },
        { pics: "OPCREDS.C.A0001", expected: "Verify TH_CE receives and processes the command successfully" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
