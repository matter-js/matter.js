/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeApi, CertNodeRef, CertStepContext, ControllerAdapter } from "@matter/testing";
import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    expectDeviceLog,
    expectRejection,
    LOG_TIMEOUT,
    MATTERJS_COMMISSIONED_FABRIC,
    PendingPairingCode,
    record,
} from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const VENDOR_ID = BASIC_INFORMATION.attributes.require("vendorId");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const FABRICS = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");
const CURRENT_FABRIC_INDEX = OPERATIONAL_CREDENTIALS.attributes.require("currentFabricIndex");

const CW_DURATION_SECONDS = 180;
const EXPECTED_CR2_FABRIC_INDEX = 2;
// Must outlast the slowest controller's own give-up: chip-tool retries operational discovery for a
// node it can no longer reach for ~45s ("Checking node lookup status ... after 45025 ms") before
// failing the command, which is longer than its 20s ModelCommand wait because the wait starts after
// resolution. A budget under that reports "neither resolved nor rejected" for a controller that was
// about to reject.
const POST_REMOVAL_TIMEOUT = Seconds(60);

const WINDOW_OPEN_PATTERN = /Commissioning window is now open/;
const COMMISSIONING_COMPLETE_PATTERN = /Commissioning completed successfully/;
const REMOVE_FABRIC_SUCCESS_PATTERN = /OpCreds: RemoveFabric successful/;

// matter.js names the window by the timer it arms for it.
const MATTERJS_WINDOW_OPEN_PATTERN = /AdministratorCommissioningServer Commissioning window timer started/;

// The invoke's own answer, which names the fabric it removed and the status it answered with, where
// chip logs an unqualified success line.
function matterjsRemoveFabricPattern(fabricIndex: number): RegExp {
    return new RegExp(`operationalCredentials\\.removeFabric .*statusCode: 0 fabricIndex: ${fabricIndex}(?!\\d)`);
}

// A session is named `@<fabricIndex>:<fabricId>•<id>`, so this is chip's "Expiring all sessions for
// fabric N" — the removed fabric's sessions going away — as matter.js reports it, one line per session.
function matterjsSessionEndedPattern(fabricIndex: number): RegExp {
    return new RegExp(`Session @${fabricIndex}:[0-9a-f]+•[0-9a-f]+ Session ended`);
}

type Role = "dut" | "th_cr2" | "th_cr3";

const commissioned = new CommissionedRefs<Role>();
const pendingPairingCode = new PendingPairingCode();
let cr2FabricIndex: number | undefined;
// Set only once step 7's log checks confirm TH_CE actually removed th_cr2's fabric — until then
// `commissioned` keeps owning th_cr2, so an inconclusive check leaves the finalizer able to
// decommission it. Step 8 needs this ref to reach the now-decommissioned node.
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
 * The fabric index the TH assigned to `node`'s own controller, read over that controller's own session
 * — the only discriminator every controller has without setup. A fabric's `Label` is empty until an
 * admin writes one (Core § 11.18.6.2) and the plan's own `FabricIndex = 2` assumes commissioning order,
 * so neither identifies a fabric for a harness that must work with any controller implementation.
 */
async function readOwnFabricIndex(node: CertNodeApi): Promise<number> {
    const value = await node.readAttribute({
        endpoint: 0,
        cluster: OPERATIONAL_CREDENTIALS.id,
        attribute: CURRENT_FABRIC_INDEX.id,
    });
    if (typeof value !== "number") {
        throw new InternalError(`Expected CurrentFabricIndex to read as a number, got ${JSON.stringify(value)}`);
    }
    return value;
}

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
        throw new CertCheckFailedError(
            `${who}: expected VendorID 0xfff1 after commissioning, got ${JSON.stringify(vendorId)}`,
        );
    }

    const { check } = await expectDeviceLog(
        th.log,
        th.flavor,
        { chip: COMMISSIONING_COMPLETE_PATTERN, matterjs: MATTERJS_COMMISSIONED_FABRIC },
        logFrom,
        LOG_TIMEOUT,
    );
    record(cx, check, `Commissioning-complete log for ${who}`);
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

    const { check } = await expectDeviceLog(
        th.log,
        th.flavor,
        { chip: WINDOW_OPEN_PATTERN, matterjs: MATTERJS_WINDOW_OPEN_PATTERN },
        from,
        LOG_TIMEOUT,
    );
    record(cx, check, "Commissioning-window-open log");
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

            const from = th.log.mark();
            await dut.node(dutRef).invoke("OperationalCredentials", "removeFabric", { fabricIndex });

            const removed = await expectDeviceLog(
                th.log,
                th.flavor,
                { chip: REMOVE_FABRIC_SUCCESS_PATTERN, matterjs: matterjsRemoveFabricPattern(fabricIndex) },
                from,
                LOG_TIMEOUT,
            );
            record(cx, removed.check, "RemoveFabric-successful log");

            // Searched from the step's own mark, not from the line above: matter.js closes the removed
            // fabric's sessions before it answers the invoke, chip after. Both patterns name the fabric
            // index, and the mark precedes this step's removal, so neither can match another removal's.
            const expiringPattern = new RegExp(`Expiring all sessions for fabric 0x${fabricIndex.toString(16)}!!`);
            const expiring = await expectDeviceLog(
                th.log,
                th.flavor,
                { chip: expiringPattern, matterjs: matterjsSessionEndedPattern(fabricIndex) },
                from,
                LOG_TIMEOUT,
            );
            record(cx, expiring.check, '"Expiring all sessions" log');

            // Only surrender th_cr2 to step 8 once both checks above confirm TH_CE actually removed
            // it — invoke() resolving only means the peer accepted the interaction, not that
            // NOCsResponse carried success. Clearing any earlier left `commissioned` with no owner
            // for a fabric that (per an ambiguous or timed-out log check) might still be live.
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
            const path = { endpoint: 0, cluster: BASIC_INFORMATION.id, attribute: NODE_LABEL.id };

            const writeCheck = await expectRejection(
                "writeAttribute(NodeLabel)",
                node.writeAttribute(path, "post-removal"),
                POST_REMOVAL_TIMEOUT,
            );
            cx.recorder.check(writeCheck);

            const readCheck = await expectRejection(
                "readAttribute(NodeLabel)",
                node.readAttribute(path),
                POST_REMOVAL_TIMEOUT,
            );
            cx.recorder.check(readCheck);

            if (writeCheck.verdict !== "pass" || readCheck.verdict !== "pass") {
                // A call that succeeded proves the fabric outlived RemoveFabric, so cleanup owns it again.
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
        "DUT_CR1 sends command to TH_CE to read the list of Fabrics on TH_CE",
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
                    `Expected 2 fabrics with index ${removedIndex} (TH_CR2) removed, got ` + describeFabrics(fabrics),
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
            record(cx, result, "Exactly 2 operational mDNS records (dut + th_cr3)");
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
                throw new CertCheckFailedError(
                    `Expected 3 fabrics after th_cr2 re-commissioned, got ${fabrics.length}`,
                );
            }
        },
        { pics: "OPCREDS.C.A0001", expected: "Verify TH_CE receives and processes the command successfully" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
