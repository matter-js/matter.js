/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status } from "@matter/main/types";
import { Matter } from "@matter/model";
import type { AttributePathSpec, CertNodeApi, CertNodeRef, CertStepContext, DeviceFlavor } from "@matter/testing";
import { certTest } from "@matter/testing";
import { CommissionedRefs, expectMessageWithPath, record, requireId, WRITE_REQUEST_MESSAGE } from "./tc-support.js";

const LEVEL_CONTROL = Matter.clusters.require("LevelControl");
const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const THERMOSTAT_USER_INTERFACE_CONFIGURATION = Matter.clusters.require("ThermostatUserInterfaceConfiguration");
const COLOR_CONTROL = Matter.clusters.require("ColorControl");
const IDENTIFY = Matter.clusters.require("Identify");

const LEVEL_CONTROL_ID = requireId(LEVEL_CONTROL.id, "LevelControl cluster");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const THERMOSTAT_USER_INTERFACE_CONFIGURATION_ID = requireId(
    THERMOSTAT_USER_INTERFACE_CONFIGURATION.id,
    "ThermostatUserInterfaceConfiguration cluster",
);
const COLOR_CONTROL_ID = requireId(COLOR_CONTROL.id, "ColorControl cluster");
const IDENTIFY_ID = requireId(IDENTIFY.id, "Identify cluster");

const ON_LEVEL = LEVEL_CONTROL.attributes.require("onLevel");
const ON_OFF_TRANSITION_TIME = LEVEL_CONTROL.attributes.require("onOffTransitionTime");
const LOCAL_CONFIG_DISABLED = BASIC_INFORMATION.attributes.require("localConfigDisabled");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const TEMPERATURE_DISPLAY_MODE = THERMOSTAT_USER_INTERFACE_CONFIGURATION.attributes.require("temperatureDisplayMode");
const OPTIONS = COLOR_CONTROL.attributes.require("options");
const IDENTIFY_TIME = IDENTIFY.attributes.require("identifyTime");

/** Seconds the step-2 wildcard write puts into Identify.identifyTime on every endpoint that has it. */
const IDENTIFY_TIME_VALUE = 5;

/**
 * Step 2's wildcard-endpoint write is valid per Matter Core § 8.9.2.7, but the chip apps answer it
 * `InvalidAction` after failing to decode the path ("TLVReader.cpp:656: End of TLV"), so the step can
 * only run against a matter.js TH.
 */
const STEP_2_FLAVORS: DeviceFlavor[] = ["matterjs"];

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

/**
 * Data versions for `paths`' clusters, obtained from one ReadRequest carrying every path — the step's
 * procedure describes a single read of two clusters, so one request per cluster would be a different
 * interaction.
 */
async function clusterVersions(node: CertNodeApi, paths: AttributePathSpec[]): Promise<number[]> {
    const entries = await node.readAttributes(paths);
    return paths.map(({ endpoint, cluster }) => {
        const version = entries.find(
            entry => entry.endpoint === endpoint && entry.cluster === cluster && entry.version !== undefined,
        )?.version;
        if (version === undefined) {
            throw new Error(`TH reported no data version for cluster ${cluster} on endpoint ${endpoint}`);
        }
        return version;
    });
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

            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: requireId(ON_LEVEL.id, "LevelControl.onLevel"),
            };
            await writeAndCheck(cx, ref, "1", path, 2);
        },
        { expected: "Verify on the TH that the correct WriteRequestMessage has been received." },
    )
    .step(
        2,
        "DUT sends the WriteRequestMessage to the TH to modify one attribute on all Endpoints. On receipt of " +
            "this message, TH should modify the attribute and send a WriteResponseMessage to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;
            const path: AttributePathSpec = {
                cluster: IDENTIFY_ID,
                attribute: requireId(IDENTIFY_TIME.id, "Identify.identifyTime"),
            };
            const from = th.log.mark();

            const statuses = await dut.node(ref).writeAttributes([{ path, value: IDENTIFY_TIME_VALUE }]);
            const written = statuses.filter(({ status }) => status === Status.Success);
            cx.recorder.check({
                type: "response",
                verdict: written.length > 1 ? "pass" : "fail",
                detail:
                    `wrote ${IDENTIFY_TIME_VALUE} to Identify.identifyTime on ${written.length} endpoint(s): ` +
                    JSON.stringify(statuses),
            });
            if (written.length <= 1) {
                throw new Error(`A wildcard write must reach more than one endpoint, got ${JSON.stringify(statuses)}`);
            }

            const logCheck = await expectMessageWithPath(th.log, th.flavor, WRITE_REQUEST_MESSAGE, path, from, 15_000);
            cx.recorder.check(logCheck);
            if (logCheck.verdict === "fail") {
                throw new Error(`WriteRequestMessage log check failed for step 2: ${JSON.stringify(logCheck)}`);
            }

            for (const { endpoint } of written) {
                const value = await dut
                    .node(ref)
                    .readAttribute({ endpoint, cluster: IDENTIFY_ID, attribute: IDENTIFY_TIME.id });
                record(
                    cx,
                    {
                        type: "response",
                        // identifyTime counts down from the written value, so the device may already report less
                        verdict: typeof value === "number" ? "pass" : "fail",
                        detail: `endpoint ${endpoint} reports identifyTime=${JSON.stringify(value)}`,
                    },
                    `endpoint ${endpoint} identifyTime`,
                );
            }
        }),
        {
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
            flavors: STEP_2_FLAVORS,
        },
    )
    .step(
        3,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type bool.",
        commissioned.withRef("dut", (cx, ref) => {
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
        commissioned.withRef("dut", (cx, ref) => {
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
        commissioned.withRef("dut", (cx, ref) => {
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
        commissioned.withRef("dut", (cx, ref) => {
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
        commissioned.withRef("dut", (cx, ref) => {
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
        commissioned.withRef("dut", async (cx, ref) => {
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
        }),
        { expected: "Verify on the TH that the correct WriteRequestMessage has been received. for all the 3 times." },
    )
    .step(
        15,
        "DUT sends a ReadRequest message to the TH to read any attribute on two clusters. TH returns with a " +
            "report data action with the attribute values and the dataversions of the clusters. DUT sends a " +
            "WriteRequestMessage to the DUT to both the clusters with the appropriate dataversions(received in " +
            "the previous step) to modify the value of an attribute.",
        commissioned.withRef("dut", async (cx, ref) => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;
            const node = dut.node(ref);

            const labelPath: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: requireId(NODE_LABEL.id, "BasicInformation.nodeLabel"),
            };
            const levelPath: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: requireId(ON_LEVEL.id, "LevelControl.onLevel"),
            };

            const [labelVersion, levelVersion] = await clusterVersions(node, [labelPath, levelPath]);
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `data versions read: BasicInformation=${labelVersion}, LevelControl=${levelVersion}`,
            });

            const from = th.log.mark();
            const statuses = await node.writeAttributes([
                { path: labelPath, value: "tc-idm-3-1-step-15", dataVersion: labelVersion },
                { path: levelPath, value: 3, dataVersion: levelVersion },
            ]);
            const allSucceeded = statuses.length === 2 && statuses.every(({ status }) => status === Status.Success);
            cx.recorder.check({
                type: "response",
                verdict: allSucceeded ? "pass" : "fail",
                detail: `version-conditional write answered ${JSON.stringify(statuses)}`,
            });
            if (!allSucceeded) {
                throw new Error(`Version-conditional write was rejected: ${JSON.stringify(statuses)}`);
            }

            const logCheck = await expectMessageWithPath(
                th.log,
                th.flavor,
                WRITE_REQUEST_MESSAGE,
                labelPath,
                from,
                15_000,
            );
            cx.recorder.check(logCheck);
            if (logCheck.verdict === "fail") {
                throw new Error(`WriteRequestMessage log check failed for step 15: ${JSON.stringify(logCheck)}`);
            }

            const label = await node.readAttribute(labelPath);
            const level = await node.readAttribute(levelPath);
            const readBackOk = label === "tc-idm-3-1-step-15" && level === 3;
            cx.recorder.check({
                type: "response",
                verdict: readBackOk ? "pass" : "fail",
                detail: `read back nodeLabel=${JSON.stringify(label)}, onLevel=${JSON.stringify(level)}`,
            });
            if (!readBackOk) {
                throw new Error(`Write did not take effect: nodeLabel=${label}, onLevel=${level}`);
            }

            // The plan stops at the successful write, which a device ignoring the version would also pass.
            // Repeating it with the now-stale versions is the only evidence the version was honored.
            const stale = await node.writeAttributes([
                { path: labelPath, value: "tc-idm-3-1-stale", dataVersion: labelVersion },
            ]);
            const rejected = stale.length === 1 && stale[0].status === Status.DataVersionMismatch;
            cx.recorder.check({
                type: "response",
                verdict: rejected ? "pass" : "fail",
                detail: `write with the stale data version answered ${JSON.stringify(stale)}`,
            });
            if (!rejected) {
                throw new Error(`A stale data version was accepted: ${JSON.stringify(stale)}`);
            }
        }),
        {
            expected:
                "Verify that the TH sends a Write Response message with a success back to the DUT. Verify by " +
                "sending a ReadRequest that the Write Action on TH was successful.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
