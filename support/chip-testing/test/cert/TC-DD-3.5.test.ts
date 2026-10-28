/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertStepContext, LogExpectPatterns } from "@matter/testing";
import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { PASE_ESTABLISHED } from "./tc-cadmin-support.js";
import {
    commissionThStep,
    COMMISSIONED,
    COMMISSIONING_LOG_TIMEOUT,
    MDNS_TIMEOUT,
    recordCommissionable,
} from "./tc-dd-support.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    expectDeviceLog,
    LOG_TIMEOUT,
    record,
    requireId,
    runCleanups,
    theTh,
} from "./tc-support.js";

/**
 * What each TH prints for one stage of a commissioning, in the order § 5.5 runs them. chip prints a line per stage it
 * handled; matter.js prints the response it sent to most commands, which carries the outcome. Two lines name the
 * request only: chip logs no outcome for ArmFailSafe, and matter.js logs no response to AddTrustedRootCertificate. A
 * refusal of either still fails the run, at the next stage that needs it.
 */
const STAGES = {
    discovered: {
        chip: /\[SC\] Received PBKDF param request/,
        matterjs: /PaseServer Received pairing request/,
    },
    pase: PASE_ESTABLISHED,
    failSafe: {
        chip: /GeneralCommissioning: Received ArmFailSafe/,
        matterjs: /ProtocolService Invoke » .*generalCommissioning\.armFailSafe .*errorCode: 0(?!\d)/,
    },
    regulatory: {
        chip: /NVS set: chip-config\/regulatory-location = /,
        matterjs: /ProtocolService Invoke » .*generalCommissioning\.setRegulatoryConfig .*errorCode: 0(?!\d)/,
    },
    csr: {
        chip: /OpCreds: CSRRequest successful/,
        matterjs: /ProtocolService Invoke » .*operationalCredentials\.csrRequest .*nocsrElements: [0-9a-f]+/,
    },
    trustedRoot: {
        chip: /OpCreds: AddTrustedRootCertificate successful/,
        matterjs: /ProtocolService Invoke « .*operationalCredentials\.addTrustedRootCertificate /,
    },
    adminAcl: {
        chip: /OpCreds: ACL entry created for Fabric index 0x[0-9a-f]+ CASE Admin Subject 0x[0-9A-F]+/,
        matterjs: /OperationalCredentials addNoc success, adminVendorId \d+, caseAdminSubject [0-9a-f]+/,
    },
    case: {
        chip: /CASE Session established to peer/,
        matterjs: /CaseServer .*New session with/,
    },
    commissioningComplete: {
        chip: /GeneralCommissioning: Received CommissioningComplete/,
        matterjs: /ProtocolService Invoke « .*generalCommissioning\.commissioningComplete /,
    },
    paseClosed: {
        chip: /Released - Type:1 LSID/,
        matterjs: /Session @\d+:0•\w+ Session ended/,
    },
} satisfies Record<string, LogExpectPatterns>;

type Stage = keyof typeof STAGES;

const NETWORK_COMMISSIONING = Matter.clusters.require("NetworkCommissioning");
const NETWORK_COMMISSIONING_ID = requireId(NETWORK_COMMISSIONING.id, "NetworkCommissioning cluster");
const NETWORK_COMMISSIONING_FEATURE_MAP = requireId(
    NETWORK_COMMISSIONING.attributes.require("featureMap").id,
    "NetworkCommissioning.featureMap",
);

/** Network Commissioning feature bits WI (0) and TH (1). */
const WIFI_FEATURE = 1 << 0;
const THREAD_FEATURE = 1 << 1;

const commissioned = new CommissionedRefs();
const commission = commissionThStep(commissioned);

/** Where the TH log of this run's commissioning starts. */
let commissionedFrom: number | undefined;

/** Where the stage after the last one a step checked may start. */
let cursor: number | undefined;

/** Records that the TH logged `stage` after the stage the previous step checked. */
async function recordStage(cx: CertStepContext, stage: Stage, what: string) {
    if (cursor === undefined) {
        throw new CertCheckFailedError("Step 2's commissioning did not start, so this stage cannot be checked");
    }
    const th = theTh(cx);
    const { check } = await expectDeviceLog(th.log, th.flavor, STAGES[stage], cursor, LOG_TIMEOUT);
    record(cx, check, what);
    if (check.logLine !== undefined) {
        cursor = check.logLine + 1;
    }
}

const stageStep = (stage: Stage, what: string) => (cx: CertStepContext) => recordStage(cx, stage, what);

/**
 * Core § 5.5 step 8 requires the regulatory configuration only from a Commissionee with a Network Commissioning
 * instance that has the Wi-Fi or Thread feature: "If the Commissionee has at least one instance of the Network
 * Commissioning cluster ... with either the WI ... or TH ... feature flags set". A commissioner may skip it otherwise.
 */
async function regulatoryNotRequired(cx: CertStepContext): Promise<string | undefined> {
    const entries = await cx.controllers.dut
        .node(commissioned.require("dut"))
        .readAttributes([{ cluster: NETWORK_COMMISSIONING_ID, attribute: NETWORK_COMMISSIONING_FEATURE_MAP }]);
    if (entries.some(({ value }) => hasRadio(value))) {
        return undefined;
    }
    const featureMaps = entries.map(({ endpoint, value }) => `endpoint ${endpoint}: ${describeValue(value)}`);
    return (
        `No Network Commissioning instance of the TH has Wi-Fi or Thread (${featureMaps.join("; ")}), so the ` +
        "Commissioner need not configure regulatory information (Core § 5.5 step 8)"
    );
}

/** Whether a Network Commissioning FeatureMap, raw or decoded, has the Wi-Fi or Thread feature. */
function hasRadio(featureMap: unknown) {
    if (typeof featureMap === "number") {
        return (featureMap & (WIFI_FEATURE | THREAD_FEATURE)) !== 0;
    }
    return (
        typeof featureMap === "object" &&
        featureMap !== null &&
        Object.entries(featureMap).some(
            ([name, set]) => set === true && (name === "wiFiNetworkInterface" || name === "threadNetworkInterface"),
        )
    );
}

/** A plan condition that the THs of these runs, connected over Ethernet, never meet. */
const ON_ETHERNET =
    "The TH is already on the operational network over Ethernet, so the Commissioner neither needs to configure " +
    "network credentials nor to tell it to connect";

certTest("TC-DD-3.5", { plan: "devicediscovery.adoc", pics: ["MCORE.ROLE.COMMISSIONER"], app: "all-clusters" })
    .step(
        1,
        "Commissioner has regulatory and fabric information available and has accurate date, time and timezone",
        async cx => {
            cx.recorder.check({
                type: "response",
                verdict: "unverified",
                detail: "The date, time and timezone on the DUT need a person in front of the DUT; no adapter reads them",
            });
        },
        { expected: "Check time, date and timezone on DUT" },
    )
    .step(
        2,
        "Commissioner and Commissionee discover each other and connect via the discovery mode applicable for the DUT. " +
            "TH device is advertising over IP Network using DNS-based Service Discovery (DNS-SD)",
        async cx => {
            await recordCommissionable(cx);
            commissionedFrom = cursor = await theTh(cx).log.markSettled();
            await commission(cx);
            await recordStage(cx, "discovered", "the DUT connected to the TH");
        },
        { expected: "Commissioner and Commissionee can discover each other and connect to each other." },
    )
    .step(
        3,
        "Establish encryption keys with Password Authenticated Session Establishment on the commissioning channel",
        stageStep("pase", "the TH established PASE"),
        { expected: "DUT is able to establish encryption keys using PASE" },
    )
    .step(
        4,
        "Commissioner SHALL re-arm Fail-safe timer on Commissionee within 60s (the autonomously Fail-safe timer length " +
            "set by Commissionee)",
        stageStep("failSafe", "the TH armed the fail-safe for the DUT"),
        { expected: "TH arm the Fail-safe timer with success" },
    )
    .step(
        5,
        "Commissioner SHALL configure regulatory information in the Commissionee.",
        stageStep("regulatory", "the TH set the regulatory configuration"),
        {
            expected: "TH set the values configured by the Commissioner",
            notApplicableAtRun: regulatoryNotRequired,
        },
    )
    .step(
        6,
        "Commissioner requests operational CSR from Commissionee with OperationalCSRRequest command",
        stageStep("csr", "the TH answered the CSRRequest"),
        { expected: "TH generate a new operational key pair" },
    )
    .step(
        7,
        "Commissioner configures operational credentials on DUT if not previously installed",
        stageStep("trustedRoot", "the TH installed the trusted root certificate"),
        { expected: "TH is able to install Trusted Root Certificate if needed" },
    )
    .step(
        8,
        "Commissioner configures itself as administrator in ACL on TH if needed",
        stageStep("adminAcl", "the TH created the administrator ACL entry"),
        { expected: "TH configure the ACL with success" },
    )
    .step(9, "Commissioner configures operational network on TH if TH both supports and requires", async () => {}, {
        notApplicable: ON_ETHERNET,
        expected: "TH configure the correct operational network credentials",
    })
    .step(
        10,
        "Commissioner instructs Commissionee to connect to operational network if not already connected",
        async () => {},
        { notApplicable: ON_ETHERNET, expected: "TH successfully connect to operational network" },
    )
    .step(
        12,
        "Commissioner starts discovery of TH using Operational Discovery",
        commissioned.withRef("dut", async (cx, ref) => {
            const instance = await cx.controllers.dut.node(ref).operationalMdnsInstanceName();
            record(
                cx,
                await expectMdns(
                    theTh(cx),
                    { operationalRecords: 1 },
                    { operationalInstanceName: instance, timeoutMs: MDNS_TIMEOUT },
                ),
                `the TH advertises ${instance}, the operational instance the DUT's discovery looks for`,
            );
        }),
    )
    .step(
        13,
        "Commissioner opens a CASE session with TH over operational network",
        stageStep("case", "the TH established CASE"),
        { expected: "TH is able to open the CASE session with DUT" },
    )
    .step(
        14,
        "Commissioner sends CommissioningComplete command",
        async cx => {
            await recordStage(cx, "commissioningComplete", "the TH received CommissioningComplete");
            if (commissionedFrom === undefined) {
                throw new CertCheckFailedError("Step 2's commissioning did not start");
            }
            // matter.js logs the completed commissioning before its response, so this check starts with the commissioning
            const th = theTh(cx);
            const { check } = await expectDeviceLog(
                th.log,
                th.flavor,
                COMMISSIONED,
                commissionedFrom,
                COMMISSIONING_LOG_TIMEOUT,
            );
            record(cx, check, "the TH completed the commissioning with success");
        },
        { expected: "TH respond with success at CommissioningComplete command sent by DUT" },
    )
    .step(
        15,
        "Commissioning channel between the Commissioner and Commissionee is terminated.",
        stageStep("paseClosed", "the TH closed the PASE session"),
    )
    .finalize(cx => {
        cursor = commissionedFrom = undefined;
        return runCleanups(() => commissioned.decommissionAll(cx));
    });
