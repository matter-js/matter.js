/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertDevice, CertStepContext } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { CommissionedRefs, expectSequence, record } from "./tc-support.js";

export const LOG_TIMEOUT_MS = 30_000;
export const MDNS_TIMEOUT_MS = 30_000;

/** Outlives the rest of a run, so a later step never pairs against a window that closed on its own. */
const WINDOW_TIMEOUT_SECONDS = 300;

/** Both device flavors print the payload they publish on this line; chip prints one per commissioning flow. */
const SETUP_QR_CODE = /SetupQRCode: \[(MT:[^\]]+)\]/;

/** chip-all-clusters-app announces a completed commissioning; matter.js has no equivalent line. */
const COMMISSIONING_COMPLETE = /Commissioning completed successfully/;

/**
 * The onboarding payload the TH publishes for its own setup code. A subject that renders one reports
 * it directly; a chip app only prints it, and the first of the two it prints is the standard
 * commissioning flow's.
 */
export async function thQrPayload(th: CertDevice): Promise<string> {
    if (th.commissioning.qrPairingCode) {
        return th.commissioning.qrPairingCode;
    }

    const result = await th.log.expect(
        { chip: SETUP_QR_CODE, matterjs: SETUP_QR_CODE },
        { flavor: th.flavor, from: 0, timeoutMs: LOG_TIMEOUT_MS },
    );
    if (result.verdict === "unverified") {
        throw new InternalError(`${th.flavor} devices neither report nor print an onboarding payload`);
    }

    const payload = SETUP_QR_CODE.exec(result.matched.text)?.[1];
    if (payload === undefined) {
        throw new InternalError(`Matched a SetupQRCode line carrying no payload: ${result.matched.text}`);
    }
    return payload;
}

/**
 * Records what the DUT read out of `payload` and whether the setup code it read is the TH's own. The
 * parse is the DUT's, not the step's: a step that decoded the payload itself would pass against a
 * controller that cannot read one at all.
 */
export async function recordParse(cx: CertStepContext, payload: string): Promise<void> {
    const th = cx.devices.th;

    let parsed;
    try {
        parsed = await cx.controllers.dut.parseQrPayload(payload);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: `DUT could not parse the payload: ${e}` });
        throw e;
    }

    const matches =
        parsed.discriminator === th.commissioning.discriminator && parsed.passcode === th.commissioning.passcode;

    record(
        cx,
        {
            type: "response",
            verdict: matches ? "pass" : "fail",
            detail:
                `DUT read the ${payload.length}-character payload as version=${parsed.version} ` +
                `vendorId=${parsed.vendorId} productId=${parsed.productId} flowType=${parsed.flowType} ` +
                `discoveryCapabilities=0b${parsed.discoveryCapabilities.toString(2).padStart(8, "0")} ` +
                `discriminator=${parsed.discriminator} passcode=${parsed.passcode}; the TH's own setup code is ` +
                `discriminator=${th.commissioning.discriminator} passcode=${th.commissioning.passcode}`,
        },
        "Onboarding payload parse",
    );
}

/**
 * Records that the TH is discoverable as a commissionable device, which every commissioning-flow plan
 * states as its own step or precondition.
 */
export async function recordCommissionable(
    cx: CertStepContext,
    what = "TH advertising as commissionable",
): Promise<void> {
    record(cx, await expectMdns(cx.devices.th, { commissionable: true }, { timeoutMs: MDNS_TIMEOUT_MS }), what);
}

/**
 * Onboards the TH from `payload`, first taking off a fabric an earlier step commissioned.
 *
 * A chip TH does not return to commissioning mode when its last fabric goes, so the window is opened
 * while the fabric is still there. It is a basic one: that is the window whose PASE verifier is the
 * device's own setup code, which is what an onboarding payload carries.
 */
export async function commissionByQr(
    cx: CertStepContext,
    payload: string,
    commissioned: CommissionedRefs,
): Promise<void> {
    const dut = cx.controllers.dut;
    const th = cx.devices.th;

    const previous = commissioned.get("dut");
    if (previous !== undefined) {
        await dut.node(previous).openCommissioningWindow({ timeout: WINDOW_TIMEOUT_SECONDS, enhanced: false });
        await dut.node(previous).decommission();
        commissioned.clear("dut");

        // Removing the fabric returns as soon as the TH answers; the TH advertises itself
        // commissionable again on its own schedule, and a discovery started before that finds only
        // the devices this run is not looking for.
        await recordCommissionable(cx, "TH back in commissioning mode");
    }

    const from = th.log.mark();
    let ref;
    try {
        ref = await dut.commission({ qrPairingCode: payload });
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: `commissioning by payload failed: ${e}` });
        throw e;
    }
    commissioned.set("dut", ref);
    cx.recorder.check({ type: "response", verdict: "pass", detail: `commissioned as node ${ref}` });

    record(
        cx,
        await expectSequence(
            th.log,
            th.flavor,
            "commissioning complete",
            [COMMISSIONING_COMPLETE],
            from,
            LOG_TIMEOUT_MS,
        ),
        "TH commissioning",
    );
}
