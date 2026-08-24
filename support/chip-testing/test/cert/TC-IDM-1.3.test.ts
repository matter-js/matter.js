/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Status } from "@matter/main/types";
import { Matter } from "@matter/model";
import type { BatchCommandResult, BatchCommandSpec, CertStepContext, DeviceFlavor } from "@matter/testing";
import { certTest } from "@matter/testing";
import { registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import { ChipFault, FAULT_TYPE_CHIP, FaultInjectionCluster } from "./fault-injection.js";
import { COMMISSIONING_LOG_TIMEOUT } from "./tc-dd-support.js";
import type { BatchPath } from "./tc-idm-1.3-support.js";
import {
    expectBatchRequestPaths,
    expectInjectedFault,
    expectInvokeCount,
    expectNoInjectedFault,
} from "./tc-idm-1.3-support.js";
import { CommissionedRefs, LOG_TIMEOUT, record, requireId, runCleanups } from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ON = requireId(ON_OFF.commands.require("on").id, "OnOff.on");
const OFF = requireId(ON_OFF.commands.require("off").id, "OnOff.off");

const FAULT_INJECTION_ID = requireId(registerCertCustomCluster(FaultInjectionCluster).id, "FaultInjection cluster");

const ROOT_ENDPOINT = 0;
const ENDPOINT_1 = 1;

/**
 * The batch every step sends: two valid unique paths on one cluster, which is the plan's own example.
 * `CommandHandlerImpl::TestOnlyInvokeCommandRequestWithFaultsInjected` aborts the TH unless the batch
 * an armed fault answers carries exactly two commands, so the count is a hard requirement, not a
 * choice.
 */
const BATCH: BatchCommandSpec[] = [
    { cluster: ON_OFF_ID, command: "on", endpoint: ENDPOINT_1 },
    { cluster: ON_OFF_ID, command: "off", endpoint: ENDPOINT_1 },
];

const BATCH_PATHS: BatchPath[] = [
    { endpoint: ENDPOINT_1, cluster: ON_OFF_ID, command: ON },
    { endpoint: ENDPOINT_1, cluster: ON_OFF_ID, command: OFF },
];

/**
 * Only the chip-local flavor runs a `nlfaultinject` build, and only such a build has the
 * `FaultInjection` cluster this TC arms. The restriction is test-level rather than per-step: an armed
 * fault fires on whatever invoke reaches the TH next, so a run that armed the faults must also run the
 * steps that consume them.
 */
const FLAVORS: DeviceFlavor[] = ["chip-local"];

const CW_TIMEOUT_SECONDS = 180;

const commissioned = new CommissionedRefs<"dut" | "th_client">();

/**
 * Records the device's answers to a batch as the step's response evidence. Arrival order is part of the
 * claim: three of the steps differ from one another in nothing else.
 */
function recordResults(
    cx: CertStepContext,
    results: BatchCommandResult[],
    expected: { index: number; status: number }[],
) {
    const actual = results.map(({ index, status }) => ({ index, status }));
    const matches = JSON.stringify(actual) === JSON.stringify(expected);

    record(
        cx,
        {
            type: "response",
            verdict: matches ? "pass" : "fail",
            detail: `invoke responses arrived as ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
        },
        "Batch invoke responses",
    );
}

async function recordBatchRequest(cx: CertStepContext, from: number, paths: BatchPath[]) {
    const th = cx.devices.th;
    record(cx, await expectBatchRequestPaths(th.log, th.flavor, paths, from, LOG_TIMEOUT), "Invoke request paths");
    record(cx, expectInvokeCount(th.log, th.flavor, from, 1), "Invoke request count");
}

certTest("TC-IDM-1.3", {
    plan: "interactiondatamodel.adoc",
    pics: ["MCORE.IDM.C.InvokeRequest.BatchCommands"],
    app: "all-clusters",
    appVariant: "nlfaultinject",
    flavors: FLAVORS,
    controllers: { dut: "dut", th_client: "helper" },
})
    .step(
        "0.1",
        "Commission TH Client and DUT to TH device (Server)",
        async cx => {
            const { dut, th_client } = cx.controllers;
            const th = cx.devices.th;

            const dutRef = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", dutRef);

            const { manualPairingCode } = await dut
                .node(dutRef)
                .openCommissioningWindow({ timeout: CW_TIMEOUT_SECONDS, enhanced: true });
            if (manualPairingCode === undefined) {
                throw new InternalError("Commissioning window opened without a manual pairing code for TH Client");
            }

            const thClientRef = await th_client.commission({ manualPairingCode });
            commissioned.set("th_client", thClientRef);

            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: "TH device commissioned by the DUT and, through a commissioning window it opened, by TH Client",
            });
        },
        { expected: "TH device (Server) is commissioned by both the DUT and TH Client" },
    )
    .step(
        "0.2",
        "TH Client sends FailAtFault to the FaultInjection cluster of the TH device (Server) for chip faults 12, 13 " +
            "and 14",
        async cx => {
            const { dut, th_client } = cx.controllers;
            const th = cx.devices.th;

            // The controller's own PICS gates this whole TC, so a controller without batch invoke never
            // gets here; this proves the capability against the device before anything is armed, so a
            // controller whose declaration outran its implementation leaves no fault primed. An unarmed
            // fault decrements no counter, so the invoke does not disturb the arming arithmetic below.
            await dut.node(commissioned.require("dut")).invokeBatch(BATCH);

            const from = th.log.mark();
            const node = th_client.node(commissioned.require("th_client"));

            // Order and skip counts are the plan's own. Each arming command is itself an invoke the TH
            // checks its already-armed faults against, so fault 12 is checked twice more (while arming
            // 13 and 14) and fault 13 once more before step 1's batch — which is why the counts
            // descend 3/2/1 rather than being equal. See AGENTS.md for the full accounting.
            for (const [id, numCallsToSkip] of [
                [ChipFault.imInvokeSeparateResponses, 3],
                [ChipFault.imInvokeSeparateResponsesInvertResponseOrder, 2],
                [ChipFault.imInvokeSkipSecondResponse, 1],
            ] as const) {
                await node.invoke(
                    FAULT_INJECTION_ID,
                    "failAtFault",
                    { type: FAULT_TYPE_CHIP, id, numCallsToSkip, numCallsToFail: 1, takeMutex: false },
                    ROOT_ENDPOINT,
                );
            }

            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: "TH device accepted FailAtFault for chip faults 12, 13 and 14",
            });

            record(cx, expectInvokeCount(th.log, th.flavor, from, 3), "Arming invoke count");
            record(cx, expectNoInjectedFault(th.log, th.flavor, from), "No fault fired while arming");
        },
        { expected: "Each FailAtFault command's response indicates it was successful" },
    )
    .step(
        1,
        "DUT sends the Invoke Request Message to the TH. The Message should contain multiple valid unique paths. TH " +
            "responds with a single command response message containing responses to both of the messages in the " +
            "same order",
        async cx => {
            const th = cx.devices.th;
            const from = th.log.mark();

            const results = await cx.controllers.dut.node(commissioned.require("dut")).invokeBatch(BATCH);

            recordResults(cx, results, [
                { index: 0, status: Status.Success },
                { index: 1, status: Status.Success },
            ]);
            await recordBatchRequest(cx, from, BATCH_PATHS);
            record(cx, expectNoInjectedFault(th.log, th.flavor, from), "No injected fault");
        },
        {
            expected:
                "The DUT does not crash. On the TH device (server), the received request message has the same paths " +
                "as provided in the command, and the paths are unique.",
        },
    )
    .step(
        2,
        "DUT sends the Invoke Request Message to the TH. TH answers each command in its own Invoke Response Message, " +
            "the first carrying MoreChunkedMessages, with the responses in the same order as the request",
        async cx => {
            const th = cx.devices.th;
            const from = th.log.mark();

            const results = await cx.controllers.dut.node(commissioned.require("dut")).invokeBatch(BATCH);

            recordResults(cx, results, [
                { index: 0, status: Status.Failure },
                { index: 1, status: Status.Failure },
            ]);
            await recordBatchRequest(cx, from, BATCH_PATHS);
            record(
                cx,
                await expectInjectedFault(th.log, th.flavor, ChipFault.imInvokeSeparateResponses, from, LOG_TIMEOUT),
                "Separate response messages",
            );
        },
        {
            expected:
                "The DUT does not crash and receives two responses with Status FAILURE. The TH has not crashed and " +
                "its logs indicate separate Invoke Response Messages with the responses in the same order as the " +
                "requests.",
        },
    )
    .step(
        3,
        "DUT sends the Invoke Request Message to the TH. TH answers each command in its own Invoke Response Message, " +
            "with the responses in the opposite order to the request",
        async cx => {
            const th = cx.devices.th;
            const from = th.log.mark();

            const results = await cx.controllers.dut.node(commissioned.require("dut")).invokeBatch(BATCH);

            recordResults(cx, results, [
                { index: 1, status: Status.Failure },
                { index: 0, status: Status.Failure },
            ]);
            await recordBatchRequest(cx, from, BATCH_PATHS);
            record(
                cx,
                await expectInjectedFault(
                    th.log,
                    th.flavor,
                    ChipFault.imInvokeSeparateResponsesInvertResponseOrder,
                    from,
                    LOG_TIMEOUT,
                ),
                "Inverted response order",
            );
        },
        {
            expected:
                "The DUT does not crash and receives two responses with Status FAILURE. The TH has not crashed and " +
                "its logs indicate separate Invoke Response Messages with the responses in reverse order.",
        },
    )
    .step(
        4,
        "DUT sends the Invoke Request Message to the TH. TH answers only the first command and never responds to the " +
            "second",
        async cx => {
            const th = cx.devices.th;
            const from = th.log.mark();

            const results = await cx.controllers.dut.node(commissioned.require("dut")).invokeBatch(BATCH);

            recordResults(cx, results, [
                { index: 0, status: Status.Failure },
                { index: 1, status: Status.NoCommandResponse },
            ]);
            await recordBatchRequest(cx, from, BATCH_PATHS);
            record(
                cx,
                await expectInjectedFault(th.log, th.flavor, ChipFault.imInvokeSkipSecondResponse, from, LOG_TIMEOUT),
                "Dropped second response",
            );
        },
        {
            expected:
                "The DUT does not crash. It receives one response with Status FAILURE, and the unanswered command " +
                "reports NO_COMMAND_RESPONSE. The TH has not crashed and its logs indicate a single Invoke Response " +
                "Message with a dropped response.",
        },
    )
    .step(
        5,
        "DUT sends the Invoke Request Message to the TH containing one valid CommandDataIB with a specific endpoint, " +
            "cluster and command, which the TH answers normally",
        async cx => {
            const th = cx.devices.th;
            const from = th.log.mark();

            await cx.controllers.dut.node(commissioned.require("dut")).invoke(ON_OFF_ID, "on", undefined, ENDPOINT_1);

            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `single invoke of OnOff.on on endpoint ${ENDPOINT_1} succeeded`,
            });
            await recordBatchRequest(cx, from, [BATCH_PATHS[0]]);
            record(cx, expectNoInjectedFault(th.log, th.flavor, from), "No injected fault");
        },
        {
            expected: "On the TH, the received request message has the same path as provided in the command",
        },
    )
    .finalize(cx =>
        runCleanups(
            // Faults 12/13/14 fire for any invoke and kill the device unless it carries two commands,
            // so the RemoveFabric below would take the TH down with it. They live in the app's memory
            // and a reboot keeps the fabric, so restarting clears them and leaves the fabric to remove.
            // Disarming cannot work: `failAtFault` is itself a single-command invoke.
            () => rebootTh(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );

/** A chip app says it is up again on this line, once per generation. */
const SERVER_READY = /\[SVR\] Server initialization complete/;

async function rebootTh(cx: CertStepContext) {
    const th = cx.devices.th;
    const from = th.log.mark();

    await th.backchannel({ name: "reboot" });

    // start() returns when the process is up, not when the app is, and the decommission that follows
    // needs a device that answers. A device coming up is what COMMISSIONING_LOG_TIMEOUT bounds;
    // LOG_TIMEOUT covers a line the step itself just caused.
    await th.log.expect({ chip: SERVER_READY }, { flavor: th.flavor, from, timeoutMs: COMMISSIONING_LOG_TIMEOUT });
}
