/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    DiscoveryAggregateError,
    DiscoveryError,
    Duration,
    ImplementationError,
    InternalError,
    Millis,
    Seconds,
    Time,
    Verhoeff,
} from "@matter/main";
import { Base38, DiscoveryCapabilitiesBitmap, DiscoveryCapabilitiesSchema } from "@matter/main/types";
import type { CertNodeRef, CertStepContext, CheckRecord, CommissioningTarget } from "@matter/testing";
import type { CertDevice } from "@matter/testing";
import { forFlavor } from "@matter/testing";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import {
    CertCleanupError,
    CommissionedRefs,
    expectDeviceLog,
    expectRejection,
    expectSequence,
    fabricSessionsEnded,
    LOG_TIMEOUT,
    MATTERJS_COMMISSIONED_FABRIC,
    readOwnFabricIndex,
    record,
    recordAll,
    removeFabricSucceeded,
    settleWithin,
} from "./tc-support.js";

/**
 * Where a later step's evidence has to start: a log cursor taken before whatever causes the
 * transition the step will check, once the follower has caught up with what the device already
 * wrote.
 *
 * **The network cannot supply the other half of this.** A commissionable mDNS record can be dated
 * (`DnssdName` stamps `installedAt`), but not attributed: `DnssdNames` installs records from a
 * *query's* known-answer list as readily as from a response, so any other commissioner on the LAN
 * refreshes the date with the device silent — and soliciting for one ourselves attaches the record
 * we hold as a known answer, which tells the responder to suppress the very reply we want
 * (`MdnsServer`'s known-answer suppression). A device's own log line is what witnesses a transition
 * here; see this directory's AGENTS.md.
 */
export type TransitionMark = number;

/** Takes a {@link TransitionMark} on `th`, after letting its log pump settle. */
export async function markTransition(cx: CertStepContext, th = theTh(cx)): Promise<TransitionMark> {
    return th.log.markSettled();
}

/**
 * The device these helpers act on where a plan names only one.
 *
 * A plan may now declare several devices under names of its own (`devices: { th1, th2 }`), and then
 * there is no `th` role at all. Reaching for one is a defect in the calling step rather than anything
 * the run can recover from, so it says so instead of failing later on a property of `undefined`.
 */
function theTh(cx: CertStepContext): CertDevice {
    const th = cx.devices.th;
    if (th === undefined) {
        throw new ImplementationError(
            `This step's plan declares no "th" device (it has ${Object.keys(cx.devices).join(", ") || "none"}); ` +
                "a helper acting on one device takes it as a parameter when the plan names more than one",
        );
    }
    return th;
}

/** Bounds a wait for a line a device prints as it comes up, with a whole commissioning flow ahead of it. */
export const COMMISSIONING_LOG_TIMEOUT = Seconds(30);
export const MDNS_TIMEOUT = Seconds(30);

/**
 * Bounds a "the DUT must refuse this" commissioning attempt. Both controllers read the payload
 * before they touch the network, so a refusal lands in milliseconds; the budget is what keeps a
 * controller that instead went looking for the commissionee from hanging the step.
 */
export const REFUSAL_TIMEOUT = Seconds(15);

/**
 * Bounds the cleanup's wait for an attempt that outlived {@link REFUSAL_TIMEOUT}. A commissioning
 * that is going to succeed does so in seconds; what this cannot outwait is a chip-tool command stuck
 * in its own 3-minute budget, and that is deliberate — `CertTest`'s whole finalizer gets 2 minutes,
 * and a controller stuck that long has left the TH in a state this run cannot report on anyway.
 */
export const REFUSAL_SETTLE_TIMEOUT = Seconds(30);

/**
 * The trivial passcodes § 5.1.7.1 forbids, transcribed from the plans' own step 5.a rather than taken
 * from matter.js's own list, so a divergence between the two shows up as a failing step.
 */
export const INVALID_PASSCODES: readonly number[] = [
    0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
];

/** The test vendor identifiers § 2.5.2 reserves, which TC-DD-3.17's own step 6.a substitutes. */
export const TEST_VENDOR_IDS: readonly number[] = [0xfff1, 0xfff2, 0xfff3, 0xfff4];

/** Both device flavors print the payload they publish on this line; chip prints one per commissioning flow. */
const SETUP_QR_CODE = /SetupQRCode: \[(MT:[^\]]+)\]/;

/** chip-all-clusters-app announces a completed commissioning. */
const COMMISSIONING_COMPLETE = /Commissioning completed successfully/;

/** A device announcing it completed a commissioning, in whichever form its implementation prints. */
export const COMMISSIONED = { chip: COMMISSIONING_COMPLETE, matterjs: MATTERJS_COMMISSIONED_FABRIC };

/**
 * Records that `th` did **not** complete a commissioning since `from`, which is how a plan's "only
 * the other device was commissioned" is stated: the device that must not have joined is the only
 * thing that can say so.
 *
 * A commissionable mDNS probe cannot. It is answered out of the process-global DNS-SD cache, so it
 * reports a record this run installed several steps earlier just as readily as a live one — see this
 * directory's AGENTS.md on freshness. The device's own log is not cached and not shared.
 */
export async function recordNotCommissioned(
    cx: CertStepContext,
    th: CertDevice,
    from: number,
    what: string,
): Promise<void> {
    // Counting reads the buffer directly, so a completion the device printed moments ago is
    // invisible until the pump has delivered it — and this runs immediately after a commissioning,
    // which is exactly when such a line is in flight.
    await th.log.settled();

    const pattern = forFlavor(COMMISSIONED, th.flavor);
    if (pattern === undefined) {
        record(cx, { type: "device-log", verdict: "unverified" }, what);
        return;
    }

    const completions = th.log.count(pattern, from);
    record(
        cx,
        {
            type: "device-log",
            verdict: completions === 0 ? "pass" : "fail",
            pattern: String(pattern),
            detail:
                completions === 0
                    ? `${th.id} logged no completed commissioning in this step`
                    : `${th.id} completed ${completions} commissioning(s) in this step`,
        },
        what,
    );
}

/**
 * The device announcing that it is now advertising itself commissionable — the transition a plan's
 * "place the TH back into commissioning mode" step asks for, stated by the device rather than
 * inferred from a record a scanner holds.
 *
 * chip's line comes from `Discovery_ImplPlatform`/`Advertiser_ImplMinimalMdns`, which print the same
 * prefix, so it is the one form both a Linux CI build and a Darwin build emit. The platform build
 * appends `; instance name: <name>`.
 */
const ADVERTISING_COMMISSIONABLE = {
    chip: /mDNS service published: _matterc\._udp/,
    matterjs: /MdnsAdvertisement Publishing kind: commissionable/,
};

/**
 * The onboarding payload the TH publishes for its own setup code. A subject that renders one reports
 * it directly; a chip app only prints it, and the first of the two it prints is the standard
 * commissioning flow's.
 *
 * `from` is the log cursor to read it at, and a step after a device restart must supply one: the
 * default reads the whole log and so returns the payload the *previous* generation printed.
 *
 * That is harmless because a subject's identity is fixed at construction and reused on every start —
 * `ChipLocalSubject.start()` rebuilds `--discriminator`/`--passcode` from `this.commissioning` on each
 * spawn, and the matter.js instances take theirs from their config — so a `factoryReset` comes back
 * with the same setup code. It is a property of the harness, not of any device it may run, and it is
 * what lets `commissionByQr` restore a TH *after* its caller has already read the payload.
 */
export async function thQrPayload(th: CertDevice, from = 0): Promise<string> {
    if (th.commissioning.qrPairingCode) {
        return th.commissioning.qrPairingCode;
    }

    const result = await th.log.expect(
        { chip: SETUP_QR_CODE, matterjs: SETUP_QR_CODE },
        { flavor: th.flavor, from, timeoutMs: COMMISSIONING_LOG_TIMEOUT },
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
export async function recordParse(cx: CertStepContext, payload: string, th?: CertDevice): Promise<void> {
    th ??= theTh(cx);
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
    return qrPayloadWith(await thQrPayload(theTh(cx)), { discoveryCapabilities: ON_NETWORK_ONLY });
}

/** § 5.1.3.1 Table 59's version string for this revision of the specification. */
export const STANDARD_VERSION = 0;

/** § 5.1.3.1 Table 59's standard commissioning flow. */
export const STANDARD_FLOW = 0;

/** § 5.1.3.1 Table 34's commissioning flows: the device needs a user action before it is commissionable. */
export const USER_INTENT_FLOW = 1;

/** § 5.1.3.1 Table 34's commissioning flows: the device needs steps the manufacturer defines. */
export const CUSTOM_FLOW = 2;

/** What a check calls each flow, so a bundle names the one its test case is named for. */
const FLOW_NAMES: Record<number, string> = {
    [STANDARD_FLOW]: "the standard flow",
    [USER_INTENT_FLOW]: "the user-intent flow",
    [CUSTOM_FLOW]: "the custom flow",
};

/**
 * Records that the DUT reads `payload` as offering `capability` over the standard commissioning flow.
 *
 * The capability is what tells one leg of a per-transport plan from another, and the flow is what such
 * a plan is named for, so both belong in the verdict. Left to the prose, every leg's scan step passes
 * on the same evidence — that the DUT read some payload's discriminator and passcode — and a step
 * handed the wrong leg's payload still passes.
 */
export async function recordPayloadOffering(
    cx: CertStepContext,
    payload: string,
    capability: keyof typeof DiscoveryCapabilitiesBitmap,
    flowType = STANDARD_FLOW,
): Promise<void> {
    const parsed = await cx.controllers.dut.parseQrPayload(payload);
    const offered = DiscoveryCapabilitiesSchema.decode(parsed.discoveryCapabilities);
    const names = Object.entries(offered)
        .filter(([, set]) => set)
        .map(([name]) => name);

    const wrong = new Array<string>();
    if (!offered[capability]) {
        wrong.push(`does not offer ${capability}`);
    }
    if (parsed.flowType !== flowType) {
        wrong.push(`carries flowType ${parsed.flowType} rather than ${FLOW_NAMES[flowType] ?? flowType}`);
    }

    record(
        cx,
        {
            type: "response",
            verdict: wrong.length ? "fail" : "pass",
            detail:
                `DUT read ${payload} as flowType=${parsed.flowType} offering discovery over ` +
                `${names.join(", ") || "nothing"} (bitmask 0b${parsed.discoveryCapabilities
                    .toString(2)
                    .padStart(8, "0")})` +
                (wrong.length ? `; the payload ${wrong.join(" and ")}` : ""),
        },
        `Payload offers ${capability} over ${FLOW_NAMES[flowType] ?? `flow ${flowType}`}`,
    );
}

/**
 * Records that `payload` does not offer `capability`, read back through the DUT so a controller that
 * cannot report a bitmask fails here rather than silently proving nothing.
 *
 * `unchangedFrom` is the payload the plan derived this one from ("using the QR code from Step 1"), and
 * is what holds the derivation to changing only the discovery capabilities: a helper that also moved
 * the discriminator or the passcode still offers no BLE, so the capability check alone cannot tell the
 * plan's payload from a different device's. Required for that reason — a guard against a
 * self-satisfying comparison is one an optional parameter loses by accident.
 */
export async function recordDiscoveryCapabilityAbsent(
    cx: CertStepContext,
    payload: string,
    capability: keyof typeof DiscoveryCapabilitiesBitmap,
    what: string,
    unchangedFrom: string,
): Promise<void> {
    // Every field of the source but the capabilities, which is the one this derivation changes and the
    // one the check below judges. Stating them from the source rather than through `unchangedFrom` is
    // what keeps the capabilities out of the comparison without asserting the payload's own value
    // against itself.
    const { discoveryCapabilities: _capabilities, ...unchanged } = qrPayloadFields(unchangedFrom);
    record(cx, checkGeneratedPayload(payload, unchanged), `${what}: derived from step 1's payload`);

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
const VENDOR_ID_BITS = { offset: 3, length: 16 };
const PRODUCT_ID_BITS = { offset: 19, length: 16 };
const FLOW_TYPE_BITS = { offset: 35, length: 2 };
const DISCOVERY_BITS = { offset: 37, length: 8 };
const DISCRIMINATOR_BITS = { offset: 45, length: 12 };
const PASSCODE_BITS = { offset: 57, length: 27 };

/** § 5.1.3.1's fixed structure is 11 bytes; § 5.1.5's optional TLV follows it. */
const FIXED_PAYLOAD_BYTES = 11;

function writeBits(data: Uint8Array, { offset, length }: { offset: number; length: number }, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** length) {
        // The bitwise operators below coerce a fraction and NaN silently, which would put a payload
        // nobody asked for into the evidence
        throw new InternalError(`${value} does not fit the ${length} bits at offset ${offset}`);
    }
    if (data.length * 8 < offset + length) {
        // Writing past the end of a Uint8Array is silently dropped, for the same result
        throw new InternalError(`The ${length} bits at offset ${offset} do not fit a payload of ${data.length} bytes`);
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

function readBits(data: Uint8Array, { offset, length }: { offset: number; length: number }): number {
    if (data.length * 8 < offset + length) {
        throw new InternalError(`The ${length} bits at offset ${offset} do not fit a payload of ${data.length} bytes`);
    }
    let value = 0;
    for (let i = 0; i < length; i++) {
        const bit = offset + i;
        if (data[bit >> 3] & (1 << (bit % 8))) {
            value |= 1 << i;
        }
    }
    return value;
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
    fields: { version?: number; passcode?: number; discoveryCapabilities?: number; flowType?: number },
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
    if (fields.flowType !== undefined) {
        writeBits(data, FLOW_TYPE_BITS, fields.flowType);
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
 * Names each of `names` that `expected` states and `actual` does not carry. A field `expected` omits
 * is not asserted — keyed on the property being present, so a caller can assert an absent field, and
 * so one that passes an accidental `undefined` gets an assertion rather than silence.
 */
function statedMismatches<T extends object>(actual: T, expected: Partial<T>, names: readonly (keyof T)[]): string[] {
    const wrong = new Array<string>();
    for (const name of names) {
        if (Object.hasOwn(expected, name) && actual[name] !== expected[name]) {
            wrong.push(`${String(name)}=${String(expected[name])}`);
        }
    }
    return wrong;
}

/**
 * Every field § 5.1.3.1 Table 59's fixed structure carries, plus § 5.1.5's optional tail.
 *
 * All of them, not only the ones the negative plans substitute: an expectation that a substitution
 * left the rest of the payload alone is only as strong as the set of fields it can compare.
 */
export interface QrPayloadFields {
    /** § 5.1.3's `MT:`, or whatever a step put in its place. */
    prefix: string;

    version: number;
    vendorId: number;
    productId: number;

    /** 0 standard, 1 user intent, 2 custom (Table 59). */
    flowType: number;

    /** § 5.1.3.1 Table 60's bitmask, as it appears on the wire. */
    discoveryCapabilities: number;

    discriminator: number;
    passcode: number;

    /** § 5.1.5's TLV as hex, `""` where the payload carries none. */
    tlv: string;
}

/**
 * {@link qrPayloadWith}'s reader, and not a codec for the same reason it is not one.
 *
 * Base38 carries no colon, so the first one ends the prefix.
 */
export function qrPayloadFields(payload: string): QrPayloadFields {
    const prefixEnd = payload.indexOf(":");
    if (prefixEnd < 0) {
        throw new InternalError(`Cannot read fields out of "${payload}", which carries no onboarding payload prefix`);
    }

    const prefix = payload.slice(0, prefixEnd + 1);
    const data = Uint8Array.from(Bytes.of(Base38.decode(payload.slice(prefix.length))));

    return {
        prefix,
        version: readBits(data, VERSION_BITS),
        vendorId: readBits(data, VENDOR_ID_BITS),
        productId: readBits(data, PRODUCT_ID_BITS),
        flowType: readBits(data, FLOW_TYPE_BITS),
        discoveryCapabilities: readBits(data, DISCOVERY_BITS),
        discriminator: readBits(data, DISCRIMINATOR_BITS),
        passcode: readBits(data, PASSCODE_BITS),
        tlv: Bytes.toHex(data.slice(FIXED_PAYLOAD_BYTES)),
    };
}

/** What a generating step claims about the payload it produced. */
export interface ExpectedQrPayloadFields extends Partial<QrPayloadFields> {
    /**
     * The payload every field `expected` does not name must still match. The plans ask for "the same
     * Onboarding Payload components except for" one, and without this the expectation and the
     * substitution are the same value, which no generator bug can violate.
     */
    unchangedFrom?: string;
}

/**
 * Judges a generated `payload` against the fields `expected` names; one it omits is not asserted
 * unless {@link ExpectedQrPayloadFields.unchangedFrom} supplies it.
 *
 * This is a claim about the artifact a step produced, not about the DUT or the TH: a generating step
 * has no interaction of its own to record, and what it can be held to is that the code it made
 * carries the substitution the plan asked for and nothing else.
 */
export function checkGeneratedPayload(payload: string, expected: ExpectedQrPayloadFields): CheckRecord {
    const { unchangedFrom, ...stated } = expected;
    const unchanged = namedCode(expected, "unchangedFrom", unchangedFrom);
    const fields = qrPayloadFields(payload);
    const wrong = statedMismatches(
        fields,
        { ...(unchanged === undefined ? {} : qrPayloadFields(unchanged)), ...stated },
        [
            "prefix",
            "version",
            "vendorId",
            "productId",
            "flowType",
            "discoveryCapabilities",
            "discriminator",
            "passcode",
            "tlv",
        ],
    );

    return {
        type: "response",
        verdict: wrong.length ? "fail" : "pass",
        detail:
            `Generated ${payload}, carrying prefix ${fields.prefix} version=${fields.version} ` +
            `vendorId=${fields.vendorId} productId=${fields.productId} flowType=${fields.flowType} ` +
            `discoveryCapabilities=0b${fields.discoveryCapabilities.toString(2).padStart(8, "0")} ` +
            `discriminator=${fields.discriminator} passcode=${fields.passcode}` +
            (fields.tlv ? ` tlv=${fields.tlv}` : "") +
            (wrong.length ? `; expected ${wrong.join(", ")}` : ""),
    };
}

/** {@link checkGeneratedPayload} for the one-artifact case; use {@link recordAll} for a step generating several. */
export function recordGeneratedPayload(
    cx: CertStepContext,
    payload: string,
    expected: ExpectedQrPayloadFields,
    what: string,
): void {
    record(cx, checkGeneratedPayload(payload, expected), what);
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
    #refusalTimeout: Duration;
    #settleTimeout: Duration;

    /** Budgets are injectable because the unit tests cannot wait out the real ones. */
    constructor(budgets?: { refusalTimeout?: Duration; settleTimeout?: Duration }) {
        this.#refusalTimeout = budgets?.refusalTimeout ?? REFUSAL_TIMEOUT;
        this.#settleTimeout = budgets?.settleTimeout ?? REFUSAL_SETTLE_TIMEOUT;
    }

    /** How long {@link settle} waits, for a step that needs the same slack for its own wait. */
    get settleBudget(): number {
        return this.#settleTimeout;
    }

    /**
     * Hands `attempt` to {@link settle}, which is what a step that stops waiting for a commissioning
     * owes the run: one that succeeds afterwards leaves a fabric on the TH that nothing else will
     * remove. An attempt whose outcome the step *did* see is owned by the step, and handing that one
     * over as well would have its fabric removed twice. Kept as a settled outcome so an attempt nobody
     * awaits again cannot surface as an unhandled rejection.
     */
    track(attempt: Promise<CertNodeRef>): void {
        this.#attempts.push(
            attempt.then(
                ref => ref,
                () => undefined,
            ),
        );
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
        this.track(attempt);

        record(
            cx,
            await expectRejection(
                `commissioning from ${describeTarget(target)}`,
                attempt,
                this.#refusalTimeout,
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
        timeout: Duration,
    ): Promise<void> {
        const attempt = cx.controllers.dut.commission(target);
        this.track(attempt);

        record(
            cx,
            await expectRejection(
                `commissioning from ${describeTarget(target)}`,
                attempt,
                timeout,
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

        const timeout = Time.sleep("outstanding refused commissionings", this.#settleTimeout);
        let refs;
        try {
            refs = await Promise.race([Promise.all(attempts), timeout.then(() => undefined)]);
        } finally {
            timeout.cancel();
        }

        if (refs === undefined) {
            throw new CertCleanupError(
                `${attempts.length} commissioning attempt(s) the DUT was asked to refuse are still running after ` +
                    `${Duration.format(this.#settleTimeout)}; one that succeeds now cannot be cleaned up`,
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
                `A commissioning attempt this run stopped waiting for onboarded the TH after all, and the fabric ` +
                    `could not be removed: ${failures.join("; ")}`,
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
 *
 * The two ids are optional on {@link ManualPairingCodeParts} — a step generating a code may leave them
 * out — but a TH that names neither is refused below, so a caller comparing against the TH's own ids
 * gets them without a check of its own.
 */
export async function thCodeParts(
    cx: CertStepContext,
): Promise<ManualPairingCodeParts & { vendorId: number; productId: number }> {
    const th = theTh(cx);
    const { vendorId, productId } = await cx.controllers.dut.parseQrPayload(await thQrPayload(th));
    if (vendorId === undefined || productId === undefined) {
        // parseQrPayload reports § 2.5.2/§ 2.5.3's "unspecified" as absent, and Table 64's 21-digit
        // form has nowhere to put an absent one — a TH publishing neither cannot host these plans
        throw new InternalError(
            `The TH's onboarding payload names vendor ${vendorId} and product ${productId}; a 21-digit ` +
                "manual pairing code carries both",
        );
    }

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
    const th = theTh(cx);

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
export const SHORT_DISCRIMINATOR_SHIFT = 8;

/**
 * Records that the TH is discoverable as a commissionable device, which every commissioning-flow plan
 * states as its own step or precondition.
 */
export async function recordCommissionable(
    cx: CertStepContext,
    what = "TH advertising as commissionable",
    th = theTh(cx),
): Promise<void> {
    record(cx, await expectMdns(th, { commissionable: true }, { timeoutMs: MDNS_TIMEOUT }), what);
}

/**
 * Whether `error` is a commissioner giving up on a code it read successfully, which is what the
 * negative vendor and product plans mean by "the DUT terminates the commissioning process".
 *
 * The two controllers say it differently. In-process, a code no advertisement satisfies ends as a
 * {@link DiscoveryError}, or as a {@link DiscoveryAggregateError} where a candidate was tried and
 * failed — a manual code carries only the discriminator's 4 most significant bits, so one device in
 * sixteen on the network is a candidate the scanner hands on. chip-tool's output cannot separate one
 * command failure from another, so its give-up arrives as a {@link ChipToolCommandError} — on those
 * legs this excludes a controller that would not start, and the probe the caller makes first excludes
 * a TH that was not there.
 *
 * An {@link OnboardingPayloadRefusedError} is the opposite outcome — the controller rejected the code
 * before it looked for anything, and these steps generate a well-formed one. It is not a subclass of
 * either accepted error today, and the guard is what keeps that true if it becomes one.
 */
export function isCommissioningGiveUp(error: unknown): boolean {
    if (error instanceof OnboardingPayloadRefusedError) {
        return false;
    }
    return (
        error instanceof DiscoveryError ||
        error instanceof DiscoveryAggregateError ||
        error instanceof ChipToolCommandError
    );
}

/**
 * Records what the DUT made of a code naming `vendorId` where the TH's own payload names `thVendorId`,
 * and the plan accepts either outcome: terminating commissioning, or onboarding anyway with the user
 * aware of the risk.
 *
 * The two controllers genuinely differ. chip-tool matches a code's vendor and product id against the
 * device it discovered (`SetUpCodePairer::NodeMatchesCurrentFilter`) and finds nothing; matter.js
 * filters its own discovery on the ids the code carries and finds nothing either. A fabric that
 * results is handed to `commissioned`, whose next {@link commissionByManualCode} takes it off the TH
 * again.
 *
 * Two things the evidence has to carry, because the verdict is `pass` either way:
 *
 * - Only a give-up counts as termination ({@link isCommissioningGiveUp}), and the TH has to be
 *   observed advertising first: accepting any rejection would pass the step on a controller that would
 *   not start, and on a TH that stopped advertising. The restore this runs first probes only for a code
 *   that follows an onboarding, so a code after a refusal needs its own probe.
 * - A code naming the vendor the TH itself advertises is step 1's code, so what the DUT did with it
 *   says nothing about a substituted id. The detail says which of the two happened.
 */
export async function recordVendorOutcome(
    cx: CertStepContext,
    code: string,
    commissioned: CommissionedRefs,
    refusals: CommissioningRefusals,
    what: string,
    timeout: Duration,
    ids: { vendorId: number; thVendorId: number },
    /** Overridden by the unit tests, which have no advertisement to observe. */
    probeCommissionable: (cx: CertStepContext, what: string) => Promise<void> = recordCommissionable,
): Promise<void> {
    // Passed on to the restore as well: without it a restore reaching live mDNS is what a unit test
    // would wait out, and its default is the real probe either way.
    const restored = await restoreCommissioningMode(cx, commissioned, probeCommissionable);

    // A rejection is evidence about the code only if the TH was there to be found; without this the
    // step passes on a TH that stopped advertising after an earlier attempt. A restore that ran has
    // just proven the same thing.
    if (!restored) {
        await probeCommissionable(cx, `${what}: TH advertising before the attempt`);
    }

    const substitution =
        ids.vendorId === ids.thVendorId
            ? `the code names the TH's own vendor 0x${ids.thVendorId.toString(16)}, so it is step 1's code and ` +
              "substitutes nothing"
            : `the code names vendor 0x${ids.vendorId.toString(16)} where the TH's own payload names ` +
              `0x${ids.thVendorId.toString(16)}`;

    const label = `commissioning from ${code}`;
    const attempt = cx.controllers.dut.commission({ manualPairingCode: code, giveUpAfterMs: timeout });
    const outcome = await settleWithin(label, attempt, Millis(timeout + refusals.settleBudget));

    switch (outcome.kind) {
        case "rejected": {
            const { error } = outcome;
            const message = error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
            const gaveUp = isCommissioningGiveUp(error);
            record(
                cx,
                {
                    type: "response",
                    verdict: gaveUp ? "pass" : "fail",
                    detail: gaveUp
                        ? `DUT terminated commissioning after ${outcome.elapsed} (${substitution}): ${message}`
                        : `${label} failed after ${outcome.elapsed} for a reason that says nothing about the code ` +
                          `(${substitution}): ${message}`,
                },
                what,
            );
            return;
        }

        case "resolved": {
            const ref = outcome.value;
            commissioned.set("dut", ref);
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail:
                        `DUT onboarded the TH as node ${ref} (${substitution}), which the plan allows where the ` +
                        "user accepts the risk",
                },
                what,
            );
            return;
        }

        case "timeout":
            // Only now does cleanup own the attempt: an outcome this step saw is already owned, by
            // `commissioned` for one that onboarded, and handing it over as well would have the fabric
            // removed twice.
            refusals.track(attempt);
            record(
                cx,
                {
                    type: "response",
                    verdict: "fail",
                    detail: `${label} neither onboarded the TH nor gave up within ${outcome.elapsed}`,
                },
                what,
            );
    }
}

/**
 * Removes the fabric an earlier step commissioned and records that the TH left the Matter network,
 * which the device states twice in its own log: the removal succeeded, and the removed fabric's
 * sessions are gone.
 *
 * The network does not settle this within a step's budget: against a chip TH, `operationalRecords: 0`
 * for the removed fabric's own instance name still observes a live SRV record after 30 s, although
 * the device's log shows it updating its advertisement as it removes the fabric. See this
 * directory's AGENTS.md for what is and is not established about that.
 *
 * The fabric index is read while the fabric is still there; the in-process controller drops the peer
 * as the device announces the removal, so it cannot be read afterwards. Both checks search from the
 * step's own mark, not from each other, because matter.js closes the removed fabric's sessions
 * before it answers the invoke and chip after.
 *
 * **Only one fabric may be removable after the mark.** chip's success line names no fabric, so on
 * that flavor it says a fabric went, and only the session line says which. A caller with a second
 * admin on the TH would have another fabric's removal satisfy the first check.
 */
export async function recordUnpair(cx: CertStepContext, commissioned: CommissionedRefs): Promise<TransitionMark> {
    const th = theTh(cx);
    const ref = commissioned.require("dut");
    const node = cx.controllers.dut.node(ref);

    const fabricIndex = await readOwnFabricIndex(node);

    const since = await markTransition(cx);
    const from = since;
    await node.decommission();
    commissioned.clear("dut");
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: `DUT removed its fabric (index ${fabricIndex}) from the TH, giving up node ${ref}`,
    });

    const removed = await expectDeviceLog(th.log, th.flavor, removeFabricSucceeded(fabricIndex), from, LOG_TIMEOUT);
    const expired = await expectDeviceLog(th.log, th.flavor, fabricSessionsEnded(fabricIndex), from, LOG_TIMEOUT);
    recordAll(cx, [
        { check: () => removed.check, what: "TH reported a successful fabric removal" },
        { check: () => expired.check, what: "TH ended the DUT's fabric's sessions" },
    ]);

    return since;
}

/**
 * Puts the TH back into commissioning mode by its manufacturer's means and records that it got
 * there: the device's own announcement that it is advertising commissionable again, and then an
 * mDNS observation of that advertisement.
 *
 * A chip TH needs a factory reset: removing its last fabric leaves it re-advertising with
 * `commissioning mode 0` (`kDisabled`), which publishes no commissionable service. A matter.js
 * device returns on its own, and erasing it would restart a TH that needs nothing.
 *
 * **The device's line is what witnesses the transition; the mDNS probe corroborates it.** A probe on
 * its own is answered by any live record for the TH's discriminator, including one cached before it
 * was ever commissioned — and every flavor pins its discriminator across restarts. Measured, not
 * theorised: on a matterjs run the probe passed at 13:05:44.088 and the device published its
 * commissionable record at 13:05:44.123, 35 ms later.
 *
 * `options.since` is where the announcement is searched from, and must precede whatever caused the
 * transition — for a matter.js TH that is the caller's own `decommission()`, which happens before
 * this function is entered, so a mark taken here would already be too late. {@link recordUnpair}
 * returns exactly that mark.
 *
 * **Every fabric on the TH must already be surrendered.** The reset wipes all of them, so a
 * `CommissionedRefs` still holding one would have the finalizer remove a fabric that is gone and
 * report a cleanup failure in place of the run's real outcome.
 */
export async function recordBackInCommissioningMode(
    cx: CertStepContext,
    options: {
        what?: string;
        since?: TransitionMark;
        /** The device this acts on, where the plan names more than one. */
        th?: CertDevice;
        /** Overridden by the unit tests, which have no mDNS to answer. */
        probeCommissionable?: (cx: CertStepContext, what: string) => Promise<void>;
    } = {},
): Promise<void> {
    const th = options.th ?? theTh(cx);
    const {
        what = "TH advertising as commissionable again",
        // Bound to this device rather than to the plan's single-device role, which a multi-device
        // plan does not have
        probeCommissionable = (cx: CertStepContext, what: string) => recordCommissionable(cx, what, th),
        since = await markTransition(cx, th),
    } = options;
    const from = since;

    if (th.flavor !== "matterjs") {
        await th.backchannel({ name: "factoryReset" });

        // A chip app's start() returns when the process is up, not when the app is, so without this
        // the checks below can run before the new generation exists at all.
        record(
            cx,
            await expectSequence(
                th.log,
                th.flavor,
                "TH restarted",
                { chip: [SETUP_QR_CODE] },
                from,
                COMMISSIONING_LOG_TIMEOUT,
            ),
            "TH factory reset",
        );
    }

    record(
        cx,
        (await expectDeviceLog(th.log, th.flavor, ADVERTISING_COMMISSIONABLE, from, COMMISSIONING_LOG_TIMEOUT)).check,
        "TH announced it is advertising commissionable again",
    );

    // Corroboration only. On its own this is answered by any live record for the TH's discriminator,
    // including the one it published before it was ever commissioned; the announcement checked above
    // is what witnesses the transition.
    await probeCommissionable(cx, what);
}

/**
 * Returns the TH to a factory-new state if a fabric from an earlier onboarding is still on it, which
 * is what a plan means by commissioning the same device again.
 *
 * The fabric comes off first, so the controller never holds a peer for a fabric the device has
 * forgotten.
 */
async function restoreCommissioningMode(
    cx: CertStepContext,
    commissioned: CommissionedRefs,
    probeCommissionable?: (cx: CertStepContext, what: string) => Promise<void>,
    subject?: CertDevice,
): Promise<boolean> {
    const previous = commissioned.get("dut");
    if (previous === undefined) {
        return false;
    }

    const th = subject ?? theTh(cx);
    const since = await markTransition(cx, th);
    await cx.controllers.dut.node(previous).decommission();
    commissioned.clear("dut");

    await recordBackInCommissioningMode(cx, { since, probeCommissionable, th });
    return true;
}

/** {@link commissionByQr} for a manual pairing code, which discovers by the short discriminator. */
export async function commissionByManualCode(
    cx: CertStepContext,
    code: string,
    commissioned: CommissionedRefs,
): Promise<void> {
    await commissionByTarget(cx, { manualPairingCode: code }, commissioned);
}

/**
 * Onboards the TH from `payload`, first returning it to a factory-new state if an earlier step
 * commissioned it (see {@link restoreCommissioningMode}).
 */
export async function commissionByQr(
    cx: CertStepContext,
    payload: string,
    commissioned: CommissionedRefs,
    /**
     * The device being onboarded, where the plan names more than one. Its node ref is still filed
     * under the `dut` role, because `CommissionedRefs.decommissionAll` removes a fabric through
     * `cx.controllers[role]` — so a plan whose devices share one controller gives each device its own
     * `CommissionedRefs` rather than its own role.
     */
    th?: CertDevice,
): Promise<void> {
    await commissionByTarget(cx, { qrPairingCode: payload }, commissioned, th);
}

async function commissionByTarget(
    cx: CertStepContext,
    target: CommissioningTarget,
    commissioned: CommissionedRefs,
    subject?: CertDevice,
): Promise<void> {
    const dut = cx.controllers.dut;
    const th = subject ?? theTh(cx);

    await restoreCommissioningMode(cx, commissioned, undefined, subject);

    // Settled, because the line this waits for names no fabric on either flavor: a completion still
    // in flight from an earlier commissioning would otherwise satisfy this one
    const from = await th.log.markSettled();
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
            { chip: [COMMISSIONING_COMPLETE], matterjs: [MATTERJS_COMMISSIONED_FABRIC] },
            from,
            COMMISSIONING_LOG_TIMEOUT,
        ),
        `${th.id} commissioning`,
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

/** § 5.1.4.1 Table 62/64's two lengths. */
const MANUAL_CODE_SHORT_LENGTH = 11;
const MANUAL_CODE_LONG_LENGTH = 21;

/** What § 5.1.4.1 Table 62's digits say, read back without judging any of it. */
export interface ManualPairingCodeDigits {
    /** Table 62's 11 or Table 64's 21. */
    length: number;

    /** § 5.1.4.1.2's "a format after v1", which a first digit of 8 or 9 marks. */
    futureFormat: boolean;

    /** The `VID_PID_PRESENT` bit, which {@link length} states a second time and may disagree with. */
    vidPidPresent: boolean;

    /** Table 62's 4-bit form. Says nothing about a {@link futureFormat} code, whose marker displaces it. */
    shortDiscriminator: number;

    passcode: number;

    /**
     * The digits the 21-digit form carries, whatever `VID_PID_PRESENT` says. Reported as 0 where the
     * codecs would normalise § 2.5.3's unspecified identifier to absent, so a step can assert the 0 it
     * substituted.
     */
    vendorId?: number;
    productId?: number;

    checkDigit: number;

    /** Whether {@link checkDigit} is § 5.1.4.1's Verhoeff digit over every digit before it. */
    checkDigitCorrect: boolean;
}

/** {@link manualPairingCode}'s reader, and not a codec for the same reason it is not one. */
export function manualPairingCodeDigits(code: string): ManualPairingCodeDigits {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== MANUAL_CODE_SHORT_LENGTH && digits.length !== MANUAL_CODE_LONG_LENGTH) {
        throw new InternalError(`"${code}" is ${digits.length} digits, which is no manual pairing code length`);
    }

    const header = Number(digits[0]);
    const carriesIdentity = digits.length === MANUAL_CODE_LONG_LENGTH;
    const checkDigit = Number(digits.slice(-1));

    return {
        length: digits.length,
        futureFormat: header >= FUTURE_FORMAT_DIGIT,
        vidPidPresent: !!(header & (1 << 2)),
        shortDiscriminator: ((header & 0x03) << 2) | ((Number(digits.slice(1, 6)) >> 14) & 0x03),
        passcode: (Number(digits.slice(1, 6)) & 0x3fff) | (Number(digits.slice(6, 10)) << 14),
        vendorId: carriesIdentity ? Number(digits.slice(10, 15)) : undefined,
        productId: carriesIdentity ? Number(digits.slice(15, 20)) : undefined,
        checkDigit,
        checkDigitCorrect: new Verhoeff().computeChecksum(digits.slice(0, -1)) === checkDigit,
    };
}

/** What a generating step claims about the manual code it produced. */
export interface ExpectedManualCodeDigits extends Partial<ManualPairingCodeDigits> {
    /** The plan requires the generated code to differ from step 1's. */
    differsFrom?: string;

    /**
     * The code every field `expected` does not name must still match, the check digit aside — every
     * substitution changes that one. See {@link ExpectedQrPayloadFields.unchangedFrom} for why an
     * expectation naming only the substituted field asserts nothing.
     */
    unchangedFrom?: string;
}

/**
 * {@link checkGeneratedPayload} for a manual pairing code, and a claim about the artifact for the
 * same reason.
 *
 * The check digit is asserted whether or not `expected` names it, because every generating step's
 * expected outcome demands the Verhoeff digit of § 5.1.4.1; the step asking for a wrong one states
 * `checkDigitCorrect: false`.
 */
export function checkGeneratedManualCode(code: string, expected: ExpectedManualCodeDigits): CheckRecord {
    const { differsFrom, unchangedFrom, ...stated } = expected;
    const differs = namedCode(expected, "differsFrom", differsFrom);
    const unchanged = unchangedDigits(namedCode(expected, "unchangedFrom", unchangedFrom));
    const digits = manualPairingCodeDigits(code);
    const wrong = statedMismatches(digits, { checkDigitCorrect: true, ...unchanged, ...stated }, [
        "length",
        "futureFormat",
        "vidPidPresent",
        "shortDiscriminator",
        "passcode",
        "vendorId",
        "productId",
        "checkDigit",
        "checkDigitCorrect",
    ]);
    if (differs !== undefined && code === differs) {
        wrong.push(`a code other than ${differs}`);
    }

    return {
        type: "response",
        verdict: wrong.length ? "fail" : "pass",
        detail:
            `Generated ${code}, carrying ${digits.length} digits futureFormat=${digits.futureFormat} ` +
            `vidPidPresent=${digits.vidPidPresent} shortDiscriminator=${digits.shortDiscriminator} ` +
            `passcode=${digits.passcode} vendorId=${digits.vendorId} productId=${digits.productId} ` +
            `checkDigit=${digits.checkDigit} (${digits.checkDigitCorrect ? "correct" : "not the Verhoeff digit"})` +
            (wrong.length ? `; expected ${wrong.join(", ")}` : ""),
    };
}

/** Every digit field a substitution leaves alone, which is all of them but the check digit. */
function unchangedDigits(code?: string): Partial<ManualPairingCodeDigits> {
    if (code === undefined) {
        return {};
    }
    const { checkDigit, ...unchanged } = manualPairingCodeDigits(code);
    return unchanged;
}

/**
 * The code an expectation names under `key`, holding to the presence rule {@link statedMismatches}
 * follows: a property that is there but undefined is a caller threading an optional value in, which
 * would otherwise drop the assertion silently.
 */
function namedCode(expected: object, key: string, code: string | undefined): string | undefined {
    if (!Object.hasOwn(expected, key)) {
        return undefined;
    }
    if (code === undefined) {
        throw new ImplementationError(`${key} names a code to compare against; omit it when there is none`);
    }
    return code;
}

/** {@link checkGeneratedManualCode} for the one-code case; use {@link recordAll} for a step generating several. */
export function recordGeneratedManualCode(
    cx: CertStepContext,
    code: string,
    expected: ExpectedManualCodeDigits,
    what: string,
): void {
    record(cx, checkGeneratedManualCode(code, expected), what);
}
