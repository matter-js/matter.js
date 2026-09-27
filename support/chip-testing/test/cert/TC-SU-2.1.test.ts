/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertStepContext, CheckRecord, OtaAnnouncement } from "@matter/testing";
import { certTest, UnsupportedByControllerError } from "@matter/testing";
import { SPEC_INTERVALS_ARG } from "../../src/OtaRequestorTestInstance.js";
import { BDX_RECEIVER_ROLES } from "./tc-bdx-support.js";
import {
    announcementLines,
    OtaDownloadProtocol,
    OtaQueryStatus,
    queryStatusName,
    recordRequestorIdle,
    singleQueryImage,
} from "./tc-su-support.js";
import { CommissionedRefs, expectSequence, LOG_TIMEOUT, record, recordAll, requireId } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");

/** The `QueryImage` fields step 1 compares with the Basic Information attribute of the same name. */
type IdentityField = "vendorId" | "productId" | "softwareVersion" | "hardwareVersion" | "location";

/** How long the plan watches for a second `QueryImage` (step 2), and the spacing § 11.20.3.2 requires. */
const QUERY_WINDOW = Seconds(120);

/**
 * How long step 2 keeps recording past the window: long enough for a conformant requestor's retry, due
 * the moment the window ends, to land in step 2's own record rather than in step 3's.
 */
const RETRY_MARGIN = Seconds(15);

/**
 * The `DelayedActionTime` step 2's `Busy` answer carries: below the two-minute floor, so that only the
 * floor holds a conformant requestor back.
 */
const BUSY_DELAYED_ACTION_TIME = 1;

/**
 * How long a later step waits for the DUT to act on an announcement.
 *
 * Above the two minutes the specification puts between two queries (§ 11.20.3.2), because the
 * announcement arrives moments after the DUT's last query and a requestor honoring that rule holds
 * the next one back until it has passed.
 */
const SPACED_QUERY_TIMEOUT = Seconds(150);

/**
 * Announces the TH as the DUT's provider and returns what the TH's provider answered, recording a
 * failure where the DUT never queried, and with `recordAs` a pass naming the query where it did.
 *
 * The TH stages no image, so the answer is `NotAvailable`: the plan asks about the request, and a
 * transfer following it would put a second exchange into the window step 2 counts.
 */
async function announce(
    cx: CertStepContext,
    { recordAs, ...options }: { timeoutMs?: number; observeMs?: number; recordAs?: string } = {},
) {
    const ref = commissioned.require("th", "the DUT");
    let announced: OtaAnnouncement;
    try {
        announced = await cx.controllers.th.node(ref).announceOtaProvider(options);
    } catch (e) {
        // Before the check, not after: the runner turns this into a skipped step only while the step
        // has recorded nothing
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }

    if (recordAs !== undefined) {
        const { announcement, exchanges } = announced;
        const { request } = singleQueryImage(exchanges);
        record(
            cx,
            {
                type: "response",
                verdict: "pass",
                detail:
                    `the provider the DUT was told of, node ${announcement.providerNodeId} endpoint ` +
                    `${announcement.endpoint}, received its QueryImage for software version ${request.softwareVersion}`,
            },
            recordAs,
        );
    }

    return announced;
}

async function readIdentity(cx: CertStepContext): Promise<Record<IdentityField, unknown>> {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));
    const read = (attribute: IdentityField) =>
        node.readAttribute({
            endpoint: 0,
            cluster: BASIC_INFORMATION_ID,
            attribute: requireId(BASIC_INFORMATION.attributes.require(attribute).id, `BasicInformation.${attribute}`),
        });

    return {
        vendorId: await read("vendorId"),
        productId: await read("productId"),
        softwareVersion: await read("softwareVersion"),
        hardwareVersion: await read("hardwareVersion"),
        location: await read("location"),
    };
}

async function recordQueryImageFields(cx: CertStepContext) {
    const { exchanges } = await announce(cx);
    const { request } = singleQueryImage(exchanges);

    // Read over the wire after the query rather than taken from what the TH holds, so each field is
    // compared with the DUT's own answer rather than with a value the TH filled in
    const identity = await readIdentity(cx);

    const https = cx.picsMet("MCORE.OTA.HTTPS");
    const consent = cx.picsMet("MCORE.OTA.RequestorConsent");
    const listsHttps = request.protocolsSupported.includes(OtaDownloadProtocol.Https);
    const canConsent = request.requestorCanConsent ?? false;

    const matches = (field: IdentityField, sent: unknown) => ({
        what: `${field} matches the DUT's Basic Information`,
        check: (): CheckRecord => ({
            type: "response",
            verdict: sent === identity[field] ? "pass" : "fail",
            detail: `the DUT sent ${field} ${sent}, and reports ${identity[field]} in Basic Information`,
        }),
    });

    const matchesIfPresent = (field: IdentityField, sent: unknown) => ({
        what: `${field}, if present, matches the DUT's Basic Information`,
        check: (): CheckRecord => ({
            type: "response",
            verdict: sent === undefined || sent === identity[field] ? "pass" : "fail",
            detail:
                sent === undefined
                    ? `the DUT sent no ${field}, which the plan allows`
                    : `the DUT sent ${field} ${sent}, and reports ${identity[field]} in Basic Information`,
        }),
    });

    await recordAll(cx, [
        matches("vendorId", request.vendorId),
        matches("productId", request.productId),
        matches("softwareVersion", request.softwareVersion),
        {
            what: "ProtocolsSupported lists BDX synchronous",
            check: () => ({
                type: "response",
                verdict: request.protocolsSupported.includes(OtaDownloadProtocol.BdxSynchronous) ? "pass" : "fail",
                detail: `the DUT listed protocols ${request.protocolsSupported.join(", ") || "none"}`,
            }),
        },
        {
            // Both ways, not only where the PICS say HTTPS: a DUT listing a protocol it declares it
            // does not support is as wrong as one leaving out a protocol it declares
            what: "ProtocolsSupported lists HTTPS where the DUT declares MCORE.OTA.HTTPS, and not otherwise (the second half is this suite's)",
            check: () => ({
                type: "response",
                verdict: listsHttps === https ? "pass" : "fail",
                detail:
                    `the DUT ${listsHttps ? "listed" : "did not list"} HTTPS, and its PICS answer ` +
                    `MCORE.OTA.HTTPS ${https ? 1 : 0}`,
            }),
        },
        matchesIfPresent("hardwareVersion", request.hardwareVersion),
        matchesIfPresent("location", request.location),
        {
            // An absent field is False (§ 11.20.6.5.1), which is what a requestor that cannot consent
            // may send by leaving it out
            what: "RequestorCanConsent is True exactly where the DUT declares MCORE.OTA.RequestorConsent",
            check: () => ({
                type: "response",
                verdict: canConsent === consent ? "pass" : "fail",
                detail:
                    `the DUT sent RequestorCanConsent ${request.requestorCanConsent ?? "(absent)"}, and its PICS ` +
                    `answer MCORE.OTA.RequestorConsent ${consent ? 1 : 0}`,
            }),
        },
    ]);
}

/**
 * The plan's step 2 as chip's own `Test_TC_SU_2_1.yaml` runs it: the provider answers `Busy`, which
 * invites a retry, and the requestor must hold it back for two minutes (§ 11.20.3.2.4).
 */
async function recordSingleQueryInWindow(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th", "the DUT"));
    await node.scriptOtaProvider({
        queryImage: [{ status: OtaQueryStatus.Busy, delayedActionTime: BUSY_DELAYED_ACTION_TIME }],
    });

    const { exchanges, observedMs } = await announce(cx, {
        timeoutMs: SPACED_QUERY_TIMEOUT,
        observeMs: QUERY_WINDOW + RETRY_MARGIN,
    });
    const watched = Millis(observedMs);
    const [busy, ...later] = exchanges.queryImage;
    const early = later.filter(({ receivedAtMs }) => receivedAtMs - busy.receivedAtMs < QUERY_WINDOW);
    const spacing = later.map(({ receivedAtMs }) => Duration.format(Millis(receivedAtMs - busy.receivedAtMs)));

    await recordAll(cx, [
        {
            // Without the wait no second query can be in the record, whatever the DUT does next
            what: "the TH watched the whole window after the Busy answer",
            check: () => ({
                type: "response",
                verdict: watched >= QUERY_WINDOW ? "pass" : "fail",
                detail: `the TH watched for ${Duration.format(watched)}, against the plan's ${Duration.format(QUERY_WINDOW)}`,
            }),
        },
        {
            what: "the DUT sent no further QueryImage in the two minutes after the Busy answer",
            check: () => ({
                type: "response",
                verdict: busy?.response.status === OtaQueryStatus.Busy && early.length === 0 ? "pass" : "fail",
                detail:
                    `the TH answered ${busy === undefined ? "no QueryImage" : queryStatusName(busy.response.status)} ` +
                    `with DelayedActionTime ${BUSY_DELAYED_ACTION_TIME}s, and the DUT queried again ` +
                    (spacing.length === 0 ? "not at all" : `after ${spacing.join(", ")}`) +
                    ` within the ${Duration.format(watched)} watched`,
            }),
        },
    ]);
}

async function recordAnnouncedProviderQueried(cx: CertStepContext) {
    const dut = cx.devices.dut;
    const from = await dut.log.markSettled();

    const { announcement }: OtaAnnouncement = await announce(cx, {
        timeoutMs: SPACED_QUERY_TIMEOUT,
        recordAs: "the DUT queried the announced provider",
    });

    await recordAll(cx, [
        {
            what: "the DUT received the announcement naming the TH",
            check: () =>
                expectSequence(
                    dut.log,
                    dut.flavor,
                    "AnnounceOTAProvider the DUT received",
                    announcementLines(announcement),
                    from,
                    LOG_TIMEOUT,
                ),
        },
    ]);
}

certTest("TC-SU-2.1", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller: every step after
    // the precondition needs it to answer and to announce, so a controller that cannot must skip before
    // it commissions rather than one step at a time.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,

    // The spacing step 2 checks is the DUT's own; a matter.js DUT keeps it whatever the run shortens
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
                "The TH holds the DUT on its fabric, and reading the UpdateState Attribute of the OTA Requestor " +
                "returns Idle. The TH is also the plan's TH2/Administrator: one controller commissions, announces " +
                "and answers as the OTA-P.",
        },
    )
    .step(1, "DUT sends a QueryImage command to the TH/OTA-P. (11.19.6.7)", recordQueryImageFields, {
        expected:
            "Verify the QueryImage command received on the server has the following mandatory fields. VendorID, " +
            "ProductID and SoftwareVersion - Should match the values reported by the Basic Information Cluster of " +
            "the DUT. Verify the field ProtocolsSupported lists the BDX Synchronous protocol. IF (MCORE.OTA.HTTPS) " +
            "HTTPS protocol should be listed. HardwareVersion - If present, verify that it matches the Basic " +
            "Information Cluster HardwareVersion attribute of the DUT. If the Location field is present, verify " +
            "that the value is same as Basic Information Cluster Location Attribute of the DUT. IF " +
            "(MCORE.OTA.RequestorConsent) RequestorCanConsent field should be set to True. Otherwise it should be " +
            "False. MetadataForProvider - Optional.",
    })
    .step(
        2,
        "DUT sends a QueryImage command to the TH/OTA-P. Wait for 2 minutes. (11.19.3.2)",
        recordSingleQueryInWindow,
        {
            longRunning: "the plan watches the DUT for two minutes after a Busy answer",
            expected:
                "On the TH/OTA-P verify that the QueryImage command is sent only once in that 2 minutes interval.",
        },
    )
    .step(
        3,
        "TH2/Administrator sends an AnnounceOTAProvider command to the DUT. (11.19.7.7)",
        recordAnnouncedProviderQueried,
        {
            expected:
                "Verify that the DUT queries the indicated OTA Provider at the ProviderLocation at its next " +
                "upcoming OTA Provider query.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
