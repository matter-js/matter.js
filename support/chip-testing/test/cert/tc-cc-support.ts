/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext } from "@matter/testing";
import { bitsOf } from "./tc-command-payload.js";
import { commissionThStep } from "./tc-dd-support.js";
import type { CommandPayload, RecordedCheck } from "./tc-support.js";
import {
    attempt,
    chipCommandField,
    CommissionedRefs,
    describeValue,
    expectAttributePathIB,
    LOG_TIMEOUT,
    MATTERJS_NO_PAYLOAD,
    record,
    recordAll,
    requireId,
    sendCommand,
    SIGNED_TYPES,
    theTh,
} from "./tc-support.js";

export const COLOR_CONTROL = Matter.clusters.require("ColorControl");

const COLOR_CONTROL_ID = requireId(COLOR_CONTROL.id, "ColorControl cluster");

const ON_OFF = Matter.clusters.require("OnOff");

/** Both THs put ColorControl on the light at endpoint 1. */
export const COLOR_CONTROL_ENDPOINT = 1;

/** A ColorControl feature as a decoded FeatureMap names it. */
export type ColorControlFeature = "hueSaturation" | "enhancedHue" | "colorLoop" | "xy" | "colorTemperature";

/**
 * A command argument by field name. A bitmap is an object of the bits that are set; the options bitmaps may be left
 * out and are then sent with no bit set.
 */
export type ColorCommandArgs = Record<string, number | Record<string, boolean>>;

function attributeId(name: string) {
    return requireId(COLOR_CONTROL.attributes.require(name).id, `ColorControl.${name}`);
}

/**
 * The TH-log payload of `command` sent with `args`, built from the command's model so both renderings name every
 * field in order: chip's decoded lines (a bitmap as its number, a signed integer as `(signed)`) and matter.js's
 * `name: value` text (a bitmap as an object listing every bit).
 */
function payloadOf(command: string, args: ColorCommandArgs): { args: ColorCommandArgs; payload: CommandPayload } {
    const model = COLOR_CONTROL.commands.require(command);
    const sent: ColorCommandArgs = {};
    const chip = new Array<RegExp>();
    const matterjs = new Array<string>();
    for (const field of model.children) {
        const id = requireId(field.id, `ColorControl.${command}.${field.name}`);
        const name = camelize(field.name);
        const value = args[name];
        if (field.effectiveMetatype === "bitmap") {
            if (typeof value === "number") {
                throw new InternalError(`ColorControl.${command} takes ${name} as an object of set bits, not a number`);
            }
            const set = value ?? {};
            const bits = bitsOf(field);
            sent[name] = set;
            chip.push(
                chipCommandField({
                    id,
                    value: bits.reduce((sum, { name, bit }) => sum + (set[name] ? 1 << bit : 0), 0),
                }),
            );
            matterjs.push(`${name}: { ${bits.map(({ name }) => `${name}: ${set[name] === true}`).join(", ")} }`);
            continue;
        }
        if (typeof value !== "number") {
            throw new InternalError(`ColorControl.${command} needs a number for ${name}`);
        }
        sent[name] = value;
        chip.push(chipCommandField({ id, value, signed: SIGNED_TYPES.has(field.primitiveBase?.name ?? "") }));
        matterjs.push(`${name}: ${value}`);
    }
    return {
        args: sent,
        payload: {
            label: `${model.name} carries exactly ${describeValue(sent)}`,
            chip,
            matterjs: matterjs.length ? matterjs.join(" ") : MATTERJS_NO_PAYLOAD,
        },
    };
}

/** The feature names a decoded or raw FeatureMap sets. */
function featureNames(featureMap: unknown): ReadonlySet<string> | undefined {
    if (typeof featureMap === "number") {
        return new Set(
            COLOR_CONTROL.features
                .filter(
                    ({ constraint }) => typeof constraint.value === "number" && featureMap & (1 << constraint.value),
                )
                .map(feature => camelize(feature.title ?? feature.name)),
        );
    }
    if (typeof featureMap === "object" && featureMap !== null) {
        return new Set(
            Object.entries(featureMap)
                .filter(([, set]) => set === true)
                .map(([name]) => name),
        );
    }
    return undefined;
}

/**
 * The plan's test setup: the DUT commissions the TH and sets its OnOff to On, and the TH's ColorControl has every
 * feature in `features`, which the plan's precondition names for the DUT's client.
 */
export function colorControlPreconditions(
    commissioned: CommissionedRefs,
    features: ColorControlFeature[],
): (cx: CertStepContext) => Promise<void> {
    const commission = commissionThStep(commissioned);
    return async cx => {
        await commission(cx);
        const ref = commissioned.require("dut");

        const read = await attempt(
            () =>
                cx.controllers.dut.node(ref).readAttribute({
                    endpoint: COLOR_CONTROL_ENDPOINT,
                    cluster: COLOR_CONTROL_ID,
                    attribute: attributeId("featureMap"),
                }),
            value => `FeatureMap=${describeValue(value)}`,
        );
        if (!read.ok) {
            record(cx, read.check, "ColorControl FeatureMap read");
            return;
        }
        const names = featureNames(read.value);
        const missing = features.filter(feature => !names?.has(feature));
        record(
            cx,
            {
                type: "response",
                verdict: names !== undefined && missing.length === 0 ? "pass" : "fail",
                detail:
                    names === undefined
                        ? `FeatureMap is ${describeValue(read.value)}, which names no features`
                        : missing.length
                          ? `FeatureMap=${describeValue(read.value)} lacks ${missing.join(", ")}`
                          : `FeatureMap=${describeValue(read.value)}`,
            },
            "the TH's ColorControl features",
        );

        await sendCommand(
            cx,
            ref,
            { cluster: ON_OFF, endpoint: COLOR_CONTROL_ENDPOINT, command: "on", args: {} },
            { label: "On carries no fields", chip: [], matterjs: MATTERJS_NO_PAYLOAD },
        );
    };
}

/** A step in which the DUT sends `command` with `args` and the TH's log shows exactly that payload. */
export function sendsColorCommand(
    commissioned: CommissionedRefs,
    command: string,
    args: ColorCommandArgs | (() => ColorCommandArgs) = {},
): (cx: CertStepContext) => Promise<void> {
    return commissioned.withRef("dut", (cx, ref) => {
        const built = payloadOf(command, typeof args === "function" ? args() : args);
        return sendCommand(
            cx,
            ref,
            { cluster: COLOR_CONTROL, endpoint: COLOR_CONTROL_ENDPOINT, command, args: built.args },
            built.payload,
        );
    });
}

/** The DUT reads `attribute` once; returns the value and the checks that it answered and the TH logged the read. */
export async function readColorAttribute(
    cx: CertStepContext,
    ref: CertNodeRef,
    attribute: string,
): Promise<{ value?: unknown; checks: RecordedCheck[] }> {
    const th = theTh(cx);
    const from = await th.log.markSettled();
    const path = { endpoint: COLOR_CONTROL_ENDPOINT, cluster: COLOR_CONTROL_ID, attribute: attributeId(attribute) };
    const read = await attempt(
        () => cx.controllers.dut.node(ref).readAttribute(path),
        value => `${attribute}=${describeValue(value)}`,
    );
    const logged = await expectAttributePathIB(th.log, th.flavor, path, from, LOG_TIMEOUT);
    return {
        value: read.ok ? read.value : undefined,
        checks: [
            { what: `the DUT's read of ${attribute}`, check: () => read.check },
            { what: `the TH received the read of ${attribute}`, check: () => logged },
        ],
    };
}

/** A step in which the DUT reads each of `attributes` and the TH's log shows each read. */
export function readsColorAttributes(
    commissioned: CommissionedRefs,
    ...attributes: string[]
): (cx: CertStepContext) => Promise<void> {
    return commissioned.withRef("dut", async (cx, ref) => {
        const checks = new Array<RecordedCheck>();
        for (const attribute of attributes) {
            checks.push(...(await readColorAttribute(cx, ref, attribute)).checks);
        }
        await recordAll(cx, checks);
    });
}
