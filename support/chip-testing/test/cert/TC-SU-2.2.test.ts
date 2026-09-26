/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type {
    CertStepContext,
    CheckRecord,
    OtaAnnouncement,
    OtaQueryImageResponseRecord,
    OtaScriptedQueryAnswer,
} from "@matter/testing";
import { certTest, UnsupportedByControllerError } from "@matter/testing";
import { SPEC_INTERVALS_ARG } from "../../src/OtaRequestorTestInstance.js";
import { BDX_RECEIVER_ROLES, serveOtaTransfer } from "./tc-bdx-support.js";
import {
    OtaQueryStatus,
    queryStatusName,
    recordRequestorIdle,
    requestorStateChanges,
    UPDATE_STATE_DOWNLOADING,
} from "./tc-su-support.js";
import { CertCheckFailedError, CommissionedRefs, recordAll, requireId } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const SOFTWARE_VERSION_ID = requireId(
    BASIC_INFORMATION.attributes.require("softwareVersion").id,
    "BasicInformation.softwareVersion",
);

/** The spacing § 11.20.3.2 requires between two queries, which steps 2 and 3 watch for. */
const QUERY_WINDOW = Seconds(120);

/**
 * How long steps 2 and 3 keep recording past the window: long enough for a conformant requestor's retry,
 * due the moment the window ends, to land in the step's own record rather than in the next one's.
 */
const RETRY_MARGIN = Seconds(15);

/**
 * How long a step waits for the DUT to query once announced to.
 *
 * Above the two minutes § 11.20.3.2 puts between two queries, because the announcement arrives soon after
 * the DUT's last query and a requestor honoring that rule holds the next one back until it has passed.
 */
const SPACED_QUERY_TIMEOUT = Seconds(150);

/** The `DelayedActionTime` of step 2's `Busy` answer, below the two-minute floor as the plan states it. */
const STEP_2_DELAYED_ACTION_TIME = 60;

/** The `DelayedActionTime` of step 4's `Busy` answer, which the plan asks the DUT to wait out. */
const STEP_4_DELAYED_ACTION_TIME = 180;

/**
 * How long steps 6 and 7 watch the DUT after offering it an update it must refuse. A requestor accepting
 * the offer starts the transfer within seconds of the answer.
 */
const REFUSAL_WINDOW = Seconds(30);

/** A BDX `ImageURI` whose authority is not a node ID, so it names no provider at all. */
const INVALID_IMAGE_URI = "bdx://not-a-node-id/ota/image";

/** The authority § 11.20.6.5.2.3 requires of a BDX `ImageURI`: a node ID as sixteen uppercase hex characters. */
const BDX_NODE_AUTHORITY = /^bdx:\/\/[0-9A-F]{16}\//;

/**
 * Scripts the TH's provider answers and announces the TH to the DUT, which then queries it.
 *
 * Each step scripts the answer it is about and one more for a conformant retry: the image step 1 staged
 * stays in the TH's catalog, so an answer the TH computed itself would offer it again and start a transfer
 * inside the window.
 */
async function announceWith(
    cx: CertStepContext,
    queryImage: OtaScriptedQueryAnswer[],
    options: { timeoutMs?: number; observeMs?: number },
): Promise<OtaAnnouncement> {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));
    try {
        await node.scriptOtaProvider({ queryImage });
        return await node.announceOtaProvider(options);
    } catch (e) {
        // Before the check, not after: the runner turns this into a skipped step only while the step has
        // recorded nothing
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
}

async function recordTransfer(cx: CertStepContext) {
    await serveOtaTransfer(cx, commissioned.require("th", "the DUT"), { sender: "th", receiver: "dut" });
}

/**
 * Steps 2 and 3: the TH answers `answer`, and the DUT must not query again within two minutes of the query
 * it answered (§ 11.20.3.2).
 */
function recordNoQueryInWindow(answer: OtaScriptedQueryAnswer) {
    return async (cx: CertStepContext) => {
        // The second answer is for a conformant retry once the window has passed
        const { exchanges, observedMs } = await announceWith(cx, [answer, { status: OtaQueryStatus.NotAvailable }], {
            timeoutMs: SPACED_QUERY_TIMEOUT,
            observeMs: QUERY_WINDOW + RETRY_MARGIN,
        });
        const watched = Millis(observedMs);
        const [answered, ...later] = exchanges.queryImage;
        const early = later.filter(({ receivedAtMs }) => receivedAtMs - answered.receivedAtMs < QUERY_WINDOW);
        const spacing = later.map(({ receivedAtMs }) => Duration.format(Millis(receivedAtMs - answered.receivedAtMs)));

        await recordAll(cx, [
            {
                what: `the TH answered the DUT's QueryImage ${queryStatusName(answer.status ?? -1)}`,
                check: () => ({
                    type: "response",
                    verdict:
                        answered?.response.status === answer.status &&
                        answered.response.delayedActionTime === answer.delayedActionTime
                            ? "pass"
                            : "fail",
                    detail:
                        answered === undefined
                            ? "the DUT sent no QueryImage"
                            : `the TH answered ${queryStatusName(answered.response.status)} with DelayedActionTime ` +
                              `${answered.response.delayedActionTime ?? "(absent)"}`,
                }),
            },
            {
                // Without the wait no second query can be in the record, whatever the DUT does next
                what: "the TH watched the whole window after that answer",
                check: () => ({
                    type: "response",
                    verdict: watched >= QUERY_WINDOW ? "pass" : "fail",
                    detail: `the TH watched for ${Duration.format(watched)}, against the plan's ${Duration.format(QUERY_WINDOW)}`,
                }),
            },
            {
                what: "the DUT sent no further QueryImage in the two minutes after that answer",
                check: () => ({
                    type: "response",
                    verdict: early.length === 0 ? "pass" : "fail",
                    detail:
                        "the DUT queried again " +
                        (spacing.length === 0 ? "not at all" : `after ${spacing.join(", ")}`) +
                        ` within the ${Duration.format(watched)} watched`,
                }),
            },
        ]);
    };
}

/**
 * Step 4: the TH answers `Busy` with three minutes, then offers the image on the DUT's next query, which
 * must not come sooner.
 */
async function recordBusyThenTransfer(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    try {
        await cx.controllers.th.node(ref).scriptOtaProvider({
            queryImage: [{ status: OtaQueryStatus.Busy, delayedActionTime: STEP_4_DELAYED_ACTION_TIME }],
        });
    } catch (e) {
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }

    // The budget covers a query the DUT holds back for the two-minute spacing, the delay the TH named, and
    // the whole update that follows the second answer
    const { transfer } = await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        timeoutMs: SPACED_QUERY_TIMEOUT + Seconds(STEP_4_DELAYED_ACTION_TIME + 90),
    });
    const [busy, available] = transfer.exchanges.queryImage;
    const waited =
        busy !== undefined && available !== undefined ? available.receivedAtMs - busy.receivedAtMs : undefined;

    await recordAll(cx, [
        {
            what: "the TH answered the DUT's first QueryImage Busy with three minutes",
            check: () => ({
                type: "response",
                verdict:
                    busy?.response.status === OtaQueryStatus.Busy &&
                    busy.response.delayedActionTime === STEP_4_DELAYED_ACTION_TIME
                        ? "pass"
                        : "fail",
                detail:
                    busy === undefined
                        ? "the DUT sent no QueryImage"
                        : `the TH answered ${queryStatusName(busy.response.status)} with DelayedActionTime ` +
                          `${busy.response.delayedActionTime ?? "(absent)"}`,
            }),
        },
        {
            what: "the DUT waited at least the DelayedActionTime before querying again",
            check: () => ({
                type: "response",
                verdict: waited !== undefined && waited >= Seconds(STEP_4_DELAYED_ACTION_TIME) ? "pass" : "fail",
                detail:
                    waited === undefined
                        ? `the DUT sent ${transfer.exchanges.queryImage.length} QueryImage command(s)`
                        : `the DUT queried again ${Duration.format(Millis(waited))} after the Busy answer, against ` +
                          `the ${Duration.format(Seconds(STEP_4_DELAYED_ACTION_TIME))} it was told`,
            }),
        },
        {
            what: "the TH answered that query UpdateAvailable, and the transfer followed it",
            check: () => ({
                type: "response",
                verdict:
                    available?.response.status === OtaQueryStatus.UpdateAvailable &&
                    transfer.transferredBytes === transfer.fileSize
                        ? "pass"
                        : "fail",
                detail:
                    `the TH answered the second query ${queryStatusName(available?.response.status ?? -1)}, and the ` +
                    `DUT took ${transfer.transferredBytes} of ${transfer.fileSize} bytes of version ${transfer.softwareVersion}`,
            }),
        },
    ]);
}

async function readSoftwareVersion(cx: CertStepContext) {
    const running = await cx.controllers.th.node(commissioned.require("th", "the DUT")).readAttribute({
        endpoint: 0,
        cluster: BASIC_INFORMATION_ID,
        attribute: SOFTWARE_VERSION_ID,
    });
    if (typeof running !== "number") {
        throw new CertCheckFailedError(`the DUT reported SoftwareVersion ${running}, which is not a number`);
    }
    return running;
}

/**
 * Steps 6 and 7: the TH offers an update the DUT must refuse, and the DUT must not start transferring it.
 *
 * A requestor starting a transfer enters `Downloading` and records the `StateTransition`, whatever becomes
 * of the transfer after, so the events it holds say whether it started one.
 */
async function recordNoTransferOf(
    cx: CertStepContext,
    offer: OtaScriptedQueryAnswer,
    offered: (response: OtaQueryImageResponseRecord) => CheckRecord,
) {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));
    const before = await requestorStateChanges(node);
    const after = before.reduce<bigint | undefined>(
        (latest, { eventNumber }) => (latest === undefined || eventNumber > latest ? eventNumber : latest),
        undefined,
    );

    const { exchanges, observedMs } = await announceWith(cx, [offer, { status: OtaQueryStatus.NotAvailable }], {
        timeoutMs: SPACED_QUERY_TIMEOUT,
        observeMs: REFUSAL_WINDOW,
    });
    const watched = Millis(observedMs);
    const [query] = exchanges.queryImage;
    const changes = await requestorStateChanges(node, after);
    const downloading = changes.filter(({ newState }) => newState === UPDATE_STATE_DOWNLOADING);
    const unreadable = changes.filter(({ newState }) => typeof newState !== "number");

    await recordAll(cx, [
        {
            what: "the TH answered the DUT's QueryImage UpdateAvailable with the offer the step describes",
            check: () =>
                query?.response.status === OtaQueryStatus.UpdateAvailable
                    ? offered(query.response)
                    : {
                          type: "response",
                          verdict: "fail",
                          detail:
                              query === undefined
                                  ? "the DUT sent no QueryImage"
                                  : `the TH answered ${queryStatusName(query.response.status)}`,
                      },
        },
        {
            // A transition whose state cannot be read might be the one into Downloading
            what: "the DUT did not start transferring the image",
            check: () => ({
                type: "response",
                verdict:
                    watched >= REFUSAL_WINDOW && downloading.length === 0 && unreadable.length === 0 ? "pass" : "fail",
                detail:
                    `the DUT's requestor recorded ${changes.length} state transition(s) in the ` +
                    `${Duration.format(watched)} watched after the answer, ${downloading.length} of them into ` +
                    `Downloading (${UPDATE_STATE_DOWNLOADING})` +
                    (unreadable.length === 0 ? "" : ` and ${unreadable.length} without a readable NewState`),
            }),
        },
    ]);
    await recordRequestorIdle(cx, node);
}

async function recordOlderVersionRefused(cx: CertStepContext) {
    const running = await readSoftwareVersion(cx);
    await recordNoTransferOf(cx, { status: OtaQueryStatus.UpdateAvailable, softwareVersion: running }, response => ({
        type: "response",
        verdict: response.softwareVersion !== undefined && response.softwareVersion <= running ? "pass" : "fail",
        detail: `the TH offered SoftwareVersion ${response.softwareVersion}, against the ${running} the DUT reports it runs`,
    }));
}

async function recordInvalidUriRefused(cx: CertStepContext) {
    await recordNoTransferOf(cx, { status: OtaQueryStatus.UpdateAvailable, imageUri: INVALID_IMAGE_URI }, response => {
        const invalid = response.imageUri !== undefined && !BDX_NODE_AUTHORITY.test(response.imageUri);
        return {
            type: "response",
            verdict: invalid ? "pass" : "fail",
            detail:
                `the TH offered ImageURI ${response.imageUri}, whose authority ` +
                (invalid ? "is not" : "is") +
                " a node ID as sixteen uppercase hex characters",
        };
    });
}

certTest("TC-SU-2.2", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller, as in TC-SU-2.1.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,

    // The spacing steps 2 to 4 check is the DUT's own; a matter.js DUT keeps it whatever the run shortens
    appArgs: { dut: { matterjs: [SPEC_INTERVALS_ARG] } },
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
        },
        {
            expected:
                "The TH holds the DUT on its fabric with the ACL entries commissioning installs, and reading the " +
                "UpdateState Attribute of the OTA Requestor returns Idle.",
        },
    )
    .step(
        1,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "UpdateAvailable". Set ImageURI to the location where the image is located. (11.19.6.8)',
        recordTransfer,
        {
            expected: "Verify that there is a transfer of the software image from the TH/OTA-P to the DUT.",
        },
    )
    .step(
        2,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "Busy", DelayedActionTime is set to 60 seconds. (11.19.6.8)',
        recordNoQueryInWindow({ status: OtaQueryStatus.Busy, delayedActionTime: STEP_2_DELAYED_ACTION_TIME }),
        {
            longRunning: "the plan watches the DUT for two minutes after a Busy answer",
            expected:
                "Verify that the DUT does not send a QueryImage command before the minimum interval defined by spec " +
                "which is 2 minutes (120 seconds) from the last QueryImage command.",
        },
    )
    .step(
        3,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "NotAvailable". (11.19.6.8)',
        recordNoQueryInWindow({ status: OtaQueryStatus.NotAvailable }),
        {
            longRunning: "the plan watches the DUT for two minutes after a NotAvailable answer",
            expected:
                "Verify that the DUT does not send a QueryImage command before the minimum interval defined by spec " +
                "which is 2 minutes (120 seconds) from the last QueryImage command.",
        },
    )
    .step(
        4,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to Busy, Set DelayedActionTime to 3 minutes. On the subsequent QueryImage command, TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "UpdateAvailable". (11.19.6.8)',
        recordBusyThenTransfer,
        {
            longRunning: "the DUT waits out the three minutes the TH named",
            expected:
                "Verify that the DUT waits for at least the time mentioned in the DelayedActionTime (3 minutes) " +
                "before issuing another QueryImage command to the TH/OTA-P. Verify that there is a transfer of the " +
                "software image after the second QueryImageResponse with UpdateAvailable status from the TH/OTA-P to " +
                "the DUT.",
        },
    )
    .step(
        5,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "UpdateAvailable", ImageURI should have the https url from where the image can be downloaded. (11.19.6.8)',
        async () => {},
        {
            pics: "MCORE.OTA.HTTPS",
            notApplicable:
                "the TH's provider offers images over BDX only, so it cannot give the https ImageURI this step needs",
            expected: "Verify that the DUT queries the https url and downloads the software image.",
        },
    )
    .step(
        6,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "UpdateAvailable", Software Version should be set to the same or an older (numerically lower) version. (11.19.3.2)',
        recordOlderVersionRefused,
        {
            expected: "Verify that the DUT does not start transferring the software image.",
        },
    )
    .step(
        7,
        'DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. QueryStatus is set to "UpdateAvailable", ImageURI field contains an invalid BDX ImageURI. (11.19.3.2)',
        recordInvalidUriRefused,
        {
            expected: "Verify that the DUT does not start transferring the software image.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
