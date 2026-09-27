/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue, InvokedCommand, RecordedCheck } from "./tc-support.js";
import { attempt, CommissionedRefs, describeValue, invokeCommand, recordAll, withChecks } from "./tc-support.js";

const TBRM = Matter.clusters.require("ThreadBorderRouterManagement");

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

/** Whether the command succeeded, with the check that says so. */
interface GeneralCommissioningOutcome {
    ok: boolean;
    check: RecordedCheck;
}

async function invokeGeneralCommissioning(
    cx: CertStepContext,
    ref: CertNodeRef,
    commandName: string,
    args: object,
): Promise<GeneralCommissioningOutcome> {
    const what = `GeneralCommissioning.${commandName} response`;
    const invoked = await attempt(
        () => cx.controllers.dut.node(ref).invoke("GeneralCommissioning", commandName, args, ROOT_ENDPOINT),
        () => `${commandName} answered`,
    );
    if (!invoked.ok) {
        const failed: CheckRecord = { ...invoked.check, detail: `${commandName}: ${invoked.check.detail}` };
        return { ok: false, check: { what, check: () => failed } };
    }

    const errorCode = errorCodeOf(invoked.value);
    const answered: CheckRecord = {
        type: "response",
        verdict: errorCode === 0 ? "pass" : "fail",
        detail:
            errorCode === undefined
                ? `${commandName} answered ${describeValue(invoked.value)}, which carries no ErrorCode`
                : `${commandName} ErrorCode=${errorCode}`,
    };
    return { ok: errorCode === 0, check: { what, check: () => answered } };
}

/** Has the DUT invoke `command` on the TH's ThreadBorderRouterManagement cluster; see {@link invokeCommand}. */
function invokeTbrm(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    args: object,
    fields: CommandFieldValue[],
    timed: boolean,
): Promise<InvokedCommand> {
    return invokeCommand(cx, ref, {
        cluster: TBRM,
        endpoint: ENDPOINT,
        command,
        args,
        fields,
        describe: () => `${command} invoke succeeded`,
        options: timed ? { timedInteractionTimeoutMs: TIMED_INTERACTION_TIMEOUT } : undefined,
    });
}

/** Checks that a `DatasetResponse` returns the dataset an earlier step set. */
function expectDataset(commandName: string, response: unknown, expected: Bytes): RecordedCheck {
    const dataset = datasetOf(response);
    const check: CheckRecord = {
        type: "response",
        verdict: dataset !== undefined && Bytes.areEqual(dataset, expected) ? "pass" : "fail",
        detail:
            dataset === undefined
                ? `${commandName} answered ${describeValue(response)}, which carries no Dataset`
                : `${commandName} Dataset=${Bytes.toHex(dataset)}, expected ${Bytes.toHex(expected)}`,
    };
    return { what: `ThreadBorderRouterManagement.${commandName} dataset`, check: () => check };
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
        commissioned.withRef("dut", async (cx, ref) =>
            withChecks(cx, async checks => {
                // The TH refuses SetActiveDatasetRequest with FAILSAFE_REQUIRED unless a fail-safe is armed.
                // CommissioningComplete closes it, as a border router that reverts on expiry would need.
                const armed = await invokeGeneralCommissioning(cx, ref, "armFailSafe", {
                    expiryLengthSeconds: FAIL_SAFE_SECONDS,
                    breadcrumb: 1,
                });
                checks.push(armed.check);

                // Without an armed fail-safe the TH refuses both commands below, which says nothing new
                if (armed.ok) {
                    const set = await invokeTbrm(
                        cx,
                        ref,
                        "setActiveDatasetRequest",
                        { activeDataset: ACTIVE_DATASET, breadcrumb: BREADCRUMB },
                        [
                            { id: 0, value: ACTIVE_DATASET },
                            { id: 1, value: BREADCRUMB },
                        ],
                        true,
                    );
                    checks.push(...set.checks);

                    const completed = await invokeGeneralCommissioning(cx, ref, "commissioningComplete", {});
                    checks.push(completed.check);
                }
            }),
        ),
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
            const { checks } = await invokeTbrm(
                cx,
                ref,
                "setPendingDatasetRequest",
                { pendingDataset: PENDING_DATASET },
                [{ id: 0, value: PENDING_DATASET }],
                true,
            );
            await recordAll(cx, checks);
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
            const { response, checks } = await invokeTbrm(cx, ref, "getActiveDatasetRequest", {}, [], false);
            if (response.ok) {
                checks.push(expectDataset("getActiveDatasetRequest", response.value, ACTIVE_DATASET));
            }
            await recordAll(cx, checks);
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
            const { response, checks } = await invokeTbrm(cx, ref, "getPendingDatasetRequest", {}, [], false);
            if (response.ok) {
                checks.push(expectDataset("getPendingDatasetRequest", response.value, PENDING_DATASET));
            }
            await recordAll(cx, checks);
        }),
        {
            pics: "TBRM.C.C01.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x01. Beyond the plan, the DUT reads back the pending " +
                "dataset step 2 set.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
