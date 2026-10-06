/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { serveOtaTransfer, transferOrFail } from "./tc-bdx-support.js";
import {
    applyActionName,
    delayedActionTime,
    delayedActionTimeCheck,
    planDelayCoverageCheck,
    longRunningReason,
    OtaApplyAction,
    OtaQueryStatus,
    queryStatusName,
    singleApplyUpdate,
    singleQueryImage,
} from "./tc-su-support.js";
import { CertCheckFailedError, CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The one update this case reads, served by the precondition step. */
let served: BdxTransferEvidence | undefined;

async function recordApplyUpdateResponse(cx: CertStepContext) {
    const { transfer } = transferOrFail(served);
    const { request, response } = singleApplyUpdate(transfer.exchanges);
    const query = singleQueryImage(transfer.exchanges);

    await recordAll(cx, [
        {
            what: "the DUT answered the TH's ApplyUpdateRequest with Proceed",
            check: () => ({
                type: "response",
                verdict: response.action === OtaApplyAction.Proceed ? "pass" : "fail",
                detail:
                    `the TH asked to apply version ${request.newVersion} under update token ` +
                    `${request.updateToken}, and the DUT answered ${applyActionName(response.action)}`,
            }),
        },
        {
            // The plan asks only that the field be there and be a number; zero and non-zero are both
            // conforming, and this DUT answers zero because it allows the update immediately.
            what: "the DUT named a DelayedActionTime",
            check: () => ({
                type: "response",
                verdict: Number.isInteger(response.delayedActionTime) ? "pass" : "fail",
                detail: `the DUT answered DelayedActionTime ${response.delayedActionTime} seconds`,
            }),
        },
        {
            // Not part of the plan's own wording, and the claim the rest of this step rests on: an
            // answer about a different update would satisfy both checks above.
            what: "the ApplyUpdateRequest names the update the DUT offered",
            check: () => ({
                type: "response",
                verdict:
                    request.updateToken === query.response.updateToken &&
                    request.newVersion === transfer.softwareVersion
                        ? "pass"
                        : "fail",
                detail:
                    `the TH asked to apply version ${request.newVersion} under token ${request.updateToken}, ` +
                    `against the version ${transfer.softwareVersion} the DUT offered under token ` +
                    `${query.response.updateToken}`,
            }),
        },
    ]);
}

/**
 * How long step 3 waits for the apply it knows will be refused.
 *
 * Short, because the request follows the last block: this covers the request and the DUT's answer, not
 * a TH that decided against asking.
 */
const REFUSED_APPLY_BUDGET = Seconds(5);

/** The node this case's later steps drive, or a step failure naming what the precondition did not do. */
function commissionedOrFail() {
    const ref = commissioned.get("dut");
    if (ref === undefined) {
        throw new CertCheckFailedError("the TH was not commissioned by the precondition step");
    }
    return ref;
}

async function recordDeferredApply(cx: CertStepContext) {
    const dut = cx.controllers.dut;
    const ref = commissionedOrFail();
    const delay = delayedActionTime();

    await dut.node(ref).scriptOtaProvider({
        applyUpdate: [{ action: OtaApplyAction.AwaitNextAction, delayedActionTime: delay }],
    });

    // The TH answers the deferral by waiting and asking again, so the budget has to outlast the delay
    // the DUT named plus the second exchange.
    const deferred = await serveOtaTransfer(cx, ref, {
        sender: "dut",
        receiver: "th",
        expectApply: true,
        applyTimeoutMs: Seconds(delay + 30),
    });

    const applies = deferred.transfer.exchanges.applyUpdate;

    await recordAll(cx, [
        {
            what: "the DUT answered the first ApplyUpdateRequest with AwaitNextAction",
            check: () => ({
                type: "response",
                verdict: applies[0]?.response.action === OtaApplyAction.AwaitNextAction ? "pass" : "fail",
                detail: `the DUT answered ${applyActionName(applies[0]?.response.action ?? -1)}`,
            }),
        },
        {
            what: "that answer named the DelayedActionTime the case scripted",
            check: () => delayedActionTimeCheck(applies[0]?.response.delayedActionTime),
        },
        {
            what: "the value scripted is the one the plan names",
            check: () => planDelayCoverageCheck(),
        },
        {
            // The plan's own point: the deferral is not the end of the exchange. A DUT that answered
            // AwaitNextAction and then never allowed the apply would satisfy both checks above.
            what: "the DUT allowed the apply on the TH's second request",
            check: () => ({
                type: "response",
                verdict:
                    applies.length === 2 && applies[1].response.action === OtaApplyAction.Proceed ? "pass" : "fail",
                detail:
                    `the TH sent ${applies.length} ApplyUpdateRequest(s), the last answered ` +
                    applyActionName(applies[applies.length - 1]?.response.action ?? -1),
            }),
        },
    ]);
}

async function recordDiscontinuedApply(cx: CertStepContext) {
    const dut = cx.controllers.dut;
    const ref = commissionedOrFail();

    await dut.node(ref).scriptOtaProvider({ applyUpdate: [{ action: OtaApplyAction.Discontinue }] });

    // The apply is still waited for, though it will not be allowed: the request is what this step is
    // about, and it follows the last block. Waiting only for the transfer would read the record before
    // the TH had asked.
    const refused = await serveOtaTransfer(cx, ref, {
        sender: "dut",
        receiver: "th",
        applyTimeoutMs: REFUSED_APPLY_BUDGET,
    });
    const refusedApplies = refused.transfer.exchanges.applyUpdate;

    // Whatever the DUT held for the refused update must not decide the next one, which is the plan's
    // "the entire OTA process is restarted".
    const restarted = await serveOtaTransfer(cx, ref, { sender: "dut", receiver: "th" });

    await recordAll(cx, [
        {
            what: "the DUT answered the ApplyUpdateRequest with Discontinue",
            check: () => ({
                type: "response",
                verdict: refusedApplies[0]?.response.action === OtaApplyAction.Discontinue ? "pass" : "fail",
                detail: `the DUT answered ${applyActionName(refusedApplies[0]?.response.action ?? -1)}`,
            }),
        },
        {
            what: "a later QueryImage starts the whole update again",
            check: () => {
                const { response } = singleQueryImage(restarted.transfer.exchanges);
                return {
                    type: "response",
                    verdict:
                        response.status === OtaQueryStatus.UpdateAvailable &&
                        restarted.transfer.transferredBytes === restarted.transfer.fileSize
                            ? "pass"
                            : "fail",
                    detail:
                        `after the Discontinue the DUT answered the next QueryImage ` +
                        `${queryStatusName(response.status)} and served ${restarted.transfer.transferredBytes} of ` +
                        `${restarted.transfer.fileSize} bytes again`,
                };
            },
        },
        {
            what: "the restarted update ran from the beginning",
            check: () => ({
                type: "response",
                verdict:
                    restarted.transfer.proposal.startOffset === undefined ||
                    restarted.transfer.proposal.startOffset === 0
                        ? "pass"
                        : "fail",
                detail:
                    "the TH opened the second transfer at start offset " +
                    `${restarted.transfer.proposal.startOffset ?? 0}`,
            }),
        },
    ]);
}

certTest("TC-SU-3.4", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.OTA.Provider"],
    app: "ota-requestor",

    // chip's ota-requestor-app ends the update at the download without this, so the ApplyUpdateRequest
    // this case is about would never be sent. chip's own Test_TC_SU_3_4 passes the same flag.
    appArgs: { th: ["--autoApplyImage"] },

    // …and having applied, that app exits, which this harness reads as the TH dying mid-run. Every
    // step here is about the apply, so there is no subset that survives it.
    flavors: ["matterjs"],
})
    .step(
        "0",
        "Precondition: the DUT commissions the TH, stages an OTA image for it and announces itself as its OTA " +
            "provider, so the TH downloads the image and then asks to apply it.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            served = await serveOtaTransfer(cx, ref, { sender: "dut", receiver: "th", expectApply: true });
        },
        {
            expected:
                "One OTA update runs to completion with the DUT as provider, ending in the TH's own " +
                "ApplyUpdateRequest.",
        },
    )
    .step(
        1,
        "OTA-R/TH on completion of image download sends an ApplyUpdateRequest Command to the DUT. (11.19.6.11)",
        recordApplyUpdateResponse,
        {
            expected:
                "Verify that the DUT sends an ApplyUpdateResponse Command to the OTA Requestor. Verify that the " +
                "following fields are non empty. Action - Proceed. DelayedActionTime - Zero or non zero.",
        },
    )
    .step(
        2,
        "OTA-R/TH sends an ApplyUpdateRequest. DUT responds with ApplyUpdateResponse with Action AwaitNextAction " +
            "and DelayedActionTime 3 minutes, then Proceed on the subsequent request. (11.19.6.11)",
        recordDeferredApply,
        {
            longRunning: longRunningReason("the TH waits out the DelayedActionTime the DUT named"),
            expected:
                "Verify that the DUT sends an ApplyUpdateResponse with Action AwaitNextAction and DelayedActionTime " +
                "3 minutes.",
        },
    )
    .step(
        3,
        "OTA-R/TH sends an ApplyUpdateRequest. DUT responds with ApplyUpdateResponse with Action Discontinue. " +
            "Initiate another QueryImage Command from OTA-R/TH to the DUT. (11.19.6.11)",
        recordDiscontinuedApply,
        {
            expected:
                'Verify that the DUT sends an ApplyUpdateResponse with "Discontinue" in the action field. Verify ' +
                "that the entire OTA process is restarted on DUT when OTA-R/TH sends another QueryImage Request.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
