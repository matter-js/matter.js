/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    CommissionedRefs,
    describeValue,
    expectCommandInvoke,
    expectSequence,
    LOG_TIMEOUT,
    record,
    requireId,
} from "./tc-support.js";

const TBRM = Matter.clusters.require("ThreadBorderRouterManagement");
const TBRM_ID = requireId(TBRM.id, "ThreadBorderRouterManagement cluster");

/** chip's network-manager app puts ThreadBorderRouterManagement on endpoint 1. */
const ENDPOINT = 1;

/** GeneralCommissioning is a root-node cluster. */
const ROOT_ENDPOINT = 0;

/** The value CHIP's own TBRM YAML cases send; both set commands are timed (Cluster § 10.3.6.4, § 10.3.6.5). */
const TIMED_INTERACTION_TIMEOUT = Seconds(2);

/** `PIXIT.TBRM.THREAD_ACTIVE_DATASET`, as CHIP's TC-TBRM-2.2/2.3 define it. */
const ACTIVE_DATASET = Bytes.fromHex(
    "0e080000000000010000000300001235060004001fffe002082ad51c02fe8f64f20708fddb8af85255f93a051083e2b9b2cc609b" +
        "00125adbf823ea2ab20102c4d904100a133626c411d7de02a570ca3c3d80470c0402a0f7f8031054687265616441637469766554" +
        "657374",
);

/**
 * CHIP's `PIXIT.TBRM.THREAD_PENDING_DATASET` from TC-TBRM-2.3, with its Delay Timer TLV (`34 04 …`) raised
 * from 20 seconds to 300. The TH makes a pending dataset active once that timer runs out, which would change
 * what steps 3 and 4 read back.
 */
const PENDING_DATASET = Bytes.fromHex(
    "0e080000000000020000330800000000000100003404000493e035060004001fffe002082ad51c02fe8f64f20708fddb8af852" +
        "55f93a051083e2b9b2cc609b00125adbf823ea2ab20102c4d904100a133626c411d7de02a570ca3c3d80470c0402a0f7f8030d" +
        "54687265616450656e64696e67000300000c",
);

const FAIL_SAFE_SECONDS = 60;
const BREADCRUMB = 2;

const commissioned = new CommissionedRefs();

function commandId(commandName: string): number {
    return requireId(TBRM.commands.require(commandName).id, `ThreadBorderRouterManagement.${commandName}`);
}

/** The `ErrorCode` a GeneralCommissioning response carries, or `undefined` where it carries none. */
function errorCodeOf(response: unknown): number | undefined {
    if (typeof response !== "object" || response === null || !("errorCode" in response)) {
        return undefined;
    }
    return typeof response.errorCode === "number" ? response.errorCode : undefined;
}

/** The `Dataset` a `DatasetResponse` carries, or `undefined` where it carries none. */
function datasetOf(response: unknown): Bytes | undefined {
    if (typeof response !== "object" || response === null || !("dataset" in response)) {
        return undefined;
    }
    return Bytes.isBytes(response.dataset) ? response.dataset : undefined;
}

async function invokeGeneralCommissioning(cx: CertStepContext, ref: CertNodeRef, commandName: string, args: object) {
    let response: unknown;
    try {
        response = await cx.controllers.dut.node(ref).invoke("GeneralCommissioning", commandName, args, ROOT_ENDPOINT);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: `${commandName}: ${String(e)}` });
        throw e;
    }

    const errorCode = errorCodeOf(response);
    record(
        cx,
        {
            type: "response",
            verdict: errorCode === 0 ? "pass" : "fail",
            detail:
                errorCode === undefined
                    ? `${commandName} answered ${describeValue(response)}, which carries no ErrorCode`
                    : `${commandName} ErrorCode=${errorCode}`,
        },
        `GeneralCommissioning.${commandName} response`,
    );
}

/**
 * Invokes `commandName` on the TH's ThreadBorderRouterManagement cluster and verifies the TH's own log recorded
 * it. Returns the response and the log line of the command's `CommandId`, which the command's fields follow.
 */
async function invokeAndCheck(
    cx: CertStepContext,
    ref: CertNodeRef,
    commandName: string,
    args: object,
    timed: boolean,
): Promise<{ response: unknown; commandLine?: number }> {
    const th = cx.devices.th;
    const from = th.log.mark();

    let response: unknown;
    try {
        response = await cx.controllers.dut
            .node(ref)
            .invoke(
                "ThreadBorderRouterManagement",
                commandName,
                args,
                ENDPOINT,
                timed ? { timedInteractionTimeoutMs: TIMED_INTERACTION_TIMEOUT } : undefined,
            );
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: `${commandName}: ${String(e)}` });
        throw e;
    }
    cx.recorder.check({ type: "response", verdict: "pass", detail: `${commandName} invoke succeeded` });

    const logCheck = await expectCommandInvoke(
        th.log,
        th.flavor,
        ENDPOINT,
        TBRM_ID,
        commandId(commandName),
        [],
        from,
        LOG_TIMEOUT,
    );
    record(cx, logCheck, `CommandDataIB log for ThreadBorderRouterManagement.${commandName}`);

    return { response, commandLine: logCheck.logLine };
}

/**
 * The lines chip prints for an octet-string command field: its id opening a list, every byte on the next line,
 * and the byte count closing it. The byte line fits because CHIP's Linux and macOS builds with detail logging
 * allow a 1708-character log line (`chip_log_message_max_size` in `src/lib/core/core.gni`).
 */
function chipOctetStringField(id: number, bytes: Bytes): RegExp[] {
    const rendered = Array.from(Bytes.of(bytes), byte => `0x${byte.toString(16).padStart(2, "0")}, `).join("");
    return [
        new RegExp(`0x${id.toString(16)} = \\[\\s*$`),
        new RegExp(`\\s${rendered}\\s*$`),
        new RegExp(`\\] \\(${Bytes.of(bytes).byteLength} bytes\\),?\\s*$`),
    ];
}

/**
 * Checks that the TH's log carries `fields` as the `CommandFields` of the command logged at `commandLine`,
 * consecutively and in order, so they cannot be read from any other message.
 */
async function expectCommandFields(
    cx: CertStepContext,
    commandLine: number | undefined,
    label: string,
    fields: RegExp[],
) {
    const th = cx.devices.th;
    if (commandLine === undefined) {
        record(
            cx,
            { type: "device-log", verdict: "fail", detail: "the command itself was not found in the TH log" },
            label,
        );
        return;
    }
    const lines = [/CommandFields =\s*$/, /\{\s*$/, ...fields];
    record(cx, await expectSequence(th.log, th.flavor, label, { chip: lines }, commandLine + 1, LOG_TIMEOUT), label);
}

/** Checks that a `DatasetResponse` returns the dataset an earlier step set. */
function expectDataset(cx: CertStepContext, commandName: string, response: unknown, expected: Bytes) {
    const dataset = datasetOf(response);
    record(
        cx,
        {
            type: "response",
            verdict: dataset !== undefined && Bytes.areEqual(dataset, expected) ? "pass" : "fail",
            detail:
                dataset === undefined
                    ? `${commandName} answered ${describeValue(response)}, which carries no Dataset`
                    : `${commandName} Dataset=${Bytes.toHex(dataset)}, expected ${Bytes.toHex(expected)}`,
        },
        `ThreadBorderRouterManagement.${commandName} dataset`,
    );
}

certTest("TC-TBRM-3.1", {
    plan: "thread_border_router_management.adoc",
    pics: ["TBRM.C"],
    app: "network-manager",

    // matter.js has no border-router test device, and no chip-docker per-app image exists for any app, so
    // only a chip-local network-manager app can be the TH.
    flavors: ["chip-local"],
})
    .step(
        "0",
        "Preconditions: the DUT commissions the TH.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);
        },
        { expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE." },
    )
    .step(
        1,
        "In a CASE session, DUT sends SetActiveDatasetRequest to TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            // The TH refuses SetActiveDatasetRequest with FAILSAFE_REQUIRED unless a fail-safe is armed.
            // CommissioningComplete closes it, as a border router that reverts on expiry would need.
            await invokeGeneralCommissioning(cx, ref, "armFailSafe", {
                expiryLengthSeconds: FAIL_SAFE_SECONDS,
                breadcrumb: 1,
            });

            const { commandLine } = await invokeAndCheck(
                cx,
                ref,
                "setActiveDatasetRequest",
                { activeDataset: ACTIVE_DATASET, breadcrumb: BREADCRUMB },
                true,
            );
            await expectCommandFields(
                cx,
                commandLine,
                "SetActiveDatasetRequest ActiveDataset (ID 0), Breadcrumb (ID 1)",
                [...chipOctetStringField(0, ACTIVE_DATASET), new RegExp(`0x1 = ${BREADCRUMB} \\(unsigned\\),\\s*$`)],
            );

            await invokeGeneralCommissioning(cx, ref, "commissioningComplete", {});
        }),
        {
            pics: "TBRM.C.C03.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x03 whose CommandFields carry the ActiveDataset and " +
                "Breadcrumb the DUT sent.",
        },
    )
    .step(
        2,
        "In a CASE session, DUT sends SetPendingDatasetRequest to TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { commandLine } = await invokeAndCheck(
                cx,
                ref,
                "setPendingDatasetRequest",
                { pendingDataset: PENDING_DATASET },
                true,
            );
            await expectCommandFields(
                cx,
                commandLine,
                "SetPendingDatasetRequest PendingDataset (ID 0)",
                chipOctetStringField(0, PENDING_DATASET),
            );
        }),
        {
            pics: "TBRM.C.C04.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x04 whose CommandFields carry the PendingDataset " +
                "the DUT sent.",
        },
    )
    .step(
        3,
        "In a CASE session, DUT sends GetActiveDatasetRequest to TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { response } = await invokeAndCheck(cx, ref, "getActiveDatasetRequest", {}, false);
            expectDataset(cx, "getActiveDatasetRequest", response, ACTIVE_DATASET);
        }),
        {
            pics: "TBRM.C.C00.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x00. Beyond the plan, the DUT reads back the active " +
                "dataset step 1 set.",
        },
    )
    .step(
        4,
        "In a CASE session, DUT sends GetPendingDatasetRequest to TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { response } = await invokeAndCheck(cx, ref, "getPendingDatasetRequest", {}, false);
            expectDataset(cx, "getPendingDatasetRequest", response, PENDING_DATASET);
        }),
        {
            pics: "TBRM.C.C01.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x01. Beyond the plan, the DUT reads back the pending " +
                "dataset step 2 set.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
