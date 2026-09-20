/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertNodeRef, CertStepContext, OtaAnnouncementRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import { announcementLines, announcementReasonName, OtaAnnouncementReason } from "./tc-su-support.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    expectSequence,
    LOG_TIMEOUT,
    record,
    recordAll,
    runCleanups,
} from "./tc-support.js";

/**
 * One `CommissionedRefs` per device, keyed by the controller role that commissioned it: the plan's
 * two devices share one controller, and `decommissionAll` resolves its key through `cx.controllers`.
 */
const commissionedRequestor = new CommissionedRefs();
const commissionedProvider = new CommissionedRefs();

/** Device type id of the OTA Provider device type (Matter Device Library § 2.7). */
const OTA_PROVIDER_DEVICE_TYPE = 0x14;

certTest("TC-SU-1.1", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.ACL.Administrator"],
    app: "ota-requestor",
    devices: { th: "ota-requestor", th2: "ota-provider" },
})
    .step(
        "0",
        "Precondition: OTA-R/TH and the DUT are on the same fabric, as the plan's Test Setup requires. OTA-P/TH2 " +
            "is commissioned in step 1.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const requestor = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissionedRequestor.set("dut", requestor);

            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `the DUT commissioned the OTA-R/TH as node ${requestor}`,
                },
                "the OTA-R/TH is on the DUT's fabric",
            );
        },
        { expected: "The DUT holds OTA-R/TH on its fabric." },
    )
    .step(
        1,
        "Commission OTA-P/TH2 to DUT/same fabric as in test setup. (11.19.7.7)",
        async (cx: CertStepContext) => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;
            const th2 = cx.devices.th2;

            const provider: CertNodeRef = await dut.commission({
                passcode: th2.commissioning.passcode,
                discriminator: th2.commissioning.discriminator,
            });
            commissionedProvider.set("dut", provider);

            const requestor = commissionedRequestor.get("dut");
            if (requestor === undefined) {
                throw new CertCheckFailedError("the OTA-R/TH was not commissioned by the preceding step");
            }

            const from = await th.log.markSettled();

            // The plan's own Notes: "Vendor needs to mention steps on how to trigger the
            // AnnounceOTAProvider Command." This is that trigger, and the fields are the DUT's own:
            // it names the node it just commissioned, the endpoint it holds that node's provider
            // cluster on, and its own vendor id.
            const { announcement }: { announcement: OtaAnnouncementRecord } = await dut
                .node(requestor)
                .announceOtaProvider({
                    provider,
                    announcementReason: OtaAnnouncementReason.SimpleAnnouncement,
                });

            await recordAll(cx, [
                {
                    what: "ProviderNodeID is the OTA-P/TH2 on the accessing fabric",
                    check: () => ({
                        type: "response",
                        verdict: announcement.providerNodeId === provider ? "pass" : "fail",
                        detail:
                            `the DUT announced node ${announcement.providerNodeId}, having commissioned the ` +
                            `OTA-P/TH2 as node ${provider}`,
                    }),
                },
                {
                    what: "AnnouncementReason is SimpleAnnouncement",
                    check: () => ({
                        type: "response",
                        verdict:
                            announcement.announcementReason === OtaAnnouncementReason.SimpleAnnouncement
                                ? "pass"
                                : "fail",
                        detail: `the DUT announced ${announcementReasonName(announcement.announcementReason)}`,
                    }),
                },
                {
                    // Against what the OTA-P/TH2 itself publishes, read back from the DUT's structure
                    // read of it. Asking whether the announced endpoint is a number would be asking the
                    // step about a value it produced moments earlier.
                    what: "Endpoint is the endpoint the OTA-P/TH2 carries its provider cluster on",
                    check: async () => {
                        const endpoints = await dut.node(provider).clientEndpoints();
                        const carrying = endpoints
                            .filter(entry => entry.deviceTypes.includes(OTA_PROVIDER_DEVICE_TYPE))
                            .map(entry => entry.endpoint);
                        return {
                            type: "response",
                            verdict: carrying.includes(announcement.endpoint) ? "pass" : "fail",
                            detail:
                                `the DUT named endpoint ${announcement.endpoint}, and the OTA-P/TH2 publishes the ` +
                                `OTA Provider device type on endpoint(s) ${carrying.join(", ") || "none"}`,
                        };
                    },
                },
                {
                    // The VendorID claim rests here rather than on a check of its own: the DUT fills
                    // that field in from its own BasicInformation, so the only independent account of
                    // it is the one the OTA-R/TH logs for the command it received. MetadataForNode is
                    // optional and the DUT sends none.
                    what:
                        "the OTA-R/TH received the command with the ProviderNodeID, VendorID, reason and endpoint " +
                        "the DUT sent",
                    check: () =>
                        expectSequence(
                            th.log,
                            th.flavor,
                            "AnnounceOTAProvider the OTA-R/TH received",
                            announcementLines(announcement),
                            from,
                            LOG_TIMEOUT,
                        ),
                },
            ]);
        },
        {
            pics: "OTAR.C.M.AnnounceOTAProvider",
            expected:
                "Verify that the DUT invokes AnnounceOTAProvider command on the OTA-R. Verify that the command " +
                "received contains the following mandatory fields. ProviderNodeID of the OTA-P/TH2 on the accessing " +
                "fabric. Vendor Id of the node invoking this command. Should be same as it appears in the Node's " +
                "Basic Information Cluster. AnnouncementReason - Should be SimpleAnnouncement. MetadataForNode - " +
                "Optional. Endpoint number of the OTA-P/TH2 on the ProviderNodeID.",
        },
    )
    .finalize(cx =>
        runCleanups(
            () => commissionedRequestor.decommissionAll(cx),
            () => commissionedProvider.decommissionAll(cx),
        ),
    );
