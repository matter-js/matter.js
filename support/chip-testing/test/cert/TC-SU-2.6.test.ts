/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Seconds } from "@matter/main";
import { GeneralDiagnostics } from "@matter/main/clusters";
import { Matter } from "@matter/model";
import type { CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import { REBOOT_AFTER_APPLY_ARG } from "../../src/OtaRequestorTestInstance.js";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { BDX_RECEIVER_ROLES, serveOtaTransfer, transferOrFail } from "./tc-bdx-support.js";
import { recordRequestorIdle, singleQueryImage } from "./tc-su-support.js";
import { CertCheckFailedError, CommissionedRefs, recordAll, requireId } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

/** The update step 1 served, which step 2's boot follows from. */
let served: BdxTransferEvidence | undefined;

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const SOFTWARE_VERSION_ID = requireId(
    BASIC_INFORMATION.attributes.require("softwareVersion").id,
    "BasicInformation.softwareVersion",
);

const GENERAL_DIAGNOSTICS = Matter.clusters.require("GeneralDiagnostics");
const GENERAL_DIAGNOSTICS_ID = requireId(GENERAL_DIAGNOSTICS.id, "GeneralDiagnostics cluster");
const BOOT_REASON_ID = requireId(
    GENERAL_DIAGNOSTICS.attributes.require("bootReason").id,
    "GeneralDiagnostics.bootReason",
);

/** How long the DUT has to restart into the new version and report it, once the TH allowed the apply. */
const NOTIFY_APPLIED_TIMEOUT = Seconds(30);

async function recordNotifyUpdateApplied(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    served = await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        expectApply: true,
        notifyAppliedTimeoutMs: NOTIFY_APPLIED_TIMEOUT,
    });

    const { transfer } = served;
    const query = singleQueryImage(transfer.exchanges);
    const notifications = transfer.exchanges.notifyUpdateApplied;
    const [notification] = notifications;

    // Read after the notification, so it answers for the boot that sent it
    const running = await cx.controllers.th.node(ref).readAttribute({
        endpoint: 0,
        cluster: BASIC_INFORMATION_ID,
        attribute: SOFTWARE_VERSION_ID,
    });

    const aboutNotification = (build: (sent: { updateToken: string; softwareVersion: number }) => CheckRecord) => () =>
        notification === undefined
            ? ({
                  type: "response",
                  verdict: "fail",
                  detail: "the DUT sent no NotifyUpdateApplied",
              } satisfies CheckRecord)
            : build(notification);

    await recordAll(cx, [
        {
            what: "the DUT sent one NotifyUpdateApplied after installing the update",
            check: () => ({
                type: "response",
                verdict: notifications.length === 1 ? "pass" : "fail",
                detail:
                    `the TH received ${notifications.length} NotifyUpdateApplied command(s) within ` +
                    `${Duration.format(NOTIFY_APPLIED_TIMEOUT)} of allowing the apply`,
            }),
        },
        {
            what: "UpdateToken is the one the TH sent in its QueryImageResponse",
            check: aboutNotification(({ updateToken }) => ({
                type: "response",
                verdict:
                    query.response.updateToken !== undefined && updateToken === query.response.updateToken
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT sent update token ${updateToken}, and the TH answered its QueryImage with ` +
                    `${query.response.updateToken ?? "no token"}`,
            })),
        },
        {
            what: "SoftwareVersion is the version the DUT downloaded",
            check: aboutNotification(({ softwareVersion }) => ({
                type: "response",
                verdict: softwareVersion === transfer.softwareVersion ? "pass" : "fail",
                detail:
                    `the DUT reported version ${softwareVersion} applied, having downloaded ` +
                    `${transfer.transferredBytes} of ${transfer.fileSize} bytes of version ${transfer.softwareVersion}`,
            })),
        },
        {
            // The plan's "verify the software version on the DUT": what it runs, read from it rather than
            // taken from the command that claims it
            what: "the DUT runs the version it downloaded",
            check: () => ({
                type: "response",
                verdict: running === transfer.softwareVersion ? "pass" : "fail",
                detail: `the DUT reports SoftwareVersion ${running} in Basic Information, against the downloaded ${transfer.softwareVersion}`,
            }),
        },
    ]);
}

async function recordBootReason(cx: CertStepContext) {
    // The boot this reads is the one step 1's update caused, so without that update there is nothing to
    // ask about
    if (transferOrFail(served).transfer.exchanges.notifyUpdateApplied.length !== 1) {
        throw new CertCheckFailedError("step 1 observed no restart into the new version for this step to read");
    }

    const bootReason = await cx.controllers.th.node(commissioned.require("th", "the DUT")).readAttribute({
        endpoint: 0,
        cluster: GENERAL_DIAGNOSTICS_ID,
        attribute: BOOT_REASON_ID,
    });

    await recordAll(cx, [
        {
            what: "BootReason is SoftwareUpdateCompleted",
            check: () => ({
                type: "response",
                verdict: bootReason === GeneralDiagnostics.BootReason.SoftwareUpdateCompleted ? "pass" : "fail",
                detail: `the DUT reports BootReason ${bootReason}, where SoftwareUpdateCompleted is ${GeneralDiagnostics.BootReason.SoftwareUpdateCompleted}`,
            }),
        },
    ]);
}

certTest("TC-SU-2.6", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller, as in TC-SU-2.1.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,

    // A requestor sends NotifyUpdateApplied once it runs the new version, which takes a restart into it.
    // The matter.js subject restarts in process when asked to; chip's app cannot restart into the image
    // this harness stages, and exits once it applies.
    appArgs: { dut: { matterjs: [REBOOT_AFTER_APPLY_ARG] } },
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
        },
        {
            expected:
                "The TH holds the DUT on its fabric, and reading the UpdateState Attribute of the OTA Requestor " +
                "returns Idle. The plan's Test Setup — QueryImageResponse UpdateAvailable, the transfer, and an " +
                "ApplyUpdateResponse with Proceed — runs in step 1, since the notification follows from it.",
        },
    )
    .step(
        1,
        "DUT sends the NotifyUpdateApplied Command to the OTA-P after installing the software update. (11.19.6.12)",
        recordNotifyUpdateApplied,
        {
            pics: "OTAR.C.M.NotifyUpdateApplied",
            expected:
                "Verify that the NotifyUpdateApplied message received on the OTA-P has the following fields. " +
                "UpdateToken - verify that it is the same as the one provided by the OTA provider in the " +
                "QueryImageResponse. SoftwareVersion - verify the software version on the DUT to match the version " +
                "downloaded for the software update.",
        },
    )
    .step(2, "TH reads BootReason in General Diagnostics cluster from the DUT.", recordBootReason, {
        pics: "DGGEN.S.A0004",
        expected: "Verify that the returned value of BootReason is SoftwareUpdateCompleted.",
    })
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
