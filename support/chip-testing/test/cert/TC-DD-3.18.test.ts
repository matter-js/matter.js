/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import {
    commissionByQr,
    CommissioningRefusals,
    MDNS_TIMEOUT,
    qrPayloadFields,
    recordDiscriminatorHonored,
    recordNotCommissioned,
    recordParse,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, record, requireId, runCleanups } from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const VENDOR_ID = requireId(BASIC_INFORMATION.attributes.require("vendorId").id, "BasicInformation.vendorId");

// One per device rather than one keyed by device: `CommissionedRefs` removes each fabric through
// `cx.controllers[role]`, and both of these harnesses are commissioned by the same controller.
const th1Commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();
const th2Commissioned = new CommissionedRefs();

/**
 * The two harnesses, with the invariant every other step here depends on: they must be separately
 * addressable, because discovery in this directory matches on the long discriminator alone.
 *
 * `device.commissioning` is not evidence of that on a chip flavour — it is the identity the harness
 * handed the app, so comparing the two would compare `identityFor(0)` with `identityFor(1)` and could
 * not fail. What the *devices* say is their printed onboarding payloads, which encode the
 * discriminator and passcode each app actually came up with; steps 2.a and 3.a then check what the
 * DUT parses out of them against the same identity.
 */
async function distinctSubjects(cx: CertStepContext) {
    const th1 = cx.devices.th1;
    const th2 = cx.devices.th2;
    if (th1 === undefined || th2 === undefined) {
        throw new InternalError("TC-DD-3.18 requires two devices");
    }
    return { th1, th2 };
}

async function recordDistinctPayloads(cx: CertStepContext) {
    const { th1, th2 } = await distinctSubjects(cx);
    const [first, second] = await Promise.all([thQrPayload(th1), thQrPayload(th2)]);

    // The discriminator specifically, not the payload as a whole: two payloads differing only in
    // passcode would leave discovery just as ambiguous, and every instrument here matches on the
    // long discriminator alone.
    const [firstFields, secondFields] = [qrPayloadFields(first), qrPayloadFields(second)];

    record(
        cx,
        {
            type: "response",
            verdict: firstFields.discriminator !== secondFields.discriminator ? "pass" : "fail",
            detail:
                `TH1 published ${first} (discriminator ${firstFields.discriminator}), ` +
                `TH2 published ${second} (discriminator ${secondFields.discriminator})`,
        },
        "The two THs advertise different discriminators",
    );

    return { th1, th2 };
}

/**
 * Reads an attribute back through `ref` and records which node answered.
 *
 * Both harnesses run the same app, so the value alone cannot tell them apart — swapping the two refs
 * would satisfy either step. The node's own operational instance name is what makes the bundle say
 * which fabric entry was exercised.
 */
async function recordStillReachable(cx: CertStepContext, ref: CertNodeRef, who: string) {
    const node = cx.controllers.dut.node(ref);
    const [vendorId, instanceName] = await Promise.all([
        node.readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION_ID, attribute: VENDOR_ID }),
        node.operationalMdnsInstanceName(),
    ]);

    record(
        cx,
        {
            type: "response",
            verdict: typeof vendorId === "number" ? "pass" : "fail",
            detail:
                `${who} (node ${ref}, operational instance ${instanceName}) answered ` +
                `BasicInformation.vendorId with ${JSON.stringify(vendorId)}`,
        },
        `${who} still reachable`,
    );
}

certTest("TC-DD-3.18", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING"],
    app: "all-clusters",
    devices: { th1: "all-clusters", th2: "all-clusters" },
})
    .step(
        "0",
        "Precondition: the DUT is a commissioner that uses the discriminator its onboarding code names.",
        cx => recordDiscriminatorHonored(cx, refusals, cx.devices.th1),
        {
            expected:
                "DUT does not commission the TH from a code naming a discriminator no device advertises. " +
                "Every later step's commissioning rests on this.",
        },
    )
    .step(
        "1.a",
        "Place TH1 into commissioning mode using the TH manufacturer's means to be discovered by a commissioner",
        async cx => {
            const { th1 } = await recordDistinctPayloads(cx);
            record(cx, await expectMdns(th1, { commissionable: true }, { timeoutMs: MDNS_TIMEOUT }), "TH1 advertising");
        },
        { expected: "Verify that TH1 is advertising and able to be discovered by a commissioner." },
    )
    .step(
        "1.b",
        "Place TH2 into commissioning mode using the TH manufacturer's means to be discovered by a commissioner",
        async cx => {
            const { th2 } = await distinctSubjects(cx);
            record(cx, await expectMdns(th2, { commissionable: true }, { timeoutMs: MDNS_TIMEOUT }), "TH2 advertising");
        },
        { expected: "Verify that TH2 is advertising and able to be discovered by a commissioner." },
    )
    .step(
        "2.a",
        "Scan TH1's QR code using the DUT Commissioner.",
        async cx => {
            const { th1 } = await distinctSubjects(cx);
            await recordParse(cx, await thQrPayload(th1), th1);
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "2.b",
        "DUT parses TH1's QR code. Follow any steps needed for the Commissioner/Commissionee to complete the " +
            "commissioning process over the TH Commissionee's method of device discovery",
        async cx => {
            const { th1, th2 } = await distinctSubjects(cx);
            const th2From = await th2.log.markSettled();

            const payload = await thQrPayload(th1);
            await commissionByQr(cx, payload, th1Commissioned, th1);

            // "Only TH1" is a claim about TH2, and TH2's own log is what states it. A commissionable
            // probe cannot: it is answered out of the shared DNS-SD cache, which still holds the
            // record step 1.b installed whether or not TH2 has since joined a fabric.
            await recordNotCommissioned(cx, th2, th2From, "TH2 was not commissioned");
        },
        {
            expected:
                "DUT parses TH1's QR code and DUT commissions TH1 onto the Matter network. Verify that only TH1 " +
                "has been commissioned onto the Matter network and that TH2 has not been commissioned.",
        },
    )
    .step(
        "3.a",
        "Scan TH2's QR code using the DUT Commissioner.",
        async cx => {
            const { th2 } = await distinctSubjects(cx);
            await recordParse(cx, await thQrPayload(th2), th2);
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "3.b",
        "DUT parses TH2's QR code. Follow any steps needed for the Commissioner/Commissionee to complete the " +
            "commissioning process over the TH Commissionee's method of device discovery",
        async cx => {
            const { th1, th2 } = await distinctSubjects(cx);
            const th1From = await th1.log.markSettled();

            await commissionByQr(cx, await thQrPayload(th2), th2Commissioned, th2);

            // The plan asks the same of this step, the other way round: TH1 is already commissioned,
            // so what must not happen is a second commissioning of it.
            await recordNotCommissioned(cx, th1, th1From, "TH1 was not commissioned again");
        },
        {
            expected:
                "DUT parses TH2's QR code and DUT commissions TH2 onto the Matter network. Verify that only TH2 " +
                "has been commissioned onto the Matter network in this step.",
        },
    )
    .step(
        "4.a",
        "Verify the Commissioner can still interact with TH1 (ex: Read any cluster's attribute from TH1)",
        cx => recordStillReachable(cx, th1Commissioned.require("dut"), "TH1"),
        { expected: "Verify TH1 remains commissioned onto the Matter network." },
    )
    .step(
        "4.b",
        "Verify the Commissioner can still interact with TH2 (ex: Read any cluster's attribute from TH2)",
        cx => recordStillReachable(cx, th2Commissioned.require("dut"), "TH2"),
        { expected: "Verify TH2 remains commissioned onto the Matter network." },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => th1Commissioned.decommissionAll(cx),
            () => th2Commissioned.decommissionAll(cx),
        ),
    );
