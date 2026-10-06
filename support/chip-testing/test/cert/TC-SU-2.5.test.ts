/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Seconds, Time } from "@matter/main";
import { Matter } from "@matter/model";
import type {
    CertStepContext,
    CheckRecord,
    EventReadEntry,
    OtaApplyUpdateExchange,
    OtaScriptedApplyAnswer,
} from "@matter/testing";
import { certTest, UnsupportedByControllerError } from "@matter/testing";
import { REBOOT_AFTER_APPLY_ARG, SPEC_INTERVALS_ARG } from "../../src/OtaRequestorTestInstance.js";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { BDX_RECEIVER_ROLES, serveOtaTransfer } from "./tc-bdx-support.js";
import {
    applyActionName,
    OtaApplyAction,
    recordRequestorIdle,
    requestorIdleEntry,
    singleQueryImageCheck,
} from "./tc-su-support.js";
import { attempt, CommissionedRefs, recordAll, requireId } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const SOFTWARE_VERSION_ID = requireId(
    BASIC_INFORMATION.attributes.require("softwareVersion").id,
    "BasicInformation.softwareVersion",
);
const START_UP_ID = requireId(BASIC_INFORMATION.events.require("startUp").id, "BasicInformation.StartUp");

/**
 * How long a step that restarted the DUT waits for the TH to be told of that restart.
 *
 * Covers the 30 s from the DUT's return that the controller's `RebootResubscribeArmer` waits before it resubscribes
 * to a DUT that did not resume the subscription itself. The TH reads the `StartUp` against whatever update it is
 * serving, so the next step serves only once the restart is known.
 */
const RETURN_WAIT = Seconds(45);

/** The DUT's `StartUp` events the TH's sustained subscription delivered during this run. */
const startUps = new Array<EventReadEntry>();

/** The plan's own deferral, which steps 2 and 4 ask the DUT to wait out. */
const PLAN_DELAY = 180;

/** The plan's shorter deferral for step 3, below the floor § 11.20.3.6 puts under it. */
const SHORT_DELAY = 60;

/**
 * The floor a requestor applies to an `AwaitNextAction` deferral, whatever the provider named
 * (§ 11.20.3.6). Step 3 names less than this and checks the DUT waited this instead.
 */
const APPLY_FLOOR = Seconds(120);

/** Margin allowed on a wait the DUT owes, so scheduling jitter does not fail a conformant requestor. */
const WAIT_TOLERANCE = Seconds(2);

/** How long the DUT has to restart into the applied version and report it, once the TH allowed the apply. */
const NOTIFY_APPLIED_TIMEOUT = Seconds(30);

/**
 * How long step 5 keeps watching after the TH refuses the apply.
 *
 * A requestor that ignored the refusal applies within seconds of it, so this is what makes "the DUT
 * sent no NotifyUpdateApplied" a claim about the DUT rather than about how soon the step looked. It
 * cannot come from the wait for an apply: the provider withdraws the update's consent to refuse, which
 * settles that wait at once, before the DUT has reacted to anything.
 */
const REFUSAL_WINDOW = Seconds(15);

/** Room beyond a wait the step is about, for the exchange around it and the restart that follows. */
const EXCHANGE_MARGIN = Seconds(90);

/** The `SoftwareVersion` a `StartUp` event reports, or `undefined` for anything else. */
function startUpVersion(entry: EventReadEntry): unknown {
    return typeof entry.value === "object" && entry.value !== null && "softwareVersion" in entry.value
        ? entry.value.softwareVersion
        : undefined;
}

/**
 * A check that the TH was told the DUT restarted into `version`, within {@link RETURN_WAIT}: a `StartUp` reporting it
 * reached the TH's subscription.
 */
async function returnSeen(version: number): Promise<CheckRecord> {
    const seen = () => startUps.some(entry => startUpVersion(entry) === version);
    const deadline = Time.nowUs + RETURN_WAIT;
    while (!seen() && Time.nowUs < deadline) {
        await Time.sleep("TC-SU-2.5 DUT return", Millis(100));
    }
    return {
        type: "response",
        verdict: seen() ? "pass" : "fail",
        detail: seen()
            ? `the TH's subscription delivered the DUT's StartUp with SoftwareVersion ${version}`
            : `the TH's subscription delivered no StartUp with SoftwareVersion ${version} within ` +
              Duration.format(RETURN_WAIT),
    };
}

/** Has the TH's provider answer `applyUpdate`, as a step failure rather than an exception. */
async function script(cx: CertStepContext, applyUpdate: OtaScriptedApplyAnswer[]) {
    try {
        await cx.controllers.th.node(commissioned.require("th", "the DUT")).scriptOtaProvider({ applyUpdate });
    } catch (e) {
        // Before the check, not after: the runner turns this into a skipped step only while the step has
        // recorded no check and made no call that may change the device
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
}

/** The version the DUT reports it runs, recorded rather than thrown where the read fails. */
function readSoftwareVersion(cx: CertStepContext) {
    return attempt(
        () =>
            cx.controllers.th.node(commissioned.require("th", "the DUT")).readAttribute({
                endpoint: 0,
                cluster: BASIC_INFORMATION_ID,
                attribute: SOFTWARE_VERSION_ID,
            }),
        value => `the DUT reports SoftwareVersion ${value} in Basic Information`,
    );
}

/**
 * Drives one update whose `ApplyUpdateResponse` the step scripts, and reports what the TH recorded.
 *
 * The two waits are separate because the DUT's own deferral falls in one or the other, never both.
 * `untilAllowed` covers the time until the TH allows an apply: an `AwaitNextAction` is refused now and
 * allowed only when the DUT asks again, so that deferral lands here. `untilApplied` covers the time
 * from the allowance to the DUT reporting the new version, which is where a `Proceed` the DUT was told
 * to defer lands. A step that gave its deferral to the wrong one stops watching before the DUT acts.
 *
 * Where no apply is coming — the TH refuses — `untilApplied` is absent and `untilAllowed` is what gives
 * the DUT time to send the `ApplyUpdateRequest` the step reads, and to send a `NotifyUpdateApplied` if
 * it wrongly applied anyway.
 */
async function serveWithApplyAnswer(
    cx: CertStepContext,
    applyUpdate: OtaScriptedApplyAnswer[],
    {
        untilAllowed,
        untilApplied,
        observeAfter,
    }: { untilAllowed: Duration; untilApplied?: Duration; observeAfter?: Duration },
): Promise<BdxTransferEvidence> {
    const ref = commissioned.require("th", "the DUT");
    if (applyUpdate.length > 0) {
        await script(cx, applyUpdate);
    }
    return serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        expectApply: true,
        applyTimeoutMs: untilAllowed,
        notifyAppliedTimeoutMs: untilApplied,
        observeAfterMs: observeAfter,
        timeoutMs: Millis(untilAllowed + (untilApplied ?? Seconds(0)) + (observeAfter ?? Seconds(0)) + EXCHANGE_MARGIN),
    });
}

/** The check every applying step shares: the DUT runs the version it downloaded. */
function runsDownloadedVersion(running: Awaited<ReturnType<typeof readSoftwareVersion>>, downloaded: number) {
    return (): CheckRecord =>
        running.ok
            ? {
                  type: "response",
                  verdict: running.value === downloaded ? "pass" : "fail",
                  detail: `${running.check.detail}, against the downloaded ${downloaded}`,
              }
            : running.check;
}

/** The `ApplyUpdateResponse` the TH gave for `exchange`, as a check's own detail text. */
function answerText(exchange: OtaApplyUpdateExchange | undefined) {
    return exchange === undefined
        ? "the DUT sent no ApplyUpdateRequest"
        : `the TH answered ${applyActionName(exchange.response.action)} with DelayedActionTime ` +
              `${exchange.response.delayedActionTime}`;
}

/** Step 1: `Proceed` with no delay, which is the answer the TH's provider gives for itself. */
async function recordProceedAtOnce(cx: CertStepContext) {
    const { transfer } = await serveWithApplyAnswer(cx, [], {
        untilAllowed: EXCHANGE_MARGIN,
        untilApplied: NOTIFY_APPLIED_TIMEOUT,
    });
    const applies = transfer.exchanges.applyUpdate;
    const [applied] = applies;
    const returned = await returnSeen(transfer.softwareVersion);
    const running = await readSoftwareVersion(cx);

    await recordAll(cx, [
        {
            what: "the served update carried the one QueryImage the plan describes",
            check: () => singleQueryImageCheck(transfer.exchanges),
        },
        {
            what: "the TH answered the DUT's ApplyUpdateRequest Proceed with no delay",
            check: () => ({
                type: "response",
                verdict:
                    applied?.response.action === OtaApplyAction.Proceed && applied.response.delayedActionTime === 0
                        ? "pass"
                        : "fail",
                detail: answerText(applied),
            }),
        },
        {
            // The plan's "no other ApplyUpdateRequest": a requestor allowed to apply at once has nothing
            // left to ask for
            what: "the DUT sent no further ApplyUpdateRequest",
            check: () => ({
                type: "response",
                verdict: applies.length === 1 ? "pass" : "fail",
                detail: `the TH received ${applies.length} ApplyUpdateRequest command(s) during this update`,
            }),
        },
        {
            what: "the DUT runs the version it downloaded",
            check: runsDownloadedVersion(running, transfer.softwareVersion),
        },
        { what: "the TH was told of the DUT's restart before the next step", check: () => returned },
    ]);
}

/**
 * Steps 2 and 4: the DUT owes a deferral of `PLAN_DELAY` before it applies, and then applies.
 *
 * Step 2 defers a `Proceed` the TH already allowed, so the DUT applies when the delay is up without
 * asking again. Step 4 defers with `AwaitNextAction`, so it asks again and the TH — its script spent —
 * answers `Proceed` for itself.
 *
 * Both waits are measured on the TH, between commands it received. Step 4's two requests bound the
 * deferral alone. Step 2 has only the `NotifyUpdateApplied` to end on, which the DUT sends once it is
 * running the new version, so what that span covers is the deferral *and* the restart after it — the
 * check says so rather than claiming the deferral alone. A requestor that applied early and took long
 * to come back is the case it cannot separate; one that did not defer at all fails it.
 */
function recordDeferredApply(answer: OtaScriptedApplyAnswer, asksAgain: boolean) {
    return async (cx: CertStepContext) => {
        // An AwaitNextAction is allowed only once the DUT asks again, so its deferral falls before the
        // allowance; a deferred Proceed is allowed at once and the DUT waits after it
        const deferral = Seconds(PLAN_DELAY);
        const { transfer } = await serveWithApplyAnswer(
            cx,
            [answer],
            asksAgain
                ? { untilAllowed: Millis(deferral + EXCHANGE_MARGIN), untilApplied: NOTIFY_APPLIED_TIMEOUT }
                : { untilAllowed: EXCHANGE_MARGIN, untilApplied: Millis(deferral + NOTIFY_APPLIED_TIMEOUT) },
        );
        const applies = transfer.exchanges.applyUpdate;
        const [deferred, ...later] = applies;
        const notifications = transfer.exchanges.notifyUpdateApplied;
        const returned = await returnSeen(transfer.softwareVersion);
        const running = await readSoftwareVersion(cx);

        // What the DUT did once the delay was up: the second request where it asks again, and otherwise
        // the notification it sends having applied. Both are timed on the TH, which a DUT restarting
        // into the new version does not disturb — its own StateTransition events do not survive that.
        const resumedAtMs = asksAgain ? later[0]?.receivedAtMs : notifications[0]?.receivedAtMs;
        const waited =
            deferred === undefined || resumedAtMs === undefined ? undefined : resumedAtMs - deferred.receivedAtMs;

        await recordAll(cx, [
            {
                what: `the TH answered the DUT's ApplyUpdateRequest ${applyActionName(answer.action ?? OtaApplyAction.Proceed)} with ${PLAN_DELAY}s`,
                check: () => ({
                    type: "response",
                    verdict:
                        deferred?.response.action === (answer.action ?? OtaApplyAction.Proceed) &&
                        deferred.response.delayedActionTime === PLAN_DELAY
                            ? "pass"
                            : "fail",
                    detail: answerText(deferred),
                }),
            },
            {
                what: asksAgain
                    ? "the DUT waited the time the TH named before asking again"
                    : "the DUT reported the new version no sooner than the time the TH named",
                check: (): CheckRecord => ({
                    type: "response",
                    verdict: waited !== undefined && waited >= Seconds(PLAN_DELAY) - WAIT_TOLERANCE ? "pass" : "fail",
                    detail:
                        waited === undefined
                            ? asksAgain
                                ? `the TH received ${applies.length} ApplyUpdateRequest command(s), where this step needs two`
                                : `the TH received ${notifications.length} NotifyUpdateApplied command(s), where this step needs one`
                            : `the DUT ${asksAgain ? "asked again" : "reported the new version"} ` +
                              `${Duration.format(Millis(waited))} after the deferral, against the ` +
                              `${Duration.format(Seconds(PLAN_DELAY))} it was told` +
                              (asksAgain ? "" : ", its own restart included"),
                }),
            },
            ...(asksAgain
                ? [
                      {
                          what: "the TH answered that second request Proceed",
                          check: (): CheckRecord => ({
                              type: "response",
                              verdict: later[0]?.response.action === OtaApplyAction.Proceed ? "pass" : "fail",
                              detail: answerText(later[0]),
                          }),
                      },
                  ]
                : []),
            {
                what: "the DUT then applied the update",
                check: () => ({
                    type: "response",
                    verdict: notifications.length > 0 ? "pass" : "fail",
                    detail:
                        `the TH received ${notifications.length} NotifyUpdateApplied command(s) within ` +
                        `${Duration.format(NOTIFY_APPLIED_TIMEOUT)} of the apply`,
                }),
            },
            {
                what: "the DUT runs the version it downloaded",
                check: runsDownloadedVersion(running, transfer.softwareVersion),
            },
            { what: "the TH was told of the DUT's restart before the next step", check: () => returned },
        ]);
    };
}

/**
 * Step 3: `AwaitNextAction` naming less than the floor, so the DUT must wait the floor instead.
 *
 * The step is about the spacing rather than the update: the second request the DUT sends is answered by the
 * TH's own provider, which allows the apply, and the step reads the gap before it. The DUT then applies and
 * restarts, which the step waits to see reported before the next one serves.
 */
async function recordFlooredDeferral(cx: CertStepContext) {
    const { transfer } = await serveWithApplyAnswer(
        cx,
        [{ action: OtaApplyAction.AwaitNextAction, delayedActionTime: SHORT_DELAY }],
        { untilAllowed: Millis(APPLY_FLOOR + EXCHANGE_MARGIN), untilApplied: NOTIFY_APPLIED_TIMEOUT },
    );
    const applies = transfer.exchanges.applyUpdate;
    const [deferred, ...later] = applies;
    const askedAgain = later[0];
    const waited =
        deferred === undefined || askedAgain === undefined
            ? undefined
            : askedAgain.receivedAtMs - deferred.receivedAtMs;

    // The plan's "does not apply the software update within this time": what the DUT did before it asked
    // again, which is the window it was told to hold the image back for
    const appliedEarly =
        askedAgain === undefined
            ? transfer.exchanges.notifyUpdateApplied
            : transfer.exchanges.notifyUpdateApplied.filter(
                  ({ receivedAtMs }) => receivedAtMs < askedAgain.receivedAtMs,
              );

    // The TH's provider allows the request the DUT asks again with, so the DUT applies and restarts too
    const returned = await returnSeen(transfer.softwareVersion);

    await recordAll(cx, [
        {
            what: `the TH answered the DUT's ApplyUpdateRequest AwaitNextAction with ${SHORT_DELAY}s`,
            check: () => ({
                type: "response",
                verdict:
                    deferred?.response.action === OtaApplyAction.AwaitNextAction &&
                    deferred.response.delayedActionTime === SHORT_DELAY
                        ? "pass"
                        : "fail",
                detail: answerText(deferred),
            }),
        },
        {
            // The DelayedActionTime the TH named is below the floor, so a requestor honoring only that
            // would come back a minute early — which is the defect this step exists to catch
            what: "the DUT waited the two-minute floor rather than the shorter time it was told",
            check: () => ({
                type: "response",
                verdict: waited !== undefined && waited >= APPLY_FLOOR - WAIT_TOLERANCE ? "pass" : "fail",
                detail:
                    waited === undefined
                        ? `the TH received ${applies.length} ApplyUpdateRequest command(s), where this step needs two`
                        : `the DUT asked again ${Duration.format(Millis(waited))} after the deferral, against the ` +
                          `${Duration.format(APPLY_FLOOR)} floor and the ${Duration.format(Seconds(SHORT_DELAY))} it was told`,
            }),
        },
        {
            what: "the DUT applied nothing while it was holding the update back",
            check: () => ({
                type: "response",
                verdict: appliedEarly.length === 0 ? "pass" : "fail",
                detail:
                    `the TH received ${appliedEarly.length} NotifyUpdateApplied command(s) before the DUT asked ` +
                    `again, of ${transfer.exchanges.notifyUpdateApplied.length} over the whole step`,
            }),
        },
        { what: "the TH was told of the DUT's restart before the next step", check: () => returned },
    ]);
}

/** Step 5: `Discontinue`, after which the DUT keeps running what it ran and holds no image. */
async function recordDiscontinue(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));
    const before = await readSoftwareVersion(cx);

    const { transfer } = await serveWithApplyAnswer(cx, [{ action: OtaApplyAction.Discontinue }], {
        untilAllowed: EXCHANGE_MARGIN,
        observeAfter: REFUSAL_WINDOW,
    });
    const [refused] = transfer.exchanges.applyUpdate;
    const notifications = transfer.exchanges.notifyUpdateApplied;
    const watched = Millis(transfer.observedMs);
    const running = await readSoftwareVersion(cx);

    await recordAll(cx, [
        {
            what: "the TH answered the DUT's ApplyUpdateRequest Discontinue",
            check: () => ({
                type: "response",
                verdict: refused?.response.action === OtaApplyAction.Discontinue ? "pass" : "fail",
                detail: answerText(refused),
            }),
        },
        {
            // Without the wait no notification can be in the record, whatever the DUT does next
            what: "the TH watched the whole window after refusing the apply",
            check: () => ({
                type: "response",
                verdict: watched >= REFUSAL_WINDOW ? "pass" : "fail",
                detail:
                    `the TH watched for ${Duration.format(watched)} after the refusal, against the ` +
                    `${Duration.format(REFUSAL_WINDOW)} this step claims`,
            }),
        },
        {
            what: "the DUT sent no NotifyUpdateApplied",
            check: () => ({
                type: "response",
                verdict: notifications.length === 0 ? "pass" : "fail",
                detail:
                    `the TH received ${notifications.length} NotifyUpdateApplied command(s) in the ` +
                    `${Duration.format(watched)} after refusing the apply`,
            }),
        },
        {
            what: "the DUT still runs the version it ran before the update",
            check: () => {
                if (!before.ok) {
                    return before.check;
                }
                if (!running.ok) {
                    return running.check;
                }
                return {
                    type: "response",
                    verdict: running.value === before.value ? "pass" : "fail",
                    detail:
                        `the DUT reports SoftwareVersion ${running.value}, against the ${before.value} it reported ` +
                        `before it downloaded version ${transfer.softwareVersion}`,
                };
            },
        },

        // The plan's "resets the UpdateState Attribute to Idle"; the image it cleared is not readable
        // from outside, and Idle is what the requestor reports once it has
        requestorIdleEntry(node),
    ]);
}

certTest("TC-SU-2.5", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller, as in TC-SU-2.1.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,

    // Every step but 3 and 5 reads the version the DUT boots into, which takes a restart into the applied
    // image. Step 3's floor is the DUT's own, so the run must not shorten it.
    appArgs: { dut: { matterjs: [REBOOT_AFTER_APPLY_ARG, SPEC_INTERVALS_ARG] } },

    // chip's ota-requestor-app exits once it applies, which the harness reads as the DUT dying mid-run,
    // and it cannot restart into the image this harness stages.
    flavors: ["matterjs"],
})
    .step(
        "0",
        "Precondition: TH and DUT are on the same fabric, and there is no ongoing OTA process on the DUT.",
        async cx => {
            const th = cx.controllers.th;
            const dut = cx.devices.dut;

            const ref = await th.commission({
                passcode: dut.commissioning.passcode,
                discriminator: dut.commissioning.discriminator,
            });
            commissioned.set("th", ref);

            await recordRequestorIdle(cx, th.node(ref));

            startUps.length = 0;
            try {
                await th.node(ref).observeEvents([{ endpoint: 0, cluster: BASIC_INFORMATION_ID, event: START_UP_ID }], {
                    onUpdate: event => startUps.push(event),
                });
            } catch (e) {
                // The step already commissioned, so the runner fails the run on a refusal without this check
                if (e instanceof UnsupportedByControllerError) {
                    throw e;
                }
                cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
                throw e;
            }
        },
        {
            expected:
                "The TH holds the DUT on its fabric with the ACL entries commissioning installs, and reading the " +
                "UpdateState Attribute of the OTA Requestor returns Idle. The plan's Test Setup — the query, the " +
                "transfer and the ApplyUpdateRequest that follows it — runs in each step, since each step is about " +
                "the answer the TH gives that request.",
        },
    )
    .step(
        1,
        'OTA-P/TH sends the ApplyUpdateResponse Command to the DUT. Action field is set to "Proceed", ' +
            "DelayedActionTime is set to 0. (11.19.6.11)",
        recordProceedAtOnce,
        {
            expected:
                "Verify that the DUT starts updating its software. Once the update is finished, verify the " +
                "SoftwareVersion attribute from the Basic Information cluster on the DUT to match the version " +
                "downloaded for the software update. Verify on the OTA-P/TH that there is no other " +
                "ApplyUpdateRequest from the DUT.",
        },
    )
    .step(
        2,
        'OTA-P/TH sends the ApplyUpdateResponse Command to the DUT. Action field is set to "Proceed", ' +
            "DelayedActionTime is set to 3 minutes. (11.19.6.11)",
        recordDeferredApply({ action: OtaApplyAction.Proceed, delayedActionTime: PLAN_DELAY }, false),
        {
            longRunning: "the DUT waits out the three minutes the TH named before it applies",
            expected:
                "Verify that the DUT starts updating its software after 3 minutes. Once the update is finished, " +
                "verify the SoftwareVersion attribute from the Basic Information cluster on the DUT to match the " +
                "version downloaded for the software update.",
        },
    )
    .step(
        3,
        'OTA-P/TH sends the ApplyUpdateResponse Command to the DUT. Action field is set to "AwaitNextAction", ' +
            "DelayedActionTime is set to 1 minute. (11.19.6.11)",
        recordFlooredDeferral,
        {
            longRunning: "the plan watches the DUT for the two-minute floor it owes",
            expected:
                "Verify that the DUT waits for the minimum interval defined by spec which is 2 minutes before " +
                "re-sending the ApplyUpdateRequest to the OTA-P. Verify that the DUT does not apply the software " +
                "update within this time.",
        },
    )
    .step(
        4,
        'OTA-P/TH sends the ApplyUpdateResponse Command to the DUT. Action field is set to "AwaitNextAction", ' +
            "DelayedActionTime is set to 3 minutes. On the subsequent ApplyUpdateRequest command, TH/OTA-P sends " +
            'the ApplyUpdateResponse back to DUT. Action field is set to "Proceed". (11.19.6.11)',
        recordDeferredApply({ action: OtaApplyAction.AwaitNextAction, delayedActionTime: PLAN_DELAY }, true),
        {
            longRunning: "the DUT waits out the three minutes the TH named before it asks again",
            expected:
                "Verify that the DUT waits for 3 minutes before sending the ApplyUpdateRequest to the OTA-P. " +
                "Verify that the DUT starts updating its software after the second ApplyUpdateResponse with " +
                "Proceed action. Once the update is finished, verify the SoftwareVersion attribute from the Basic " +
                "Information cluster on the DUT to match the version downloaded for the software update.",
        },
    )
    .step(
        5,
        'OTA-P/TH sends the ApplyUpdateResponse Command to the DUT. Action field is set to "Discontinue". ' +
            "(11.19.6.11)",
        recordDiscontinue,
        {
            expected:
                "Verify that the DUT clears its previously downloaded software image, and resets the UpdateState " +
                "Attribute to Idle. Verify that the DUT does not send the NotifyUpdateApplied within a reasonable " +
                "time. Verify the SoftwareVersion attribute from the Basic Information cluster of the DUT to be " +
                "the same as it was previously.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
