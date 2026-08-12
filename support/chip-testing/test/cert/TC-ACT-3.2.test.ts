/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status, StatusResponseError, ValidationError } from "@matter/main/types";
import { Matter } from "@matter/model";
import type { CertStepContext, DeviceFlavor } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue } from "./tc-support.js";
import { CommissionedRefs, expectCommandInvoke, requireId } from "./tc-support.js";

const ACTIONS = Matter.clusters.require("Actions");

const ACTIONS_ID = requireId(ACTIONS.id, "Actions cluster");
const ENDPOINT = 1;
const ACTION_ID = 0x1001;

// Deliberately larger than a uint16 (max 65_535): the adoc's own expected-outcome text for steps 8-11
// calls Duration "a valid uint16", but both the spec and the model (Actions.element.ts) declare the
// Duration field uint32. A value only a uint32 can carry makes the mismatch visible in the captured
// log rather than merely asserted.
const DURATION = 100_000;
const TRANSITION_TIME = 1_234;

// Only chip-docker/chip-local run a real chip-bridge-app TH; matter.js's own BridgeTestInstance has no
// Actions cluster support (see AGENTS.md's "device-flavor capability gaps" section).
const CHIP_FLAVORS: DeviceFlavor[] = ["chip-docker", "chip-local"];

function invokeIdFor(step: number): number {
    return 700_000 + step;
}

interface FieldSpec {
    propertyName: string;
    value: number;
}

function fieldId(commandName: string, propertyName: string): number {
    const field = ACTIONS.commands.require(commandName).fields.require(propertyName);
    return requireId(field.id, `Actions.${commandName}.${propertyName}`);
}

/**
 * Records the invoke's outcome as evidence; per the brief, any status the TH returns is tolerated — the
 * real chip-bridge-app only accepts `InstantAction` (returns `Success`); every other command in this TC
 * fails with `UnsupportedCommand` before ever reaching its delegate.
 *
 * `ValidationError` (and its subclasses) is deliberately excluded even though it's also a
 * `StatusResponseError` — it's the client's own TLV encode-time rejection of `request` before anything
 * goes on the wire (e.g. a value out of range for the field's type), not something the TH answered.
 * Tolerating it here would record a passing "response" check for a command that was never sent.
 */
async function recordInvokeStatus(cx: CertStepContext, invoke: Promise<unknown>): Promise<void> {
    try {
        await invoke;
        cx.recorder.check({ type: "response", verdict: "pass", detail: "status=Success" });
    } catch (e) {
        if (e instanceof ValidationError || !(e instanceof StatusResponseError)) {
            throw e;
        }
        cx.recorder.check({
            type: "response",
            verdict: "pass",
            detail: `status=${Status[e.code] ?? e.code} (${e.bareMessage})`,
        });
    }
}

const commissioned = new CommissionedRefs();

/** Invokes `commandName` on the TH's Actions cluster with `fields`, then verifies TH's log captured
 * the matching `CommandPathIB`/`CommandFields`. */
async function invokeAndCheck(
    cx: CertStepContext,
    ref: string,
    step: number,
    commandName: string,
    fields: FieldSpec[],
): Promise<void> {
    const th = cx.devices.th;
    const from = th.log.mark();

    const args: Record<string, number> = {};
    for (const { propertyName, value } of fields) {
        args[propertyName] = value;
    }

    const invoke = cx.controllers.dut.node(ref).invoke("Actions", commandName, args, ENDPOINT);
    await recordInvokeStatus(cx, invoke);

    const commandId = requireId(ACTIONS.commands.require(commandName).id, `Actions.${commandName}`);
    const fieldValues: CommandFieldValue[] = fields.map(({ propertyName, value }) => ({
        id: fieldId(commandName, propertyName),
        value,
    }));
    const logCheck = await expectCommandInvoke(
        th.log,
        th.flavor,
        ENDPOINT,
        ACTIONS_ID,
        commandId,
        fieldValues,
        from,
        15_000,
    );
    cx.recorder.check(logCheck);
    if (logCheck.verdict === "fail") {
        throw new Error(
            `CommandDataIB log check failed for step ${step} (${commandName}): ${JSON.stringify(logCheck)}`,
        );
    }
}

const EXPECTED_ACTION_ID_AND_INVOKE_ID =
    "TH verifies the parameters of this command are correct: ActionID contains a uint16 with valid " +
    "0x1001, if InvokeID is provided, it is a uint32.";
const EXPECTED_WITH_DURATION = `${EXPECTED_ACTION_ID_AND_INVOKE_ID} Duration contains a valid uint16.`;
const EXPECTED_WITH_TRANSITION_TIME = `${EXPECTED_ACTION_ID_AND_INVOKE_ID} TransitionTime contains a valid uint16.`;

certTest("TC-ACT-3.2", { plan: "actions.adoc", pics: ["ACT.C"], app: "bridge" })
    .step(
        1,
        "DUT issues an InstantAction command to TH",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            try {
                await invokeAndCheck(cx, ref, 1, "instantAction", [
                    { propertyName: "actionId", value: ACTION_ID },
                    { propertyName: "invokeId", value: invokeIdFor(1) },
                ]);
            } catch (e) {
                await commissioned.decommissionAll(cx);
                throw e;
            }
        },
        { pics: "ACT.C.C00.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        2,
        "DUT issues an StartAction command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 2, "startAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(2) },
            ]),
        ),
        { pics: "ACT.C.C02.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        3,
        "DUT issues an StopAction command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 3, "stopAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(3) },
            ]),
        ),
        { pics: "ACT.C.C04.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        4,
        "DUT issues an PauseAction command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 4, "pauseAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(4) },
            ]),
        ),
        { pics: "ACT.C.C05.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        5,
        "DUT issues an ResumeAction command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 5, "resumeAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(5) },
            ]),
        ),
        { pics: "ACT.C.C07.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        6,
        "DUT issues an EnableAction command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 6, "enableAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(6) },
            ]),
        ),
        { pics: "ACT.C.C08.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        7,
        "DUT issues an DisableAction command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 7, "disableAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(7) },
            ]),
        ),
        { pics: "ACT.C.C0a.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        8,
        "DUT issues an StartActionWithDuration command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 8, "startActionWithDuration", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(8) },
                { propertyName: "duration", value: DURATION },
            ]),
        ),
        { pics: "ACT.C.C03.Tx", expected: EXPECTED_WITH_DURATION, flavors: CHIP_FLAVORS },
    )
    .step(
        9,
        "DUT issues an PauseActionWithDuration command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 9, "pauseActionWithDuration", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(9) },
                { propertyName: "duration", value: DURATION },
            ]),
        ),
        { pics: "ACT.C.C06.Tx", expected: EXPECTED_WITH_DURATION, flavors: CHIP_FLAVORS },
    )
    .step(
        10,
        "DUT issues an EnableActionWithDuration command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 10, "enableActionWithDuration", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(10) },
                { propertyName: "duration", value: DURATION },
            ]),
        ),
        { pics: "ACT.C.C09.Tx", expected: EXPECTED_WITH_DURATION, flavors: CHIP_FLAVORS },
    )
    .step(
        11,
        "DUT issues an DisableActionWithDuration command to TH",
        commissioned.guardedWithRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, 11, "disableActionWithDuration", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(11) },
                { propertyName: "duration", value: DURATION },
            ]),
        ),
        { pics: "ACT.C.C0b.Tx", expected: EXPECTED_WITH_DURATION, flavors: CHIP_FLAVORS },
    )
    .step(
        12,
        "DUT issues an InstantActionWithTransition command to TH",
        commissioned.guardedWithRef("dut", async (cx, ref) => {
            await invokeAndCheck(cx, ref, 12, "instantActionWithTransition", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(12) },
                { propertyName: "transitionTime", value: TRANSITION_TIME },
            ]);
            await commissioned.decommissionAll(cx);
        }),
        { pics: "ACT.C.C01.Tx", expected: EXPECTED_WITH_TRANSITION_TIME, flavors: CHIP_FLAVORS },
    );
