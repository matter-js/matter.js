/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis } from "@matter/general";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, EventReadEntry, PicsValues } from "@matter/testing";
import {
    certTest,
    controllerPicsOverridesFor,
    PicsUnavailableError,
    resolveControllerImplementation,
} from "@matter/testing";
import { CertCheckFailedError, CommissionedRefs, describeValue, record, recordAll, requireId } from "./tc-support.js";

const SWITCH = Matter.clusters.require("Switch");
const SWITCH_ID = requireId(SWITCH.id, "Switch cluster");

function attributeId(name: string): number {
    return requireId(SWITCH.attributes.require(name).id, `Switch.${name}`);
}

function eventId(name: string): number {
    return requireId(SWITCH.events.require(name).id, `Switch.${name}`);
}

const FEATURE_MAP = attributeId("featureMap");
const CURRENT_POSITION = attributeId("currentPosition");
const NUMBER_OF_POSITIONS = attributeId("numberOfPositions");
const MULTI_PRESS_MAX = attributeId("multiPressMax");

/** The TH's two switches: a latching one, and a momentary one that is also an action switch. */
const LATCHING_ENDPOINT = 1;
const MOMENTARY_ENDPOINT = 3;

/** `Switch` feature bits (Matter Application Clusters § 1.12.4). */
const LS = 1 << 0;
const MS = 1 << 1;
const MSR = 1 << 2;
const MSL = 1 << 3;
const MSM = 1 << 4;
const AS = 1 << 5;

/** What the plan's step 1b and step 3b require the TH to be. */
const LATCHING_FEATURE_MAP = LS;
const MOMENTARY_FEATURE_MAPS = [MS | MSL | MSM | AS, MS | MSR | MSL | MSM];

/** The plan's own value for both switches. */
const POSITIONS = 2;

/**
 * The DUT's own declaration of what it supports as a switch *client*, which is what steps 0a-0h check
 * for self-consistency. It is the controller's PICS overlaid on the device file, because the DUT here
 * is the controller.
 */
const PICS_LS = "SWTCH.C.F00";
const PICS_MS = "SWTCH.C.F01";
const PICS_MSR = "SWTCH.C.F02";
const PICS_MSL = "SWTCH.C.F03";
const PICS_MSM = "SWTCH.C.F04";
const PICS_AS = "SWTCH.C.F05";
const PICS_POLLING = "SWTCH.C.M.SwitchStatePolling";
const PICS_EVENTING = "SWTCH.C.M.SwitchStateEventing";

/** The position of the button the momentary steps press; 0 is the idle position. */
const PRESSED_POSITION = 1;

/** The plan's own multi press: two presses of 0.2s each. */
const PRESSES = 2;
const PRESS_MS = 200;

/** The plan's own long-press timings: LongPress after 0.75s, released 2s later. */
const LONG_PRESS_DELAY_MS = 750;
const LONG_PRESS_DURATION_MS = 2_750;

/** Between reads of a state the device may not have applied yet. */
const READ_RETRY_MS = 100;

/** A subscription that reports nothing for this long is taken to have delivered what it holds. */
const EVENT_QUIET_MS = 750;

/** After the switch is reset, before the next simulated press. */
const SWITCH_IDLE_MS = 1_000;

/** How long a simulated operation is given to reach the DUT. */
const EVENT_WAIT_MS = 5_000;

/** The plan runs each simulation for a minute; the evidence is the same after a few operations. */
const OPERATIONS = 2;

/**
 * Between operations. The plan waits ten seconds; what the wait is *for* is that each change is its own
 * operation — back-to-back writes reach the device as one state change and produce one event, which is
 * the switch behaving correctly and the step observing the wrong thing.
 */
const BETWEEN_OPERATIONS_MS = 300;

/**
 * Returns the switch to its idle position and gives the device time to close the press cycle the
 * previous step left open. A momentary switch counts presses until it goes idle (Application Clusters
 * § 1.12.8), so a step that presses without this one sees its presses counted into the cycle before it
 * and reported as one multi press instead of what it simulated. How much of the cycle the command
 * itself ends is the device's own: the matter.js test device resets its switch state, a chip app only
 * moves the position, which is why the wait matters as much as the command.
 */
async function idleSwitch(cx: CertStepContext, endpoint: number) {
    await cx.devices.th.backchannel({ name: "simulateSwitchIdle", endpointId: endpoint });
    await pause(SWITCH_IDLE_MS);
}

async function pause(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

const commissioned = new CommissionedRefs();
const received = new Array<EventReadEntry>();

/**
 * What the DUT declares as a switch client. A device whose own PICS file is unavailable gates nothing
 * (see `certTest`'s own handling), so the controller's declaration stands alone rather than failing the
 * run — the consistency rules are about that declaration.
 */
function picsOf(cx: CertStepContext): PicsValues {
    const overlay = controllerPicsOverridesFor(resolveControllerImplementation());
    try {
        return { ...cx.devices.th.pics.values, ...overlay };
    } catch (e) {
        if (e instanceof PicsUnavailableError) {
            return overlay;
        }
        throw e;
    }
}

function declares(pics: PicsValues, key: string): boolean {
    return pics[key] === 1;
}

/**
 * One of the plan's eight consistency rules, each of which names a combination the DUT's declaration
 * must not hold. The step passes when the combination is absent, which is what "FAIL the test - ..."
 * asks for read the other way round.
 */
function consistencyStep(rule: (pics: PicsValues) => boolean, violation: string) {
    return async (cx: CertStepContext) => {
        const pics = picsOf(cx);
        const violated = rule(pics);
        record(
            cx,
            {
                type: "response",
                verdict: violated ? "fail" : "pass",
                detail: violated ? `the DUT declares ${violation}` : `the DUT's declaration does not hold ${violation}`,
            },
            "the DUT's switch-client declaration",
        );
        if (violated) {
            throw new CertCheckFailedError(`the DUT declares ${violation}`);
        }
    };
}

/**
 * Which bit each `Switch` feature holds, by the name a decoded bitmap gives it. Taken from the model
 * rather than listed here, so a feature the cluster gains is folded back rather than silently dropped
 * from the number this test hands the device.
 */
const FEATURE_BITS = new Map(
    SWITCH.features.map(feature => {
        const bit = feature.constraint.value;
        if (typeof bit !== "number") {
            throw new CertCheckFailedError(`Switch feature ${feature.name} names no bit`);
        }
        const title = feature.title ?? feature.name;
        return [`${title[0].toLowerCase()}${title.slice(1)}`, 1 << bit] as const;
    }),
);

/**
 * A switch attribute as a number. A feature map is a bitmap, and both adapters decode a bitmap through
 * the model into an object of named bits rather than the raw number, so the bits are folded back.
 */
async function readNumber(cx: CertStepContext, ref: CertNodeRef, endpoint: number, attribute: number) {
    const value = await cx.controllers.dut.node(ref).readAttribute({ endpoint, cluster: SWITCH_ID, attribute });
    if (typeof value === "number") {
        return value;
    }
    if (attribute === FEATURE_MAP && typeof value === "object" && value !== null) {
        const named = value as Record<string, unknown>;
        let bits = 0;
        for (const [name, bit] of FEATURE_BITS) {
            if (named[name]) {
                bits |= bit;
            }
        }
        return bits;
    }
    throw new CertCheckFailedError(`the TH answered with ${describeValue(value)}, which is not a number`);
}

/** Reads a switch attribute and records what the TH answered against what the plan requires. */
async function readAndCheck(
    cx: CertStepContext,
    ref: CertNodeRef,
    endpoint: number,
    attribute: number,
    accept: (value: number) => boolean,
    what: string,
) {
    const value = await readNumber(cx, ref, endpoint, attribute);
    record(
        cx,
        {
            type: "response",
            verdict: accept(value) ? "pass" : "fail",
            detail: `${what}: the TH answers ${value}`,
        },
        what,
    );
    if (!accept(value)) {
        throw new CertCheckFailedError(`${what}: the TH answers ${value}`);
    }
    return value;
}

/**
 * Reads `attribute` until it holds `expected`, and records what it last saw. A backchannel command
 * returning proves the device was told, not that it has acted: a chip app reads the command from its
 * pipe on its own thread, so the state a read finds immediately afterwards can still be the old one.
 */
async function readUntil(
    cx: CertStepContext,
    ref: CertNodeRef,
    endpoint: number,
    attribute: number,
    expected: number,
    what: string,
) {
    const deadline = Date.now() + EVENT_WAIT_MS;
    let value: number | undefined;
    let failure: unknown;
    for (;;) {
        try {
            value = await readNumber(cx, ref, endpoint, attribute);
            failure = undefined;
        } catch (e) {
            // A read whose answer does not come back is not an answer of the wrong value. chip-tool
            // delivers a live subscription's report in whatever command reply is open, and a read whose
            // own values were displaced by one reports nothing for its path — which this step's
            // repeated reads meet where a single read rarely did.
            value = undefined;
            failure = e;
        }

        if (value === expected || Date.now() >= deadline) {
            break;
        }
        await pause(READ_RETRY_MS);
    }

    const answer = failure === undefined ? `the TH answers ${value}` : `the read failed: ${failure}`;
    record(
        cx,
        {
            type: "response",
            verdict: value === expected ? "pass" : "fail",
            detail: `${what}: ${answer}`,
        },
        what,
    );
    if (value !== expected) {
        throw new CertCheckFailedError(`${what}: ${answer}`);
    }
}

/**
 * Subscribes to every event of the switch on `endpoint`, collecting what arrives for a later step.
 *
 * A subscription this test establishes stays established: nothing revokes the one an earlier step made,
 * and the adapters hand an event to every subscription whose path covers it. Collecting only what this
 * endpoint reports is what keeps two of them from counting the same event twice.
 */
async function subscribeToSwitch(cx: CertStepContext, ref: CertNodeRef, endpoint: number) {
    received.length = 0;
    await cx.controllers.dut.node(ref).subscribeEvents([{ endpoint, cluster: SWITCH_ID }], {
        minIntervalFloorSeconds: 0,
        maxIntervalCeilingSeconds: 30,
        urgent: true,
        onUpdate: event => {
            if (event.endpoint === endpoint) {
                received.push(event);
            }
        },
    });
    record(
        cx,
        { type: "response", verdict: "pass", detail: `subscribed to every Switch event on endpoint ${endpoint}` },
        "the DUT's event subscription",
    );
}

/** Waits until `predicate` holds over the events received so far, or the budget runs out. */
async function untilReceived(predicate: () => boolean): Promise<boolean> {
    const deadline = Date.now() + EVENT_WAIT_MS;
    while (Date.now() < deadline) {
        if (predicate()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return predicate();
}

/** One field of an event's payload, or `undefined` for an event that is absent or carries no such field. */
function fieldOf(entry: EventReadEntry | undefined, field: string): unknown {
    return typeof entry?.value === "object" && entry.value !== null
        ? (entry.value as Record<string, unknown>)[field]
        : undefined;
}

function eventsNamed(name: string, after = -1n): EventReadEntry[] {
    const id = eventId(name);
    return received.filter(entry => entry.event === id && entry.eventNumber > after);
}

/** Every switch event the DUT received above `after`, in the order the publisher numbered them. */
function eventsAfter(after: bigint): EventReadEntry[] {
    return received
        .filter(entry => entry.eventNumber > after)
        .sort((a, b) => (a.eventNumber < b.eventNumber ? -1 : a.eventNumber > b.eventNumber ? 1 : 0));
}

/** The `Switch` event an entry carries, by the name the cluster gives it. */
function nameOf(entry: EventReadEntry): string {
    return SWITCH.events.find(event => event.id === entry.event)?.name ?? `event ${entry.event}`;
}

/**
 * The highest event number the DUT has received once the subscription has gone quiet. A step counts only
 * the events above this, so events an earlier step provoked cannot stand in for the ones it asks for.
 *
 * The boundary comes from what arrived rather than from a read of the publisher's events: on chip-tool a
 * report that arrives while a read is in flight is folded into that read's reply, so a read taken here
 * can already carry the first event of the step that is about to run.
 */
async function quietEventBoundary(cx: CertStepContext): Promise<bigint> {
    const deadline = Date.now() + EVENT_WAIT_MS;
    let seen = -1;
    while (seen !== received.length && Date.now() < deadline) {
        seen = received.length;
        await pause(EVENT_QUIET_MS);
    }

    if (seen !== received.length) {
        // Events still arriving means the boundary cannot separate this step's from the previous one's,
        // so what the step goes on to count would say nothing about what it simulated.
        record(
            cx,
            {
                type: "response",
                verdict: "fail",
                detail: `events were still arriving after ${Duration.format(Millis(EVENT_WAIT_MS))}`,
            },
            "the previous step's events had all arrived",
        );
        throw new CertCheckFailedError("the DUT was still receiving events when this step began");
    }

    return received.reduce((highest, entry) => (entry.eventNumber > highest ? entry.eventNumber : highest), -1n);
}

/**
 * Commissions the TH, or reports the fabric it is already on. Both halves of the plan open with their
 * own commissioning step, gated on the switch that half is about, and a DUT that declares only one of
 * the two switches runs only that half's step — so neither may assume the other ran.
 */
async function commissionTh(cx: CertStepContext) {
    const existing = commissioned.get("dut");
    if (existing !== undefined) {
        record(
            cx,
            {
                type: "response",
                verdict: "pass",
                detail: `the DUT is on the TH's fabric as ${existing}, and one fabric carries both switches`,
            },
            "the DUT commissioned the TH",
        );
        return;
    }

    const th = cx.devices.th;
    const ref = await cx.controllers.dut.commission({
        passcode: th.commissioning.passcode,
        discriminator: th.commissioning.discriminator,
    });
    commissioned.set("dut", ref);
    record(
        cx,
        { type: "response", verdict: "pass", detail: `commissioned the TH as ${ref}` },
        "the DUT commissioned the TH",
    );
}

certTest("TC-SWTCH-3.2", {
    plan: "cluster/switch.adoc",
    pics: ["SWTCH.C", "MCORE.IDM.C.SubscribeEvent"],
    app: "all-clusters",
})
    .step(
        "0a",
        "Consistency check: at least one of LS and MS has to be supported",
        consistencyStep(
            pics => !declares(pics, PICS_LS) && !declares(pics, PICS_MS),
            "neither a latching nor a momentary switch",
        ),
        { expected: "The DUT declares support for a latching switch, a momentary switch, or both." },
    )
    .step(
        "0b",
        "Consistency check: when supporting MSR also MS must be supported",
        consistencyStep(
            pics => declares(pics, PICS_MSR) && !declares(pics, PICS_MS),
            "momentary switch release without a momentary switch",
        ),
        { expected: "The DUT does not declare momentary switch release without the momentary switch itself." },
    )
    .step(
        "0c",
        "Consistency check: when supporting MSL also MS must be supported",
        consistencyStep(
            pics => declares(pics, PICS_MSL) && !declares(pics, PICS_MS),
            "long press without a momentary switch",
        ),
        { expected: "The DUT does not declare long press without the momentary switch itself." },
    )
    .step(
        "0d",
        "Consistency check: when supporting MSL also MSR or AS must be supported",
        consistencyStep(
            pics => declares(pics, PICS_MSL) && !declares(pics, PICS_MSR) && !declares(pics, PICS_AS),
            "long press with neither momentary switch release nor an action switch",
        ),
        {
            expected:
                "The DUT does not declare long press without either momentary switch release or an action " +
                "switch. The plan's own rule here is that MSL requires MSR, which contradicts MSL's " +
                "conformance `[MS & (MSR | AS)]` (Application Clusters § 1.12.4) and the plan's own step 0h " +
                "and step 3b, so this step applies the conformance instead.",
        },
    )
    .step(
        "0e",
        "Consistency check: when supporting MSM also MS must be supported",
        consistencyStep(
            pics => declares(pics, PICS_MSM) && !declares(pics, PICS_MS),
            "multi press without a momentary switch",
        ),
        { expected: "The DUT does not declare multi press without the momentary switch itself." },
    )
    .step(
        "0f",
        "Consistency check: when supporting MSM also MSR or AS must be supported",
        consistencyStep(
            pics => declares(pics, PICS_MSM) && !declares(pics, PICS_MSR) && !declares(pics, PICS_AS),
            "multi press with neither momentary switch release nor an action switch",
        ),
        {
            expected:
                "The DUT does not declare multi press without either momentary switch release or an action " +
                "switch. As step 0d: MSM's conformance is `AS, [MS & MSR]`, so an action switch both permits " +
                "and requires it.",
        },
    )
    .step(
        "0g",
        "Consistency check: at least one of SwitchStatePolling and SwitchStateEventing must be supported",
        consistencyStep(
            pics => !declares(pics, PICS_POLLING) && !declares(pics, PICS_EVENTING),
            "neither polling nor eventing of switch state",
        ),
        { expected: "The DUT declares that it reads switch state, receives events for it, or both." },
    )
    .step(
        "0h",
        "Consistency check: when supporting MSR the AS must not be supported",
        consistencyStep(
            pics => declares(pics, PICS_MSR) && declares(pics, PICS_AS),
            "momentary switch release together with an action switch",
        ),
        { expected: "The DUT does not declare both momentary switch release and action switch." },
    )
    .step("1a", "Commission DUT to TH, and set it up so the switch state can be observed", commissionTh, {
        pics: PICS_LS,
        expected:
            "The DUT is on the TH's fabric and reads the switch's state from it, which is what this " +
            "controller observes it with — it presents no state of its own and controls no other device.",
    })
    .step(
        "1b",
        "DUT reads global attribute FeatureMap",
        commissioned.withRef("dut", async (cx, ref) => {
            await readAndCheck(
                cx,
                ref,
                LATCHING_ENDPOINT,
                FEATURE_MAP,
                value => value === LATCHING_FEATURE_MAP,
                "the latching switch's FeatureMap",
            );
        }),
        { pics: PICS_LS, expected: "TH provides value 1 (LS)." },
    )
    .step(
        "1c",
        "DUT reads attribute NumberOfPositions",
        commissioned.withRef("dut", async (cx, ref) => {
            await readAndCheck(
                cx,
                ref,
                LATCHING_ENDPOINT,
                NUMBER_OF_POSITIONS,
                value => value === POSITIONS,
                "the latching switch's NumberOfPositions",
            );
        }),
        { pics: PICS_LS, expected: "TH provides value 2." },
    )
    .step(
        "1d",
        "DUT sets up eventing (SwitchLatched) so it will receive events when the switch is operated",
        commissioned.withRef("dut", async (cx, ref) => subscribeToSwitch(cx, ref, LATCHING_ENDPOINT)),
        { pics: `${PICS_LS} & ${PICS_EVENTING}`, expected: "TH responds accordingly." },
    )
    .step(
        "2a",
        "TH simulates operation of the switch by changing CurrentPosition, and the DUT reads it regularly",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            for (let operation = 0; operation < OPERATIONS; operation++) {
                for (const position of [1, 0]) {
                    await th.backchannel({
                        name: "simulateLatchPosition",
                        endpointId: LATCHING_ENDPOINT,
                        positionId: position,
                    });
                    await readUntil(
                        cx,
                        ref,
                        LATCHING_ENDPOINT,
                        CURRENT_POSITION,
                        position,
                        `CurrentPosition after the switch was moved to ${position}`,
                    );
                }
            }
        }),
        {
            pics: `${PICS_LS} & ${PICS_POLLING}`,
            expected:
                "When the DUT reads CurrentPosition, the TH answers with the position it was moved to. This " +
                "controller reads the state rather than presenting it.",
        },
    )
    .step(
        "2b",
        "TH simulates operation of the switch, sending SwitchLatched on every change",
        commissioned.withRef("dut", async cx => {
            const th = cx.devices.th;
            const simulated = new Array<number>();
            const boundary = await quietEventBoundary(cx);
            for (let operation = 0; operation < OPERATIONS; operation++) {
                for (const position of [1, 0]) {
                    await th.backchannel({
                        name: "simulateLatchPosition",
                        endpointId: LATCHING_ENDPOINT,
                        positionId: position,
                    });
                    simulated.push(position);
                    await pause(BETWEEN_OPERATIONS_MS);
                }
            }

            const arrived = await untilReceived(
                () => eventsNamed("switchLatched", boundary).length >= simulated.length,
            );
            const latched = eventsNamed("switchLatched", boundary);
            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict: arrived ? "pass" : "fail",
                        detail: `${latched.length} of ${simulated.length} SwitchLatched events reached the DUT`,
                    }),
                    what: "the DUT received an event for every change",
                },
                {
                    check: () => {
                        const positions = latched.map(entry => fieldOf(entry, "newPosition"));
                        const matches =
                            positions.length === simulated.length &&
                            positions.every((position, index) => position === simulated[index]);
                        return {
                            type: "response",
                            verdict: matches ? "pass" : "fail",
                            detail:
                                `the events name positions ${describeValue(positions)}, ` +
                                `for the sequence ${describeValue(simulated)} the switch was moved through`,
                        };
                    },
                    what: "the events name the positions the switch moved to, in order",
                },
            ]);
        }),
        {
            pics: `${PICS_LS} & ${PICS_EVENTING}`,
            expected:
                "The DUT receives these events. This controller records them rather than presenting the state " +
                "or controlling another device.",
        },
    )
    .step("3a", "Commission DUT to TH, and set it up so the momentary switch's state can be observed", commissionTh, {
        pics: PICS_MS,
        expected:
            "The DUT is on the TH's fabric. It observes the switch by reading and subscribing, and presents " +
            "no state of its own.",
    })
    .step(
        "3b",
        "DUT reads global attribute FeatureMap",
        commissioned.withRef("dut", async (cx, ref) => {
            await readAndCheck(
                cx,
                ref,
                MOMENTARY_ENDPOINT,
                FEATURE_MAP,
                value => MOMENTARY_FEATURE_MAPS.includes(value),
                "the momentary switch's FeatureMap",
            );
        }),
        { pics: PICS_MS, expected: "TH provides value 0x1E (MS, MSR, MSL, MSM) or 0x3A (MS, MSL, MSM, AS)." },
    )
    .step(
        "3c",
        "DUT reads attribute NumberOfPositions",
        commissioned.withRef("dut", async (cx, ref) => {
            await readAndCheck(
                cx,
                ref,
                MOMENTARY_ENDPOINT,
                NUMBER_OF_POSITIONS,
                value => value === POSITIONS,
                "the momentary switch's NumberOfPositions",
            );
        }),
        { pics: PICS_MS, expected: "TH provides value 2." },
    )
    .step(
        "3d",
        "DUT subscribes to all switch events on the endpoint",
        commissioned.withRef("dut", async (cx, ref) => subscribeToSwitch(cx, ref, MOMENTARY_ENDPOINT)),
        { pics: `${PICS_MS} & ${PICS_EVENTING}`, expected: "TH responds accordingly." },
    )
    .step(
        "4a",
        "TH simulates operation of the momentary switch while the DUT reads CurrentPosition regularly",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            for (let operation = 0; operation < OPERATIONS; operation++) {
                for (const position of [1, 0]) {
                    await th.backchannel({
                        name: "simulateLatchPosition",
                        endpointId: MOMENTARY_ENDPOINT,
                        positionId: position,
                    });
                    await readUntil(
                        cx,
                        ref,
                        MOMENTARY_ENDPOINT,
                        CURRENT_POSITION,
                        position,
                        `CurrentPosition while the button was ${position === PRESSED_POSITION ? "pressed" : "released"}`,
                    );
                }
            }
        }),
        {
            pics: `${PICS_MS} & ${PICS_POLLING}`,
            expected:
                "The TH answers with the position the button is in. This controller reads the state rather than " +
                "presenting it.",
        },
    )
    .step("4b", "TH simulates a short press, sending InitialPress and ShortRelease", async () => {}, {
        pics: `${PICS_MS} & ${PICS_MSR} & ${PICS_EVENTING}`,
        notApplicable:
            "This controller declares the switch it observes, which is an action switch, and one never " +
            "generates the ShortRelease this step waits for (Application Clusters § 1.12.6.4). The plan " +
            "gates the step on the momentary switch alone, which its own step 3b contradicts by allowing " +
            "an action-switch TH; the release flag gates it here.",
    })
    .step(
        "4c",
        "TH simulates a long press, sending InitialPress, LongPress and LongRelease",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const featureMap = await readNumber(cx, ref, MOMENTARY_ENDPOINT, FEATURE_MAP);
            await idleSwitch(cx, MOMENTARY_ENDPOINT);
            const boundary = await quietEventBoundary(cx);
            await th.backchannel({
                name: "simulateLongPress",
                endpointId: MOMENTARY_ENDPOINT,
                buttonId: PRESSED_POSITION,
                longPressDelayMillis: LONG_PRESS_DELAY_MS,
                longPressDurationMillis: LONG_PRESS_DURATION_MS,
                featureMap,
            });

            const sequence = [
                { name: "initialPress", field: "newPosition" },
                { name: "longPress", field: "newPosition" },
                { name: "longRelease", field: "previousPosition" },
            ];
            const arrived = await untilReceived(() =>
                sequence.every(({ name }) => eventsNamed(name, boundary).length > 0),
            );
            const cycle = eventsAfter(boundary);

            recordAll(cx, [
                {
                    check: () => {
                        const expected = sequence.map(({ name }) => eventId(name));
                        return {
                            type: "response",
                            verdict:
                                cycle.length === expected.length &&
                                cycle.every((entry, index) => entry.event === expected[index])
                                    ? "pass"
                                    : "fail",
                            detail: `the DUT received ${describeValue(cycle.map(nameOf))}${
                                arrived ? "" : " within the wait"
                            }`,
                        };
                    },
                    what: "the DUT received the long-press cycle, once each and in order",
                },
                {
                    check: () => {
                        const positions = sequence.map(({ name, field }) =>
                            fieldOf(eventsNamed(name, boundary)[0], field),
                        );
                        return {
                            type: "response",
                            verdict: positions.every(position => position === PRESSED_POSITION) ? "pass" : "fail",
                            detail: `the events name positions ${describeValue(positions)}`,
                        };
                    },
                    what: "each event of the cycle names the button that was pressed",
                },
            ]);
        }),
        {
            pics: `${PICS_MS} & ${PICS_MSL} & ${PICS_EVENTING}`,
            expected:
                "The DUT receives InitialPress, LongPress and LongRelease. An action switch still reports " +
                "the long-press cycle in full (Application Clusters § 1.12.8.2). This controller records " +
                "the events rather than acting on them.",
        },
    )
    .step("4d", "TH simulates a multi press on a switch that is not an action switch", async () => {}, {
        pics: `${PICS_MS} & ${PICS_MSM} & !${PICS_AS} & ${PICS_EVENTING}`,
        notApplicable: "The TH's momentary switch is an action switch, which this step excludes.",
    })
    .step(
        "4f",
        "TH simulates a multi press on an action switch, sending InitialPress and MultiPressComplete",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const featureMap = await readNumber(cx, ref, MOMENTARY_ENDPOINT, FEATURE_MAP);
            const multiPressMax = await readNumber(cx, ref, MOMENTARY_ENDPOINT, MULTI_PRESS_MAX);
            await idleSwitch(cx, MOMENTARY_ENDPOINT);
            const boundary = await quietEventBoundary(cx);
            await th.backchannel({
                name: "simulateMultiPress",
                endpointId: MOMENTARY_ENDPOINT,
                buttonId: PRESSED_POSITION,
                multiPressPressedTimeMillis: PRESS_MS,
                multiPressReleasedTimeMillis: PRESS_MS,
                multiPressNumPresses: PRESSES,
                featureMap,
                multiPressMax,
            });

            const arrived = await untilReceived(() => eventsNamed("multiPressComplete", boundary).length > 0);
            const counted = fieldOf(eventsNamed("multiPressComplete", boundary)[0], "totalNumberOfPressesCounted");

            recordAll(cx, [
                {
                    check: () => {
                        const presses = eventsNamed("initialPress", boundary);
                        return {
                            type: "response",
                            verdict:
                                presses.length === 1 && fieldOf(presses[0], "newPosition") === PRESSED_POSITION
                                    ? "pass"
                                    : "fail",
                            detail:
                                `${presses.length} InitialPress events reached the DUT, naming positions ` +
                                describeValue(presses.map(press => fieldOf(press, "newPosition"))),
                        };
                    },
                    what: "the DUT received one press for the sequence, as an action switch reports it",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict: arrived && counted === PRESSES ? "pass" : "fail",
                        detail: `MultiPressComplete counted ${describeValue(counted)} presses`,
                    }),
                    what: "the DUT received the completed multi press, with the number of presses",
                },
            ]);
        }),
        {
            pics: `${PICS_MS} & ${PICS_MSM} & ${PICS_AS} & ${PICS_EVENTING}`,
            expected:
                "The DUT receives InitialPress and a MultiPressComplete naming two presses. This controller " +
                "records them rather than acting on them.",
        },
    )
    .finalize(cx => {
        received.length = 0;
        return commissioned.decommissionAll(cx);
    });
