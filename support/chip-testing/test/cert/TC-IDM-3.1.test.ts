/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { AttributePathSpec, CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import { CommissionedRefs, expectMessageWithPath, requireId, WRITE_REQUEST_MESSAGE } from "./tc-support.js";

const LEVEL_CONTROL = Matter.clusters.require("LevelControl");
const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const THERMOSTAT_USER_INTERFACE_CONFIGURATION = Matter.clusters.require("ThermostatUserInterfaceConfiguration");
const COLOR_CONTROL = Matter.clusters.require("ColorControl");

const LEVEL_CONTROL_ID = requireId(LEVEL_CONTROL.id, "LevelControl cluster");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const THERMOSTAT_USER_INTERFACE_CONFIGURATION_ID = requireId(
    THERMOSTAT_USER_INTERFACE_CONFIGURATION.id,
    "ThermostatUserInterfaceConfiguration cluster",
);
const COLOR_CONTROL_ID = requireId(COLOR_CONTROL.id, "ColorControl cluster");

const ON_LEVEL = LEVEL_CONTROL.attributes.require("onLevel");
const ON_OFF_TRANSITION_TIME = LEVEL_CONTROL.attributes.require("onOffTransitionTime");
const LOCAL_CONFIG_DISABLED = BASIC_INFORMATION.attributes.require("localConfigDisabled");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const TEMPERATURE_DISPLAY_MODE = THERMOSTAT_USER_INTERFACE_CONFIGURATION.attributes.require("temperatureDisplayMode");
const OPTIONS = COLOR_CONTROL.attributes.require("options");

const ENDPOINT_0 = 0;
const ENDPOINT_1 = 1;

/** `label` identifies this write in recorded evidence — the step number, or (for step 14's repeat)
 * the step number plus attempt, so three otherwise-identical writes remain distinguishable in
 * `result.json`. */
async function writeAndCheck(
    cx: CertStepContext,
    ref: CertNodeRef,
    label: string,
    path: AttributePathSpec,
    value: unknown,
): Promise<void> {
    const th = cx.devices.th;
    const from = th.log.mark();

    try {
        await cx.controllers.dut.node(ref).writeAttribute(path, value);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: `wrote ${JSON.stringify(value)} to ${JSON.stringify(path)}`,
    });

    const logCheck = await expectMessageWithPath(th.log, th.flavor, WRITE_REQUEST_MESSAGE, path, from, 15_000);
    cx.recorder.check(logCheck);
    if (logCheck.verdict === "fail") {
        throw new Error(`WriteRequestMessage log check failed for step ${label}: ${JSON.stringify(logCheck)}`);
    }
}

const commissioned = new CommissionedRefs();

certTest("TC-IDM-3.1", { plan: "interactiondatamodel.adoc", pics: ["MCORE.IDM.C.WriteRequest"], app: "all-clusters" })
    .step(
        1,
        "DUT sends the WriteRequestMessage to the TH to modify one attribute data",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            try {
                const path: AttributePathSpec = {
                    endpoint: ENDPOINT_1,
                    cluster: LEVEL_CONTROL_ID,
                    attribute: requireId(ON_LEVEL.id, "LevelControl.onLevel"),
                };
                await writeAndCheck(cx, ref, "1", path, 2);
            } catch (e) {
                await commissioned.decommissionAll(cx);
                throw e;
            }
        },
        { expected: "Verify on the TH that the correct WriteRequestMessage has been received." },
    )
    .step(
        2,
        "DUT sends the WriteRequestMessage to the TH to modify one attribute on all Endpoints. On receipt of " +
            "this message, TH should modify the attribute and send a WriteResponseMessage to the DUT.",
        async () => {},
        { notApplicable: "Out of Scope for V1.0 per the test plan (write one attribute across all endpoints)" },
    )
    .step(
        3,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type bool.",
        commissioned.guardedWithRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: requireId(LOCAL_CONFIG_DISABLED.id, "BasicInformation.localConfigDisabled"),
            };
            return writeAndCheck(cx, ref, "3", path, true);
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_Bool",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        4,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type string.",
        commissioned.guardedWithRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: requireId(NODE_LABEL.id, "BasicInformation.nodeLabel"),
            };
            return writeAndCheck(cx, ref, "4", path, "node");
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_String",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        5,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type unsigned integer.",
        commissioned.guardedWithRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: requireId(ON_OFF_TRANSITION_TIME.id, "LevelControl.onOffTransitionTime"),
            };
            return writeAndCheck(cx, ref, "5", path, 1);
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_UnsignedInteger",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        6,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type signed integer.",
        async () => {},
        { notApplicable: "CHIP's certification harness names no signed-integer attribute for this step" },
    )
    .step(
        7,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type floating point.",
        async () => {},
        { notApplicable: "CHIP's certification harness names no floating-point attribute for this step" },
    )
    .step(
        8,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type Octet String.",
        async () => {},
        { notApplicable: "CHIP's certification harness names no octet-string attribute for this step" },
    )
    .step(9, "DUT sends the WriteRequestMessage to the TH to write an attribute of data type Struct.", async () => {}, {
        notApplicable: "CHIP's certification harness names no struct attribute for this step",
    })
    .step(10, "DUT sends the WriteRequestMessage to the TH to write an attribute of data type List.", async () => {}, {
        notApplicable: "CHIP's certification harness names no list attribute for this step",
    })
    .step(
        11,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type enum.",
        commissioned.guardedWithRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: THERMOSTAT_USER_INTERFACE_CONFIGURATION_ID,
                attribute: requireId(
                    TEMPERATURE_DISPLAY_MODE.id,
                    "ThermostatUserInterfaceConfiguration.temperatureDisplayMode",
                ),
            };
            return writeAndCheck(cx, ref, "11", path, 1);
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_Enum",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        12,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type bitmap.",
        commissioned.guardedWithRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: COLOR_CONTROL_ID,
                attribute: requireId(OPTIONS.id, "ColorControl.options"),
            };
            return writeAndCheck(cx, ref, "12", path, 1);
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_Bitmap",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        13,
        "DUT sends a WriteRequestMessage to the TH with a large list of attribute data, which is larger than 1 " +
            "MTU(1280 bytes), that has to be sent in multiple messages.",
        async () => {},
        {
            notApplicable:
                "CHIP's certification harness shows only a 32-character NodeLabel write, which cannot exceed one MTU",
        },
    )
    .step(
        14,
        "DUT sends the WriteRequestMessage to the TH to write one attribute on a given cluster and endpoint. " +
            "Repeat the above steps 3 times.",
        commissioned.guardedWithRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: THERMOSTAT_USER_INTERFACE_CONFIGURATION_ID,
                attribute: requireId(
                    TEMPERATURE_DISPLAY_MODE.id,
                    "ThermostatUserInterfaceConfiguration.temperatureDisplayMode",
                ),
            };
            for (let attempt = 1; attempt <= 3; attempt++) {
                await writeAndCheck(cx, ref, `14 (attempt ${attempt})`, path, 1);
            }
            await commissioned.decommissionAll(cx);
        }),
        { expected: "Verify on the TH that the correct WriteRequestMessage has been received. for all the 3 times." },
    )
    .step(
        15,
        "DUT sends a ReadRequest message to the TH to read any attribute on two clusters. TH returns with a " +
            "report data action with the attribute values and the dataversions of the clusters. DUT sends a " +
            "WriteRequestMessage to the DUT to both the clusters with the appropriate dataversions(received in " +
            "the previous step) to modify the value of an attribute.",
        async () => {},
        { notApplicable: "Out of Scope per the test plan (data-version-conditional write)" },
    );
