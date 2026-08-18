/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, InternalError, Millis, Time, Verhoeff } from "@matter/main";
import { Base38, DiscoveryCapabilitiesBitmap, DiscoveryCapabilitiesSchema } from "@matter/main/types";
import type { CertNodeRef, CertStepContext, CommissioningTarget } from "@matter/testing";
import type { CertDevice } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import { CertCleanupError, CommissionedRefs, expectRejection, expectSequence, record } from "./tc-support.js";

export const LOG_TIMEOUT_MS = 30_000;
export const MDNS_TIMEOUT_MS = 30_000;

/**
 * Bounds a "the DUT must refuse this" commissioning attempt. Both controllers read the payload
 * before they touch the network, so a refusal lands in milliseconds; the budget is what keeps a
 * controller that instead went looking for the commissionee from hanging the step.
 */
export const REFUSAL_TIMEOUT_MS = 15_000;

/**
 * Bounds the cleanup's wait for an attempt that outlived {@link REFUSAL_TIMEOUT_MS}. A commissioning
 * that is going to succeed does so in seconds; what this cannot outwait is a chip-tool command stuck
 * in its own 3-minute budget, and that is deliberate — `CertTest`'s whole finalizer gets 2 minutes,
 * and a controller stuck that long has left the TH in a state this run cannot report on anyway.
 */
export const REFUSAL_SETTLE_TIMEOUT_MS = 30_000;

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

/** § 5.1.3.1 Table 60's OnNetwork-only bitmask, which the discovery-capability steps ask for. */
export const ON_NETWORK_ONLY = DiscoveryCapabilitiesSchema.encode({ onIpNetwork: true });

/**
 * The TH's onboarding payload with its discovery capabilities reduced to OnNetwork.
 *
 * The plan states this as a precondition on the TH ("ensure the TH's Discovery Capability bit string
 * is NOT set to BLE"), which for a TC that drives everything itself means substituting the field the
 * way its neighbouring steps substitute theirs. It is not cosmetic: `chip-all-clusters-app` publishes
 * a BLE-only bitmask, so the precondition does not otherwise hold on that TH at all.
 */
export async function onNetworkOnlyPayload(cx: CertStepContext): Promise<string> {
    return qrPayloadWith(await thQrPayload(cx.devices.th), { discoveryCapabilities: ON_NETWORK_ONLY });
}

/**
 * Records that `payload` does not offer `capability`, read back through the DUT so a controller that
 * cannot report a bitmask fails here rather than silently proving nothing.
 */
export async function recordDiscoveryCapabilityAbsent(
    cx: CertStepContext,
    payload: string,
    capability: keyof typeof DiscoveryCapabilitiesBitmap,
    what: string,
): Promise<void> {
    const parsed = await cx.controllers.dut.parseQrPayload(payload);
    const offered = DiscoveryCapabilitiesSchema.decode(parsed.discoveryCapabilities);
    const names = Object.entries(offered)
        .filter(([, set]) => set)
        .map(([name]) => name);

    record(
        cx,
        {
            type: "response",
            verdict: offered[capability] ? "fail" : "pass",
            detail:
                `DUT read ${payload} as offering discovery over ${names.join(", ") || "nothing"} ` +
                `(bitmask 0b${parsed.discoveryCapabilities.toString(2).padStart(8, "0")}), so ${capability} is ` +
                `${offered[capability] ? "offered" : "not offered"}`,
        },
        what,
    );
}

/** Bit offset and length of § 5.1.3.1 Table 59's fields inside the payload's fixed structure. */
const VERSION_BITS = { offset: 0, length: 3 };
const PASSCODE_BITS = { offset: 57, length: 27 };
const DISCOVERY_BITS = { offset: 37, length: 8 };

function writeBits(data: Uint8Array, { offset, length }: { offset: number; length: number }, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** length) {
        // The bitwise operators below coerce a fraction and NaN silently, which would put a payload
        // nobody asked for into the evidence
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
export function qrPayloadWith(
    payload: string,
    fields: { version?: number; passcode?: number; discoveryCapabilities?: number },
): string {
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
    if (fields.discoveryCapabilities !== undefined) {
        writeBits(data, DISCOVERY_BITS, fields.discoveryCapabilities);
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
 * The commissioning attempts a TC has told the DUT to refuse.
 *
 * A TC's `finalize` must {@link settle} this. An attempt outlives the check that judged it —
 * {@link expectRejection} stops waiting at its budget but the commissioning carries on — so a
 * fabric this class asked for can land after every other cleanup has run.
 */
export class CommissioningRefusals {
    #attempts = new Array<Promise<CertNodeRef | undefined>>();
    #refusalTimeoutMs: number;
    #settleTimeoutMs: number;

    /** Budgets are injectable because the unit tests cannot wait out the real ones. */
    constructor(budgets?: { refusalTimeoutMs?: number; settleTimeoutMs?: number }) {
        this.#refusalTimeoutMs = budgets?.refusalTimeoutMs ?? REFUSAL_TIMEOUT_MS;
        this.#settleTimeoutMs = budgets?.settleTimeoutMs ?? REFUSAL_SETTLE_TIMEOUT_MS;
    }

    /**
     * Records that the DUT refuses to commission from `payload`, which is how the negative plans
     * phrase "the DUT terminates the commissioning process in a DUT-specific manner".
     *
     * Only a refusal of the payload itself counts (see {@link isPayloadRefusal}). Accepting any
     * rejection would let the step pass on a controller that died, timed out or was never asked —
     * outcomes that say nothing about what the DUT made of the code.
     */
    async requireRefusal(cx: CertStepContext, target: CommissioningTarget, what: string): Promise<void> {
        const attempt = cx.controllers.dut.commission(target);
        // Kept as a settled outcome so an attempt nobody awaits again cannot surface as an unhandled
        // rejection, and so settle() can collect the ref of one that succeeded after its budget
        this.#attempts.push(
            attempt.then(
                ref => ref,
                () => undefined,
            ),
        );

        record(
            cx,
            await expectRejection(
                `commissioning from ${describeTarget(target)}`,
                attempt,
                this.#refusalTimeoutMs,
                isPayloadRefusal,
            ),
            what,
        );
    }

    /**
     * Records that the DUT does not commission from `target`, without claiming why. The plans use
     * this where the code is well-formed but names a device that is not there: any failure satisfies
     * "the DUT terminated commissioning", where a success does not.
     */
    async requireNoCommissioning(
        cx: CertStepContext,
        target: CommissioningTarget,
        what: string,
        timeoutMs: number,
    ): Promise<void> {
        const attempt = cx.controllers.dut.commission(target);
        this.#attempts.push(
            attempt.then(
                ref => ref,
                () => undefined,
            ),
        );

        record(
            cx,
            await expectRejection(
                `commissioning from ${describeTarget(target)}`,
                attempt,
                timeoutMs,
                // A payload refusal would mean the code never reached discovery, so the step proved
                // nothing about a commissionee that is not there
                error => !isPayloadRefusal(error),
            ),
            what,
        );
    }

    /**
     * Waits out every attempt still running and removes the fabric of any that succeeded anyway.
     * Gives up rather than holding the run open — the TH's state is then genuinely unknown, which is
     * what the cleanup error says.
     */
    async settle(cx: CertStepContext): Promise<void> {
        const attempts = this.#attempts.splice(0);
        if (attempts.length === 0) {
            return;
        }

        const timeout = Time.sleep("outstanding refused commissionings", Millis(this.#settleTimeoutMs));
        let refs;
        try {
            refs = await Promise.race([Promise.all(attempts), timeout.then(() => undefined)]);
        } finally {
            timeout.cancel();
        }

        if (refs === undefined) {
            throw new CertCleanupError(
                `${attempts.length} commissioning attempt(s) the DUT was asked to refuse are still running after ` +
                    `${Duration.format(Millis(this.#settleTimeoutMs))}; one that succeeds now cannot be cleaned up`,
            );
        }

        const failures = new Array<string>();
        for (const ref of refs) {
            if (ref === undefined) {
                continue;
            }
            try {
                await cx.controllers.dut.node(ref).decommission();
            } catch (e) {
                failures.push(`${ref}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        if (failures.length) {
            throw new CertCleanupError(
                `The DUT commissioned the TH from a payload it was asked to refuse and the fabric could not be ` +
                    `removed: ${failures.join("; ")}`,
            );
        }
    }
}

function describeTarget(target: CommissioningTarget): string {
    return target.qrPairingCode ?? target.manualPairingCode ?? JSON.stringify(target);
}

/**
 * Whether `error` is a controller refusing the onboarding payload rather than failing for some other
 * reason. Both adapters mark that refusal where it happens, because neither controller's own error
 * types distinguish it: chip-tool funnels discovery, PASE, attestation and command timeouts into one
 * command error, and matter.js raises `UnexpectedDataError` from the commissioning flow as well (an
 * invalid CSR response, for one). Either would let a commissioner that took a forbidden code and only
 * then failed be recorded as having refused it.
 */
function isPayloadRefusal(error: unknown): boolean {
    return error instanceof OnboardingPayloadRefusedError;
}

/**
 * The TH's own setup code rendered as a 21-digit manual pairing code.
 *
 * No subject publishes one: a device on the standard commissioning flow prints the 11-digit form,
 * and § 5.1.4.1 Table 64's longer form is what the manual-code plans test. It names the same device
 * — the same discriminator and passcode — in the form the plan's preconditions describe.
 */
export async function thManualPairingCode(
    cx: CertStepContext,
    overrides: Partial<ManualPairingCodeParts> = {},
): Promise<string> {
    return manualPairingCode({ ...(await thCodeParts(cx)), ...overrides });
}

/**
 * What the TH's own setup code puts into a 21-digit manual code. Read once by a step that builds
 * several, so a dozen substitutions do not become a dozen concurrent requests to the DUT.
 */
export async function thCodeParts(cx: CertStepContext): Promise<ManualPairingCodeParts> {
    const th = cx.devices.th;
    const { vendorId, productId } = await cx.controllers.dut.parseQrPayload(await thQrPayload(th));

    return {
        vidPidPresent: true,
        discriminator: th.commissioning.discriminator,
        passcode: th.commissioning.passcode,
        vendorId,
        productId,
    };
}

/**
 * Records what the DUT read out of `code` and whether it names the TH. As {@link recordParse}, the
 * parse is the DUT's: a step that decoded the code itself would pass against a controller that
 * cannot read one.
 */
export async function recordManualParse(cx: CertStepContext, code: string): Promise<void> {
    const th = cx.devices.th;

    let parsed;
    try {
        parsed = await cx.controllers.dut.parseManualPairingCode(code);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: `DUT could not parse ${code}: ${e}` });
        throw e;
    }

    const shortDiscriminator = th.commissioning.discriminator >> SHORT_DISCRIMINATOR_SHIFT;
    const matches = parsed.shortDiscriminator === shortDiscriminator && parsed.passcode === th.commissioning.passcode;

    record(
        cx,
        {
            type: "response",
            verdict: matches ? "pass" : "fail",
            detail:
                `DUT read the ${code.length}-digit code as shortDiscriminator=${parsed.shortDiscriminator} ` +
                `passcode=${parsed.passcode} vendorId=${parsed.vendorId} productId=${parsed.productId}; the TH's own ` +
                `setup code is shortDiscriminator=${shortDiscriminator} passcode=${th.commissioning.passcode}`,
        },
        "Manual pairing code parse",
    );
}

/** § 5.1.4.1 Table 62 carries only the discriminator's 4 most significant bits. */
const SHORT_DISCRIMINATOR_SHIFT = 8;

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
 * Records what the DUT made of a code naming a given vendor, where the plan accepts either outcome:
 * terminating commissioning, or onboarding anyway with the user aware of the risk.
 *
 * The two controllers genuinely differ. chip-tool matches a code's vendor and product id against the
 * device it discovered (`SetUpCodePairer::NodeMatchesCurrentFilter`) and finds nothing; matter.js
 * discovers on the discriminator alone and onboards. A fabric that results is handed to
 * `commissioned`, whose next {@link commissionByManualCode} takes it off the TH the only way a chip
 * TH survives — opening a window before the fabric that opens it is gone.
 */
export async function recordVendorOutcome(
    cx: CertStepContext,
    manualPairingCode: string,
    commissioned: CommissionedRefs,
    what: string,
    timeoutMs: number,
): Promise<void> {
    await restoreCommissioningMode(cx, commissioned);

    const dut = cx.controllers.dut;
    const attempt = dut.commission({ manualPairingCode, giveUpAfterMs: timeoutMs });

    const outcome = await expectRejection(`commissioning from ${manualPairingCode}`, attempt, timeoutMs + 30_000);
    if (outcome.verdict === "pass") {
        record(cx, { ...outcome, detail: `DUT terminated commissioning: ${outcome.detail}` }, what);
        return;
    }

    const ref = await attempt;
    commissioned.set("dut", ref);
    record(
        cx,
        {
            type: "response",
            verdict: "pass",
            detail: `DUT onboarded the TH as node ${ref}, which the plan allows where the user accepts the risk`,
        },
        what,
    );
}

/**
 * Puts the TH back into commissioning mode if a fabric from an earlier onboarding is still on it.
 *
 * A chip TH does not return there when its last fabric goes, so the window is opened while the fabric
 * that can open it is still present. It is a basic one: that is the window whose PASE verifier is the
 * device's own setup code, which is what an onboarding code carries.
 */
async function restoreCommissioningMode(cx: CertStepContext, commissioned: CommissionedRefs): Promise<void> {
    const previous = commissioned.get("dut");
    if (previous === undefined) {
        return;
    }

    const dut = cx.controllers.dut;
    await dut.node(previous).openCommissioningWindow({ timeout: WINDOW_TIMEOUT_SECONDS, enhanced: false });
    await dut.node(previous).decommission();
    commissioned.clear("dut");

    // Removing the fabric returns as soon as the TH answers; the TH advertises itself commissionable
    // again on its own schedule, and a discovery started before that finds only the devices this run
    // is not looking for.
    await recordCommissionable(cx, "TH back in commissioning mode");
}

/** {@link commissionByQr} for a manual pairing code, which discovers by the short discriminator. */
export async function commissionByManualCode(
    cx: CertStepContext,
    manualPairingCode: string,
    commissioned: CommissionedRefs,
): Promise<void> {
    await commissionByTarget(cx, { manualPairingCode }, commissioned);
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
    await commissionByTarget(cx, { qrPairingCode: payload }, commissioned);
}

async function commissionByTarget(
    cx: CertStepContext,
    target: CommissioningTarget,
    commissioned: CommissionedRefs,
): Promise<void> {
    const dut = cx.controllers.dut;
    const th = cx.devices.th;

    await restoreCommissioningMode(cx, commissioned);

    const from = th.log.mark();
    let ref;
    try {
        ref = await dut.commission(target);
    } catch (e) {
        cx.recorder.check({
            type: "response",
            verdict: "fail",
            detail: `commissioning from ${describeTarget(target)} failed: ${e}`,
        });
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

/**
 * A part that does not fit its field would be written as extra digits or roll into its neighbour,
 * putting a code nobody asked for into the evidence — the same trap `writeBits` guards for a QR
 * payload.
 */
function assertFits(value: number, max: number, what: string): void {
    if (!Number.isInteger(value) || value < 0 || value > max) {
        throw new InternalError(`${what} ${value} does not fit a manual pairing code`);
    }
}

/** First digit CHIP and matter.js both read as "a format this implementation does not know". */
const FUTURE_FORMAT_DIGIT = 8;

/**
 * The parts § 5.1.4.1 Table 62 packs into a manual pairing code, as {@link manualPairingCode} writes
 * them.
 */
export interface ManualPairingCodeParts {
    /**
     * Marks a format after v1 (§ 5.1.4.1.2), which sets the first digit to 8. The fields v1 packs
     * into that digit are not representable alongside the marker, since a decimal digit holds 0-9.
     */
    futureFormat?: boolean;

    /**
     * The `VID_PID_PRESENT` bit. Set independently of whether the ids themselves follow, because a
     * code where the two disagree is exactly what one of the negative plans asks for.
     */
    vidPidPresent: boolean;

    /** The full 12-bit form; only its 4 most significant bits reach the code. */
    discriminator: number;

    passcode: number;
    vendorId?: number;
    productId?: number;

    /** Replaces the Verhoeff digit the parts produce, for a step asking for a wrong one. */
    checkDigit?: number;
}

/**
 * A manual pairing code carrying `parts`, whatever the specification makes of them.
 *
 * The negative plans substitute values `ManualPairingCodeCodec` refuses to write — a reserved
 * version, a forbidden passcode, a product id of 0 — so the digits are laid out here rather than
 * encoded. The layout is § 5.1.4.1 Table 62's, and every code the plan prints for its own example
 * device is asserted against this in `tc-dd-support.test.ts`.
 */
export function manualPairingCode(parts: ManualPairingCodeParts): string {
    const { futureFormat = false, vidPidPresent, discriminator, passcode, vendorId, productId, checkDigit } = parts;

    const chunk1 = futureFormat ? FUTURE_FORMAT_DIGIT : (vidPidPresent ? 1 << 2 : 0) | (discriminator >> 10);
    const chunk2 = (((discriminator & 0x300) << 6) | (passcode & 0x3fff)).toString().padStart(5, "0");
    const chunk3 = (passcode >>> 14).toString().padStart(4, "0");

    assertFits(discriminator, 0xfff, "discriminator");
    assertFits(passcode, 0x7ffffff, "passcode");
    assertFits(vendorId ?? 0, 0xffff, "vendorId");
    assertFits(productId ?? 0, 0xffff, "productId");
    assertFits(checkDigit ?? 0, 9, "checkDigit");

    if ((vendorId === undefined) !== (productId === undefined)) {
        throw new InternalError("A manual pairing code carries a vendor and a product id together or not at all");
    }

    let digits = `${chunk1}${chunk2}${chunk3}`;
    if (vendorId !== undefined && productId !== undefined) {
        digits += vendorId.toString().padStart(5, "0") + productId.toString().padStart(5, "0");
    }

    return digits + (checkDigit ?? new Verhoeff().computeChecksum(digits));
}
