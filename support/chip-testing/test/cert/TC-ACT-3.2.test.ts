/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertStepContext, SelectableDeviceFlavor } from "@matter/testing";
import { certTest } from "@matter/testing";
import { CommissionedRefs, invokeCommand, recordAll, requireId } from "./tc-support.js";

const ACTIONS = Matter.clusters.require("Actions");

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
const CHIP_FLAVORS: SelectableDeviceFlavor[] = ["chip-docker", "chip-local"];

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

const commissioned = new CommissionedRefs();

/**
 * Invokes `commandName` on the TH's Actions cluster and checks the TH's log for its `CommandDataIB`. Any status
 * the TH answers passes: the real chip-bridge-app accepts only `InstantAction` and refuses every other command
 * in this TC before its delegate sees it.
 */
async function invokeAndCheck(cx: CertStepContext, ref: string, commandName: string, fields: FieldSpec[]) {
    const args: Record<string, number> = {};
    for (const { propertyName, value } of fields) {
        args[propertyName] = value;
    }
    const { checks } = await invokeCommand(cx, ref, {
        cluster: ACTIONS,
        endpoint: ENDPOINT,
        command: commandName,
        args,
        fields: fields.map(({ propertyName, value }) => ({ id: fieldId(commandName, propertyName), value })),
        anyStatus: true,
    });
    await recordAll(cx, checks);
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

            await invokeAndCheck(cx, ref, "instantAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(1) },
            ]);
        },
        { pics: "ACT.C.C00.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        2,
        "DUT issues an StartAction command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "startAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(2) },
            ]),
        ),
        { pics: "ACT.C.C02.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        3,
        "DUT issues an StopAction command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "stopAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(3) },
            ]),
        ),
        { pics: "ACT.C.C04.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        4,
        "DUT issues an PauseAction command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "pauseAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(4) },
            ]),
        ),
        { pics: "ACT.C.C05.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        5,
        "DUT issues an ResumeAction command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "resumeAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(5) },
            ]),
        ),
        { pics: "ACT.C.C07.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        6,
        "DUT issues an EnableAction command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "enableAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(6) },
            ]),
        ),
        { pics: "ACT.C.C08.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        7,
        "DUT issues an DisableAction command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "disableAction", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(7) },
            ]),
        ),
        { pics: "ACT.C.C0a.Tx", expected: EXPECTED_ACTION_ID_AND_INVOKE_ID, flavors: CHIP_FLAVORS },
    )
    .step(
        8,
        "DUT issues an StartActionWithDuration command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "startActionWithDuration", [
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
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "pauseActionWithDuration", [
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
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "enableActionWithDuration", [
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
        commissioned.withRef("dut", (cx, ref) =>
            invokeAndCheck(cx, ref, "disableActionWithDuration", [
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
        commissioned.withRef("dut", async (cx, ref) => {
            await invokeAndCheck(cx, ref, "instantActionWithTransition", [
                { propertyName: "actionId", value: ACTION_ID },
                { propertyName: "invokeId", value: invokeIdFor(12) },
                { propertyName: "transitionTime", value: TRANSITION_TIME },
            ]);
        }),
        { pics: "ACT.C.C01.Tx", expected: EXPECTED_WITH_TRANSITION_TIME, flavors: CHIP_FLAVORS },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
