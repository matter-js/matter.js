/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/main";
import type { QrCodeData } from "@matter/main/types";
import { QrPairingCodeCodec } from "@matter/main/types";
import type { CertDevice, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { CertCheckFailedError, CommissionedRefs, expectSequence } from "./tc-support.js";

const LOG_TIMEOUT_MS = 30_000;
const MDNS_TIMEOUT_MS = 30_000;

/** Outlives the rest of the run, so a later step never pairs against a window that closed on its own. */
const WINDOW_TIMEOUT_SECONDS = 300;

/** Both device flavors print the payload they publish on this line; chip prints one per commissioning flow. */
const SETUP_QR_CODE = /SetupQRCode: \[(MT:[^\]]+)\]/;

/** chip-all-clusters-app announces a completed commissioning; matter.js has no equivalent line. */
const COMMISSIONING_COMPLETE = /Commissioning completed successfully/;

/**
 * The plan's own example TLV payload (§ 5.1.5): an anonymous structure carrying serial number
 * "1234567890" under context tag 0x00.
 */
const PLAN_TLV_DATA = Bytes.fromHex("152c000a3132333435363738393018");

/** The plan's step 4 payload length, counted over the whole string including its `MT:` prefix. */
const LARGE_QR_CODE_LENGTH = 255;

/**
 * A UTF-8 string of this length under a manufacturer-specific tag fills the payload to exactly
 * {@link LARGE_QR_CODE_LENGTH}: 5 bytes of TLV framing plus the fixed 11-byte structure is 151 bytes,
 * which base38 renders as 252 characters.
 */
const LARGE_TLV_STRING_LENGTH = 135;

const commissioned = new CommissionedRefs();

function record(cx: CertStepContext, check: CheckRecord, what: string) {
    cx.recorder.check(check);
    if (check.verdict === "fail") {
        throw new CertCheckFailedError(`${what} check failed: ${JSON.stringify(check)}`);
    }
}

/**
 * The onboarding payload the TH publishes for its own setup code. A subject that renders one reports
 * it directly; a chip app only prints it, and the first of the two it prints is the standard
 * commissioning flow's.
 */
async function thQrPayload(th: CertDevice): Promise<string> {
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

function decodeSingle(payload: string): QrCodeData {
    const payloads = QrPairingCodeCodec.decode(payload);
    if (payloads.length !== 1) {
        throw new InternalError(`Expected one onboarding payload, decoded ${payloads.length}`);
    }
    return payloads[0];
}

/**
 * Records what the DUT read out of `payload` and whether the setup code it carries is the TH's own.
 * This is the step's actual claim: the remaining fields describe the commissionee, and the plan asks
 * only that they parse.
 */
function recordParse(cx: CertStepContext, payload: string): QrCodeData {
    const th = cx.devices.th;
    const decoded = decodeSingle(payload);
    const matches =
        decoded.discriminator === th.commissioning.discriminator && decoded.passcode === th.commissioning.passcode;

    record(
        cx,
        {
            type: "response",
            verdict: matches ? "pass" : "fail",
            detail:
                `${payload.length}-character payload parsed as version=${decoded.version} ` +
                `vendorId=${decoded.vendorId} productId=${decoded.productId} flowType=${decoded.flowType} ` +
                `discoveryCapabilities=0b${decoded.discoveryCapabilities.toString(2).padStart(8, "0")} ` +
                `discriminator=${decoded.discriminator} passcode=${decoded.passcode}` +
                (decoded.tlvData === undefined ? "" : ` tlvData=${Bytes.toHex(decoded.tlvData)}`),
        },
        "Onboarding payload parse",
    );

    return decoded;
}

/** `payload` with `tlvData` appended, which the plan expects the DUT to parse and may then ignore. */
function withTlvData(payload: string, tlvData: Bytes): string {
    return QrPairingCodeCodec.encode([{ ...decodeSingle(payload), tlvData }]);
}

/** An anonymous structure holding one UTF-8 string, 1-octet length, under manufacturer tag 0x82. */
function largeTlvData(): Bytes {
    return Bytes.concat(
        Bytes.fromHex(`152c82${LARGE_TLV_STRING_LENGTH.toString(16)}`),
        Bytes.fromString("1".repeat(LARGE_TLV_STRING_LENGTH)),
        Bytes.fromHex("18"),
    );
}

function largeQrPayload(payload: string): string {
    const large = withTlvData(payload, largeTlvData());
    if (large.length !== LARGE_QR_CODE_LENGTH) {
        throw new InternalError(
            `Large onboarding payload is ${large.length} characters, not the plan's ${LARGE_QR_CODE_LENGTH}`,
        );
    }
    return large;
}

/**
 * Onboards the TH from `payload`, after taking the fabric an earlier step commissioned back off it.
 *
 * A chip TH does not return to commissioning mode when its last fabric goes, so the window is opened
 * while the fabric is still there. It is a basic one: that is the window whose PASE verifier is the
 * device's own setup code, which is what this TC's payload carries.
 */
async function commissionByQr(cx: CertStepContext, payload: string): Promise<void> {
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
        record(
            cx,
            await expectMdns(th, { commissionable: true }, { timeoutMs: MDNS_TIMEOUT_MS }),
            "TH back in commissioning mode",
        );
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

certTest("TC-DD-1.8", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        1,
        "Scan the TH Device's QR code using DUT",
        async cx => {
            recordParse(cx, await thQrPayload(cx.devices.th));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        2,
        "Using the DUT, parse the TH's QR code to onboard the TH Device onto the Matter network.",
        async cx => {
            const payload = await thQrPayload(cx.devices.th);
            recordParse(cx, payload);
            await commissionByQr(cx, payload);
        },
        { expected: "Verify the TH's QR code was parsed successfully by the DUT" },
    )
    .step(
        "3.a",
        "Scan the TH Device's QR code (that includes the additional TLV data) using DUT.",
        async cx => {
            recordParse(cx, withTlvData(await thQrPayload(cx.devices.th), PLAN_TLV_DATA));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "3.b",
        "Using the DUT, parse the TH's QR code to onboard the TH Device onto the Matter network.",
        async cx => {
            const payload = withTlvData(await thQrPayload(cx.devices.th), PLAN_TLV_DATA);
            recordParse(cx, payload);
            await commissionByQr(cx, payload);
        },
        {
            expected:
                "Verify the TH's QR code with the appended TLV data was parsed successfully by the DUT (where the " +
                "DUT may ignore the TLV contents)",
        },
    )
    .step(
        "4.a",
        `Scan the TH Device's QR code using the DUT. The number of alphanumeric characters in the QR code is ` +
            `${LARGE_QR_CODE_LENGTH} characters.`,
        async cx => {
            recordParse(cx, largeQrPayload(await thQrPayload(cx.devices.th)));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "4.b",
        "Using the DUT, parse the TH's QR code to onboard the TH Device onto the Matter network.",
        async cx => {
            const payload = largeQrPayload(await thQrPayload(cx.devices.th));
            recordParse(cx, payload);
            await commissionByQr(cx, payload);
        },
        {
            expected:
                "Verify the TH's QR code with the appended TLV data was parsed successfully by the DUT (where the " +
                "DUT may ignore the TLV contents)",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
