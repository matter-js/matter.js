/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertNodeApi, CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue } from "./tc-support.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    expectCommandInvoke,
    LOG_TIMEOUT,
    record,
    requireId,
} from "./tc-support.js";

const LEVEL_CONTROL = Matter.clusters.require("LevelControl");
const LEVEL_CONTROL_ID = requireId(LEVEL_CONTROL.id, "LevelControl cluster");

/** Both THs put their LevelControl on the on/off light at endpoint 1. */
const ENDPOINT = 1;

/** `FeatureMap` bit for Lighting (LT), which fixes what the level bounds may be. */
const LIGHTING_FEATURE = 1 << 1;

/** The Lighting bit's name in the decoded feature map, which both adapters render through the model. */
const LIGHTING_PROPERTY = "lighting";

/** `CurrentLevel`'s own ceiling (Matter Application Clusters § 1.6.4.2). */
const MAX_LEVEL_CEILING = 254;

/** What a Lighting device's bounds are required to be (§ 1.6.6.4, § 1.6.6.5). */
const LIGHTING_MIN_LEVEL = 1;
const LIGHTING_MAX_LEVEL = 254;

/** Immediate, so a step reading the level back is not racing a transition. */
const NO_TRANSITION = 0;

const MOVE_RATE = 20;
const STEP_SIZE = 10;

const MOVE_MODE_UP = 0;
const STEP_MODE_DOWN = 1;

const commissioned = new CommissionedRefs();

function commandId(commandName: string): number {
    return requireId(LEVEL_CONTROL.commands.require(commandName).id, `LevelControl.${commandName}`);
}

function attributeId(attributeName: string): number {
    return requireId(LEVEL_CONTROL.attributes.require(attributeName).id, `LevelControl.${attributeName}`);
}

async function readNumber(node: CertNodeApi, attributeName: string): Promise<number> {
    const value = await node.readAttribute({
        endpoint: ENDPOINT,
        cluster: LEVEL_CONTROL_ID,
        attribute: attributeId(attributeName),
    });
    if (typeof value !== "number") {
        throw new CertCheckFailedError(`TH answered ${attributeName} with ${JSON.stringify(value)}, not a number`);
    }
    return value;
}

/**
 * Whether the TH's LevelControl has the Lighting feature. A feature map is a bitmap, and both adapters
 * decode a bitmap through the model into an object of named bits rather than the raw number.
 */
async function readsLighting(node: CertNodeApi): Promise<boolean> {
    const value = await node.readAttribute({
        endpoint: ENDPOINT,
        cluster: LEVEL_CONTROL_ID,
        attribute: attributeId("featureMap"),
    });
    if (typeof value === "number") {
        return (value & LIGHTING_FEATURE) !== 0;
    }
    if (typeof value === "object" && value !== null && LIGHTING_PROPERTY in value) {
        return Boolean(value[LIGHTING_PROPERTY]);
    }
    throw new CertCheckFailedError(`TH answered FeatureMap with ${JSON.stringify(value)}, which names no features`);
}

/** The levels the TH says it accepts, and whether it must obey the Lighting bounds. */
interface LevelBounds {
    min: number;
    max: number;
    lighting: boolean;
}

/**
 * This TC's TH is one that "exposes a Level Control server with all optional attributes and commands
 * supported" (the plan's own Required Devices row), so `MinLevel`/`MaxLevel` — optional in general —
 * are required here, and a TH without them fails the precondition rather than falling back to a
 * constant. Which is also what keeps the bounds below the DUT's own, rather than this file's.
 */
async function readLevelBounds(node: CertNodeApi): Promise<LevelBounds> {
    return {
        min: await readNumber(node, "minLevel"),
        max: await readNumber(node, "maxLevel"),
        lighting: await readsLighting(node),
    };
}

/**
 * Whether `bounds` are ones a conforming TH may report. `MinLevel` is `max 254` and `MaxLevel` is
 * `minLevel to 254`, so 0 is a legal minimum for a device without Lighting; with Lighting the spec
 * fixes both (§ 1.6.6.4, § 1.6.6.5), which is the only part of this a TH can get wrong while still
 * answering.
 */
function boundsConform({ min, max, lighting }: LevelBounds): string | undefined {
    if (min > max || max > MAX_LEVEL_CEILING) {
        return `${min}-${max} is not a range CurrentLevel can take`;
    }
    if (lighting && (min !== LIGHTING_MIN_LEVEL || max !== LIGHTING_MAX_LEVEL)) {
        return `a Lighting device reports ${LIGHTING_MIN_LEVEL}-${LIGHTING_MAX_LEVEL}, not ${min}-${max}`;
    }
    return undefined;
}

/**
 * A level within the bounds the TH reported that the TH is not already sitting at, so the read-back
 * after the command shows a level the TH moved to rather than one it happened to hold. `CurrentLevel`
 * is persistent on the chip TH, so its starting value is whatever an earlier run left.
 */
function levelOtherThan(current: number | null, { min, max }: LevelBounds): number {
    const midpoint = min + Math.floor((max - min) / 2);
    if (midpoint !== current) {
        return midpoint;
    }
    return midpoint === max ? min : midpoint + 1;
}

/**
 * Invokes `commandName` on the TH's LevelControl cluster and verifies the TH's log recorded the
 * command with the field values the step sent.
 *
 * `optionsMask`/`optionsOverride` are sent because the commands require them, but are not among the
 * checked fields: they are bitmaps, which the two logs render differently from a plain integer.
 */
async function invokeAndCheck(
    cx: CertStepContext,
    ref: CertNodeRef,
    commandName: string,
    args: Record<string, unknown>,
    fields: CommandFieldValue[],
): Promise<void> {
    const th = cx.devices.th;
    const from = th.log.mark();

    try {
        await cx.controllers.dut
            .node(ref)
            .invoke("LevelControl", commandName, { ...args, optionsMask: {}, optionsOverride: {} }, ENDPOINT);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
    cx.recorder.check({ type: "response", verdict: "pass", detail: `${commandName} status=Success` });

    const logCheck = await expectCommandInvoke(
        th.log,
        th.flavor,
        ENDPOINT,
        LEVEL_CONTROL_ID,
        commandId(commandName),
        fields,
        from,
        LOG_TIMEOUT,
    );
    record(cx, logCheck, `CommandDataIB log for LevelControl.${commandName}`);
}

let bounds: LevelBounds | undefined;

certTest("TC-LVL-8.1", { plan: "levelcontrol.adoc", pics: ["LVL.C"], app: "all-clusters" })
    .step(
        "0",
        "Precondition: the DUT commissions the TH and reads the levels the TH says it accepts.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const read = await readLevelBounds(dut.node(ref));
            bounds = read;

            const nonConformance = boundsConform(read);
            record(
                cx,
                {
                    type: "response",
                    verdict: nonConformance === undefined ? "pass" : "fail",
                    detail:
                        nonConformance === undefined
                            ? `TH accepts levels ${read.min}-${read.max}${read.lighting ? " (Lighting)" : ""}`
                            : nonConformance,
                },
                "the level range the DUT's commands must stay within",
            );
        },
        {
            expected:
                "The TH reports the levels it accepts, and reports bounds a conforming device may have. The level " +
                "the next step commands comes from these, so a level outside what the TH accepts cannot be sent.",
        },
    )
    .step(
        1,
        "TH prompts the operator to make the DUT send one or more supported commands from the Level Control cluster",
        commissioned.withRef("dut", async (cx, ref) => {
            // The DUT of this suite is a controller the test drives, so the plan's operator prompt is
            // the step itself: it makes the DUT send each command, and the TH's log is the evidence.
            if (bounds === undefined) {
                throw new CertCheckFailedError("step 0 did not read the TH's level bounds");
            }

            const node = cx.controllers.dut.node(ref);
            const before = await node.readAttribute({
                endpoint: ENDPOINT,
                cluster: LEVEL_CONTROL_ID,
                attribute: attributeId("currentLevel"),
            });
            const level = levelOtherThan(typeof before === "number" ? before : null, bounds);

            // WithOnOff, so the TH is on and the level it reports afterward is the one just commanded;
            // a command without it reaching a TH that is off has no effect unless the Options bits say
            // otherwise (Matter Application Clusters § 1.6.4.1.3, § 1.6.6.9).
            await invokeAndCheck(cx, ref, "moveToLevelWithOnOff", { level, transitionTime: NO_TRANSITION }, [
                { id: 0, value: level },
                { id: 1, value: NO_TRANSITION },
            ]);

            const reported = await readNumber(node, "currentLevel");
            record(
                cx,
                {
                    type: "response",
                    verdict: reported === level ? "pass" : "fail",
                    detail: `CurrentLevel ${JSON.stringify(before)} -> ${reported}, commanded ${level}`,
                },
                "the TH moved to the level the DUT commanded",
            );

            await invokeAndCheck(cx, ref, "move", { moveMode: MOVE_MODE_UP, rate: MOVE_RATE }, [
                { id: 0, value: MOVE_MODE_UP },
                { id: 1, value: MOVE_RATE },
            ]);

            await invokeAndCheck(cx, ref, "stop", {}, []);

            await invokeAndCheck(
                cx,
                ref,
                "step",
                { stepMode: STEP_MODE_DOWN, stepSize: STEP_SIZE, transitionTime: NO_TRANSITION },
                [
                    { id: 0, value: STEP_MODE_DOWN },
                    { id: 1, value: STEP_SIZE },
                    { id: 2, value: NO_TRANSITION },
                ],
            );
        }),
        {
            expected:
                "DUT transmits correctly formed commands in any order and with application achievable values which " +
                "are within the limits allowed by the specification and consistent with the attribute values " +
                "reported by the TH. Verify this using the TH log of these messages.",
        },
    )
    .finalize(cx => {
        bounds = undefined;
        return commissioned.decommissionAll(cx);
    });
