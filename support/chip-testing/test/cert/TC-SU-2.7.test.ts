/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Seconds, Time } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord, EventReadEntry } from "@matter/testing";
import { certTest, UnsupportedByControllerError } from "@matter/testing";
import { REBOOT_AFTER_APPLY_ARG, SPEC_INTERVALS_ARG } from "../../src/OtaRequestorTestInstance.js";
import { BDX_RECEIVER_ROLES, serveOtaTransfer } from "./tc-bdx-support.js";
import {
    OTA_REQUESTOR_EVENTS,
    OtaApplyAction,
    OtaQueryStatus,
    OtaUpdateState,
    recordRequestorIdle,
    updateStateName,
} from "./tc-su-support.js";
import { attempt, CommissionedRefs, recordAll, requireId } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const SOFTWARE_VERSION_ID = requireId(
    BASIC_INFORMATION.attributes.require("softwareVersion").id,
    "BasicInformation.softwareVersion",
);
const PRODUCT_ID = requireId(BASIC_INFORMATION.attributes.require("productId").id, "BasicInformation.productId");

/** What the observation has delivered since the current step began watching. */
const received = new Array<EventReadEntry>();

/** Whether the case's one observation of the DUT's requestor events is attached. */
let observing = false;

/**
 * How long a step waits for an event the DUT owes it once the stimulus is over.
 *
 * Covers the 30 s from the DUT's return that the controller's `RebootResubscribeArmer` waits before it
 * resubscribes to a DUT that did not resume the subscription itself: a step after a restart is told of
 * nothing until then.
 */
const EVENT_WAIT = Seconds(45);

/** How long step 2 waits for the DUT's `QueryImage` once announced. */
const QUERY_WAIT = Seconds(30);

/** Budget for a step whose update runs to the apply and the restart that follows it. */
const UPDATE_TIMEOUT = Seconds(180);

/** How long the DUT has to restart into the applied version and report it. */
const NOTIFY_APPLIED_TIMEOUT = Seconds(30);

/**
 * The `DelayedActionTime` step 2's `Busy` answer and step 6's `AwaitNextAction` carry.
 *
 * Step 6 starts as the DUT returns from step 4's restart. The DUT discards what it recorded when it restarts
 * again, so this must outlast the controller's resubscription (see {@link EVENT_WAIT}) for step 6's
 * DelayedOnApply to reach the subscriber before the apply that follows.
 */
const BUSY_DELAYED_ACTION_TIME = 60;

/**
 * Starts collecting the DUT's requestor events afresh for the step about to run its stimulus.
 *
 * One observation serves the whole case, through the controller's own sustained subscription rather
 * than one per step: a subscription of the step's own is a second session, and the controller drops
 * every session to a peer that reports `ShutDown` — which this DUT does on its way into the version it
 * applied, while it is still flushing the transitions the step is about.
 */
async function watchRequestor(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));
    try {
        received.length = 0;
        if (!observing) {
            await node.observeEvents(
                [
                    { cluster: OTA_REQUESTOR_EVENTS.cluster, event: OTA_REQUESTOR_EVENTS.stateTransition },
                    { cluster: OTA_REQUESTOR_EVENTS.cluster, event: OTA_REQUESTOR_EVENTS.downloadError },
                ],
                { onUpdate: event => received.push(event) },
            );
            observing = true;
        }
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

/** Waits until `predicate` holds over what has been received, or the budget runs out. */
async function untilReceived(predicate: () => boolean): Promise<boolean> {
    const deadline = Time.nowUs + EVENT_WAIT;
    while (Time.nowUs < deadline) {
        if (predicate()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return predicate();
}

/** The `NewState` of a `StateTransition` the subscription delivered, or `undefined` for anything else. */
function newStateOf(entry: EventReadEntry): unknown {
    if (entry.event !== OTA_REQUESTOR_EVENTS.stateTransition) {
        return undefined;
    }
    return typeof entry.value === "object" && entry.value !== null && "newState" in entry.value
        ? entry.value.newState
        : undefined;
}

/** Every state the subscriber saw the requestor enter, in the order the publisher numbered them. */
function statesSeen() {
    return received
        .filter(entry => entry.event === OTA_REQUESTOR_EVENTS.stateTransition)
        .sort((a, b) => (a.eventNumber < b.eventNumber ? -1 : a.eventNumber > b.eventNumber ? 1 : 0))
        .map(newStateOf);
}

/** A check that the subscriber was told the requestor entered `state`. */
function sawState(state: number): () => Promise<CheckRecord> {
    return async () => {
        const arrived = await untilReceived(() => statesSeen().includes(state));
        return {
            type: "response",
            verdict: arrived ? "pass" : "fail",
            detail:
                `the subscriber was told of ${statesSeen().map(updateStateName).join(", ") || "no state change"} ` +
                `within ${Duration.format(EVENT_WAIT)} after the stimulus, where this step is about ` +
                `${updateStateName(state)}`,
        };
    };
}

/** Step 1: a whole update, whose states the subscriber must be told of as the requestor passes through them. */
async function recordUpdateStates(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    await watchRequestor(cx);

    await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        expectApply: true,
        applyTimeoutMs: UPDATE_TIMEOUT,
        notifyAppliedTimeoutMs: NOTIFY_APPLIED_TIMEOUT,
        timeoutMs: Millis(UPDATE_TIMEOUT + NOTIFY_APPLIED_TIMEOUT),
    });

    await recordAll(cx, [
        { what: "the subscriber was told the requestor was Querying", check: sawState(OtaUpdateState.Querying) },
        { what: "the subscriber was told the requestor was Downloading", check: sawState(OtaUpdateState.Downloading) },
        { what: "the subscriber was told the requestor was Applying", check: sawState(OtaUpdateState.Applying) },
        {
            // The plan makes Idle optional, so its absence is not a defect; what it reports is what the
            // subscriber was told either way
            what: "the subscriber was told the requestor returned to Idle",
            check: async (): Promise<CheckRecord> => {
                await untilReceived(() => statesSeen().includes(OtaUpdateState.Idle));
                const states = statesSeen();
                return states.includes(OtaUpdateState.Idle)
                    ? {
                          type: "response",
                          verdict: "pass",
                          detail: `the subscriber was told of ${states.map(updateStateName).join(", ")}`,
                      }
                    : {
                          type: "response",
                          verdict: "unverified",
                          accepted:
                              "the plan makes the Idle transition optional, and the subscriber was not told of one " +
                              `within ${Duration.format(EVENT_WAIT)}`,
                      };
            },
        },
    ]);
}

/** Has the TH's provider answer `queryImage`, as a step failure rather than an exception. */
async function scriptQuery(cx: CertStepContext, ref: CertNodeRef, status: number, delayedActionTime?: number) {
    try {
        await cx.controllers.th.node(ref).scriptOtaProvider({ queryImage: [{ status, delayedActionTime }] });
    } catch (e) {
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
}

/** Step 2: a `Busy` answer, which holds the requestor on the provider it queried. */
async function recordDelayedOnQuery(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    await watchRequestor(cx);
    await scriptQuery(cx, ref, OtaQueryStatus.Busy, BUSY_DELAYED_ACTION_TIME);

    const node = cx.controllers.th.node(ref);
    const announced = await attempt(
        () => node.announceOtaProvider({ timeoutMs: QUERY_WAIT }),
        ({ exchanges }) =>
            `the TH answered ${exchanges.queryImage.length} QueryImage command(s), the first with status ` +
            `${exchanges.queryImage[0]?.response.status}`,
    );

    await recordAll(cx, [
        {
            what: "the DUT queried the TH, which answered Busy",
            check: (): CheckRecord =>
                announced.ok
                    ? {
                          ...announced.check,
                          verdict:
                              announced.value.exchanges.queryImage[0]?.response.status === OtaQueryStatus.Busy
                                  ? "pass"
                                  : "fail",
                      }
                    : announced.check,
        },
        {
            what: "the subscriber was told the requestor was DelayedOnQuery",
            check: sawState(OtaUpdateState.DelayedOnQuery),
        },
    ]);
}

/** Step 4: the TH asks the DUT to obtain consent, which the requestor reports waiting for. */
async function recordDelayedOnUserConsent(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    await watchRequestor(cx);
    try {
        await cx.controllers.th.node(ref).scriptOtaProvider({ queryImage: [{ userConsentNeeded: true }] });
    } catch (e) {
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }

    await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        expectApply: true,
        applyTimeoutMs: UPDATE_TIMEOUT,
        notifyAppliedTimeoutMs: NOTIFY_APPLIED_TIMEOUT,
        timeoutMs: Millis(UPDATE_TIMEOUT + NOTIFY_APPLIED_TIMEOUT),
    });

    await recordAll(cx, [
        {
            what: "the subscriber was told the requestor was DelayedOnUserConsent",
            check: sawState(OtaUpdateState.DelayedOnUserConsent),
        },
    ]);
}

/** Step 6: an `AwaitNextAction`, which holds the downloaded image back and is reported as such. */
async function recordDelayedOnApply(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    await watchRequestor(cx);
    try {
        await cx.controllers.th.node(ref).scriptOtaProvider({
            applyUpdate: [{ action: OtaApplyAction.AwaitNextAction, delayedActionTime: BUSY_DELAYED_ACTION_TIME }],
        });
    } catch (e) {
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }

    await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        expectApply: true,
        applyTimeoutMs: UPDATE_TIMEOUT,
        notifyAppliedTimeoutMs: NOTIFY_APPLIED_TIMEOUT,
        timeoutMs: Millis(UPDATE_TIMEOUT + NOTIFY_APPLIED_TIMEOUT),
    });

    await recordAll(cx, [
        {
            what: "the subscriber was told the requestor was DelayedOnApply",
            check: sawState(OtaUpdateState.DelayedOnApply),
        },
    ]);
}

/**
 * Step 7: `VersionApplied`, read rather than subscribed to, as the plan asks: the DUT's event log as the
 * version it restarted into reports it.
 */
async function recordVersionApplied(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));

    const events = await attempt(
        () => node.readEvents([{ cluster: OTA_REQUESTOR_EVENTS.cluster, event: OTA_REQUESTOR_EVENTS.versionApplied }]),
        entries => `the DUT reported ${entries.length} VersionApplied event(s)`,
    );
    const running = await attempt(
        () => node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION_ID, attribute: SOFTWARE_VERSION_ID }),
        value => `the DUT reports SoftwareVersion ${value}`,
    );
    const product = await attempt(
        () => node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION_ID, attribute: PRODUCT_ID }),
        value => `the DUT reports ProductID ${value}`,
    );

    const latest = events.ok
        ? events.value.reduce<EventReadEntry | undefined>(
              (newest, entry) => (newest === undefined || entry.eventNumber > newest.eventNumber ? entry : newest),
              undefined,
          )
        : undefined;
    const value = typeof latest?.value === "object" && latest.value !== null ? latest.value : undefined;
    const eventVersion = value !== undefined && "softwareVersion" in value ? value.softwareVersion : undefined;
    const eventProduct = value !== undefined && "productId" in value ? value.productId : undefined;

    await recordAll(cx, [
        {
            what: "the DUT reported a VersionApplied event",
            check: (): CheckRecord =>
                events.ok ? { ...events.check, verdict: latest === undefined ? "fail" : "pass" } : events.check,
        },
        {
            what: "its SoftwareVersion is the one the DUT now runs",
            check: (): CheckRecord =>
                running.ok
                    ? {
                          type: "response",
                          verdict: eventVersion === running.value ? "pass" : "fail",
                          detail: `the event names SoftwareVersion ${eventVersion}, and ${running.check.detail}`,
                      }
                    : running.check,
        },
        {
            what: "its ProductID is the one the DUT reports",
            check: (): CheckRecord =>
                product.ok
                    ? {
                          type: "response",
                          verdict: eventProduct === product.value ? "pass" : "fail",
                          detail: `the event names ProductID ${eventProduct}, and ${product.check.detail}`,
                      }
                    : product.check,
        },
    ]);
}

certTest("TC-SU-2.7", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller, as in TC-SU-2.1.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,

    // Step 7 reads the event the DUT writes on the boot into the version it applied.  The spec floors, which
    // MATTER_CERT_OTA_FAST_RETRY would otherwise shorten, keep step 2's Busy retry from querying again before the next
    // step scripts its own answer.
    appArgs: { dut: { matterjs: [REBOOT_AFTER_APPLY_ARG, SPEC_INTERVALS_ARG] } },

    // chip's ota-requestor-app exits once it applies, which the harness reads as the DUT dying mid-run.
    flavors: ["matterjs"],
})
    .step(
        "0",
        "Precondition: TH and DUT are on the same fabric, there is no ongoing OTA process on the DUT, and the " +
            "OTA-Subscriber subscribes to the DUT's OTA events.",
        async cx => {
            const th = cx.controllers.th;
            const dut = cx.devices.dut;

            const ref = await th.commission({
                passcode: dut.commissioning.passcode,
                discriminator: dut.commissioning.discriminator,
            });
            commissioned.set("th", ref);

            await recordRequestorIdle(cx, th.node(ref));
        },
        {
            expected:
                "The TH holds the DUT on its fabric with the ACL entries commissioning installs, and reading the " +
                "UpdateState Attribute of the OTA Requestor returns Idle. The TH is also the OTA-Subscriber: each " +
                "step collects the DUT's requestor events from before the stimulus it is about, and a step after a " +
                "restart is told of them once the TH's subscription to the DUT is live again.",
        },
    )
    .step(1, "Perform a software update on the DUT. (11.19.7.8)", recordUpdateStates, {
        expected:
            "Verify that the OTA-Subscriber receives a StateTransition event notification for all the state " +
            "changes i.e. Querying, Downloading, Applying, Idle (optional).",
    })
    .step(
        2,
        "DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. " +
            'QueryStatus is set to "Busy". (11.19.7.8)',
        recordDelayedOnQuery,
        {
            expected:
                "Verify that the OTA-Subscriber receives a StateTransition event notification for the state change " +
                "to DelayedOnQuery.",
        },
    )
    .step(
        3,
        "DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P does not respond back to DUT. (11.19.7.8)",
        async () => {},
        {
            notApplicable:
                "the TH's provider answers every QueryImage it receives, and nothing in this suite can hold a " +
                "response back while leaving the DUT commissioned and reachable",
            expected:
                "Verify that the OTA-Subscriber receives a StateTransition event notification for the state change " +
                "to Idle.",
        },
    )
    .step(
        4,
        "DUT sends a QueryImage command to the TH/OTA-P. RequestorCanConsent is set to True by DUT. OTA-P/TH " +
            "responds with a QueryImageResponse with UserConsentNeeded field set to True. (11.19.7.8)",
        recordDelayedOnUserConsent,
        {
            pics: "MCORE.OTA.RequestorConsent",
            expected:
                "Verify that the OTA-Subscriber receives a StateTransition event notification for the state change " +
                "to DelayedOnUserConsent.",
        },
    )
    .step(
        5,
        "Force an error during the download of the OTA image to the DUT. Wait for the Idle timeout which should " +
            "be no less than 5 minutes. (11.19.7.8)",
        async () => {},
        {
            notApplicable:
                "the harness cannot fail a transfer part way: the TH serves the image as a BDX responder, and " +
                "nothing in this suite can drop its exchange while leaving the DUT able to report the error",
            expected:
                "Verify that the OTA-Subscriber receives a StateTransition event notification for the state change " +
                "to Idle. Verify that the OTA-Subscriber receives a DownloadError event notification on BDX Idle " +
                "timeout, carrying SoftwareVersion, BytesDownloaded, ProgressPercent and PlatformCode.",
        },
    )
    .step(
        6,
        "After the OTA image is transferred, DUT sends ApplyUpdateRequest to the OTA-P. OTA-P/TH sends the " +
            'ApplyUpdateResponse Command to the DUT. Action field is set to "AwaitNextAction". (11.19.7.8)',
        recordDelayedOnApply,
        {
            expected:
                "Verify that the OTA-Subscriber receives a StateTransition event notification for the state change " +
                "to DelayedOnApply.",
        },
    )
    .step(
        7,
        "DUT successfully finishes applying a software update, and the new software image version is being " +
            "executed on the DUT. OTA-Subscriber sends a read request to read the VersionApplied event from the " +
            "DUT. (11.19.7.8)",
        recordVersionApplied,
        {
            expected:
                "Verify that the VersionApplied event is generated whenever a new version starts executing after " +
                "being applied due to a software update. SoftwareVersion - same as the SoftwareVersion attribute " +
                "of the Basic Information Cluster for the newly executing version. ProductID - same as the " +
                "ProductID attribute of the Basic Information Cluster.",
        },
    )
    .finalize(cx => {
        received.length = 0;
        observing = false;
        return commissioned.decommissionAll(cx);
    });
