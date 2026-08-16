/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/main";
import { Base38 } from "@matter/main/types";
import type { CertDevice, CertStepContext } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { CommissionedRefs, expectRejection, expectSequence, record } from "./tc-support.js";

export const LOG_TIMEOUT_MS = 30_000;
export const MDNS_TIMEOUT_MS = 30_000;

/**
 * Bounds a "the DUT must refuse this" commissioning attempt. Both controllers read the payload
 * before they touch the network, so a refusal lands in milliseconds; the budget is what keeps a
 * controller that instead went looking for the commissionee from hanging the step.
 */
export const REFUSAL_TIMEOUT_MS = 30_000;

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

const QR_PREFIX = "MT:";

/** Bit offset and length of § 5.1.3.1 Table 59's fields inside the payload's fixed structure. */
const VERSION_BITS = { offset: 0, length: 3 };
const PASSCODE_BITS = { offset: 57, length: 27 };

function writeBits(data: Uint8Array, { offset, length }: { offset: number; length: number }, value: number): void {
    if (value < 0 || value >= 2 ** length) {
        // Silently dropping the high bits would put a payload nobody asked for into the evidence
        throw new InternalError(`${value} does not fit the ${length} bits at offset ${offset}`);
    }
    for (let i = 0; i < length; i++) {
        const bit = offset + i;
        const mask = 1 << (bit % 8);
        if ((value >>> i) & 1) {
            data[bit >> 3] |= mask;
        } else {
            data[bit >> 3] &= ~mask;
        }
    }
}

/**
 * `payload` with the named fields substituted, which is what the negative device-discovery plans ask
 * a tester to produce with a QR generator.
 *
 * The fields go in as bits rather than through matter.js's own encoder, because every value these
 * plans want is one that encoder refuses to write: an unsupported version and the trivial passcodes
 * are exactly what it validates against on the way out (§ 5.1.3.1, § 5.1.7.1). The TLV data that may
 * follow the fixed 11-byte structure is carried through untouched.
 */
export function qrPayloadWith(payload: string, fields: { version?: number; passcode?: number }): string {
    if (!payload.startsWith(QR_PREFIX)) {
        throw new InternalError(`Cannot substitute fields into "${payload}", which is not a QR onboarding payload`);
    }

    const data = Uint8Array.from(Bytes.of(Base38.decode(payload.slice(QR_PREFIX.length))));
    if (fields.version !== undefined) {
        writeBits(data, VERSION_BITS, fields.version);
    }
    if (fields.passcode !== undefined) {
        writeBits(data, PASSCODE_BITS, fields.passcode);
    }
    return QR_PREFIX + Base38.encode(data);
}

/** `payload` carrying `prefix` in place of the specification's `MT:` (§ 5.1.3). */
export function qrPayloadWithPrefix(payload: string, prefix: string): string {
    if (!payload.startsWith(QR_PREFIX)) {
        throw new InternalError(`Cannot re-prefix "${payload}", which is not a QR onboarding payload`);
    }
    return prefix + payload.slice(QR_PREFIX.length);
}

/**
 * Records that the DUT refuses to commission from `payload`, which is how the negative plans phrase
 * "the DUT terminates the commissioning process in a DUT-specific manner".
 *
 * A refusal that never came leaves the TH commissioned, so the ref reaches `commissioned` before the
 * check is judged — the run's own cleanup then takes the fabric back off the TH rather than leaving
 * it for whatever runs next. A controller that neither refuses nor finishes inside
 * {@link REFUSAL_TIMEOUT_MS} is the one case that can still strand a fabric, since its ref arrives
 * after the cleanup ran; the budget is orders of magnitude above either controller's own refusal.
 *
 * The ref lands under the `"dut"` role, so a TC that also commissions the TH legitimately must not
 * hold a live ref there while this runs.
 */
export async function expectCommissioningRefused(
    cx: CertStepContext,
    payload: string,
    commissioned: CommissionedRefs,
    what: string,
): Promise<void> {
    const attempt = cx.controllers.dut.commission({ qrPairingCode: payload }).then(ref => {
        commissioned.set("dut", ref);
        return ref;
    });

    record(cx, await expectRejection(`commissioning from ${payload}`, attempt, REFUSAL_TIMEOUT_MS), what);
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
