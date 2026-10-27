/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Schema } from "@matter/main/model";
import { Status } from "@matter/main/types";
import { Matter } from "@matter/model";
import type {
    AttributePathSpec,
    AttributeWriteStatus,
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    SelectableDeviceFlavor,
} from "@matter/testing";
import { certTest } from "@matter/testing";
import { registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import { SimpleStruct, UnitTestingCluster } from "../../src/cert/unit-testing-cluster.js";
import { chunkedWriteNotApplicable, expectChunkedWrite } from "./tc-idm-3.1-support.js";
import type { RecordedCheck } from "./tc-support.js";
import {
    attempt,
    CertCheckFailedError,
    CommissionedRefs,
    expectMessageWithPath,
    LOG_TIMEOUT,
    requireId,
    withChecks,
} from "./tc-support.js";
import { LONG_OCTET_STRING_ENTRY, UNIT_TESTING_ENDPOINT, unitTestingNotApplicable } from "./unit-testing-cluster.js";

const LEVEL_CONTROL = Matter.clusters.require("LevelControl");
const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const THERMOSTAT_USER_INTERFACE_CONFIGURATION = Matter.clusters.require("ThermostatUserInterfaceConfiguration");
const COLOR_CONTROL = Matter.clusters.require("ColorControl");
const IDENTIFY = Matter.clusters.require("Identify");
const THERMOSTAT = Matter.clusters.require("Thermostat");
const USER_LABEL = Matter.clusters.require("UserLabel");

const LEVEL_CONTROL_ID = requireId(LEVEL_CONTROL.id, "LevelControl cluster");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const THERMOSTAT_USER_INTERFACE_CONFIGURATION_ID = requireId(
    THERMOSTAT_USER_INTERFACE_CONFIGURATION.id,
    "ThermostatUserInterfaceConfiguration cluster",
);
const COLOR_CONTROL_ID = requireId(COLOR_CONTROL.id, "ColorControl cluster");
const IDENTIFY_ID = requireId(IDENTIFY.id, "Identify cluster");
const THERMOSTAT_ID = requireId(THERMOSTAT.id, "Thermostat cluster");
const USER_LABEL_ID = requireId(USER_LABEL.id, "UserLabel cluster");

const ON_LEVEL = LEVEL_CONTROL.attributes.require("onLevel");
const ON_OFF_TRANSITION_TIME = LEVEL_CONTROL.attributes.require("onOffTransitionTime");
const LOCAL_CONFIG_DISABLED = BASIC_INFORMATION.attributes.require("localConfigDisabled");
const NODE_LABEL = BASIC_INFORMATION.attributes.require("nodeLabel");
const TEMPERATURE_DISPLAY_MODE = THERMOSTAT_USER_INTERFACE_CONFIGURATION.attributes.require("temperatureDisplayMode");
const OPTIONS = COLOR_CONTROL.attributes.require("options");
const IDENTIFY_TIME = IDENTIFY.attributes.require("identifyTime");
const LOCAL_TEMPERATURE_CALIBRATION = THERMOSTAT.attributes.require("localTemperatureCalibration");
const LABEL_LIST = USER_LABEL.attributes.require("labelList");

const UNIT_TESTING = registerCertCustomCluster(UnitTestingCluster);
const UNIT_TESTING_ID = requireId(UNIT_TESTING.id, "UnitTesting cluster");

function unitTestingPath(name: string): AttributePathSpec {
    return {
        endpoint: UNIT_TESTING_ENDPOINT,
        cluster: UNIT_TESTING_ID,
        attribute: requireId(UNIT_TESTING.attributes.require(name).id, `UnitTesting.${name}`),
    };
}

const FLOAT_VALUE = 1.5;
const OCTET_STRING_VALUE = Bytes.fromHex("0102a55aff");
const STRUCT_VALUE = { a: 7, b: true, c: 2, d: Bytes.fromHex("dead"), e: "", f: 5, g: 1.5, h: -0.25 };

/** Three entries of 512 bytes: more than one MTU, and fewer than the four the TH starts with. */
const LONG_LIST_VALUE = [LONG_OCTET_STRING_ENTRY, LONG_OCTET_STRING_ENTRY, LONG_OCTET_STRING_ENTRY];

const SIMPLE_STRUCT_FIELDS = Schema.Required(SimpleStruct).children.map(({ id, name }) => ({ id, name }));

function sameField(expected: unknown, actual: unknown) {
    return Bytes.isBytes(expected) ? Bytes.isBytes(actual) && Bytes.areEqual(expected, actual) : expected === actual;
}

/**
 * Whether `read` holds every field of {@link STRUCT_VALUE}. The in-process controller decodes a cluster outside the
 * Matter model generically, keyed by field id, where chip-tool decodes it through the declared names.
 */
function isStructValue(read: unknown) {
    if (typeof read !== "object" || read === null) {
        return false;
    }
    return SIMPLE_STRUCT_FIELDS.every(({ id, name }) => {
        const actual = name in read ? Reflect.get(read, name) : Reflect.get(read, String(id));
        return sameField(Reflect.get(STRUCT_VALUE, name), actual);
    });
}

function isLongListValue(read: unknown) {
    return (
        Array.isArray(read) &&
        read.length === LONG_LIST_VALUE.length &&
        read.every(entry => sameField(LONG_OCTET_STRING_ENTRY, entry))
    );
}

/** Seconds the step-2 wildcard write puts into Identify.identifyTime on every endpoint that has it. */
const IDENTIFY_TIME_VALUE = 5;

/**
 * Step 2's wildcard-endpoint write is valid per Matter Core § 8.9.2.7, but the chip apps answer it
 * `InvalidAction` after failing to decode the path ("TLVReader.cpp:656: End of TLV"), so the step can
 * only run against a matter.js TH.
 */
const STEP_2_FLAVORS: SelectableDeviceFlavor[] = ["matterjs"];

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
    checks: RecordedCheck[],
): Promise<CheckRecord> {
    const th = cx.devices.th;
    const from = th.log.mark();

    const response = await attempt(
        () => cx.controllers.dut.node(ref).writeAttribute(path, value),
        () => `wrote ${describeWritten(value)} to ${JSON.stringify(path)}`,
    );
    checks.push({ what: `Write response for step ${label}`, check: () => response.check });

    const logCheck = await expectMessageWithPath(th.log, th.flavor, "write", path, from, LOG_TIMEOUT);
    checks.push({ what: `WriteRequestMessage log for step ${label}`, check: () => logCheck });
    return logCheck;
}

/** `value` for the evidence, with each octet string as its hex rather than as an object of its bytes. */
function describeWritten(value: unknown) {
    // The replacer reads the member from its holder because JSON.stringify has already applied a Buffer's toJSON
    return JSON.stringify(value, function (this: Record<string, unknown>, key: string, member: unknown) {
        const original = this[key];
        return Bytes.isBytes(original) ? `hex:${Bytes.toHex(original)}` : member;
    });
}

/**
 * {@link writeAndCheck}, then a read of `path` that `isWritten` must accept: the TH logging the request shows its
 * path, and only the value it then holds shows the request carried the value of the step's data type.
 */
async function writeAndReadBack(
    cx: CertStepContext,
    ref: CertNodeRef,
    label: string,
    path: AttributePathSpec,
    value: unknown,
    isWritten: (read: unknown) => boolean,
    checks: RecordedCheck[],
): Promise<CheckRecord> {
    const request = await writeAndCheck(cx, ref, label, path, value, checks);

    const read = await attempt(
        () => cx.controllers.dut.node(ref).readAttribute(path),
        value => `read back ${describeWritten(value)}`,
    );
    checks.push({
        what: `Read-back for step ${label}`,
        check: () =>
            read.ok && !isWritten(read.value)
                ? { ...read.check, verdict: "fail", detail: `${read.check.detail}, expected ${describeWritten(value)}` }
                : read.check,
    });
    return request;
}

/**
 * Data versions for `paths`' clusters, obtained from one ReadRequest carrying every path — the step's
 * procedure describes a single read of two clusters, so one request per cluster would be a different
 * interaction.
 */
async function clusterVersions(node: CertNodeApi, paths: AttributePathSpec[]): Promise<number[]> {
    const entries = await node.readAttributes(paths, { dataVersions: true });
    return paths.map(({ endpoint, cluster }) => {
        const version = entries.find(
            entry => entry.endpoint === endpoint && entry.cluster === cluster && entry.version !== undefined,
        )?.version;
        if (version === undefined) {
            throw new CertCheckFailedError(
                `TH reported no data version for cluster ${cluster} on endpoint ${endpoint}`,
            );
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
            await withChecks(cx, checks => writeAndCheck(cx, ref, "1", path, 2, checks));
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

            await withChecks(cx, async checks => {
                const from = th.log.mark();

                const successes = (statuses: AttributeWriteStatus[]) =>
                    statuses.filter(({ status }) => status === Status.Success);
                const write = await attempt(
                    () => dut.node(ref).writeAttributes([{ path, value: IDENTIFY_TIME_VALUE }]),
                    statuses =>
                        `wrote ${IDENTIFY_TIME_VALUE} to Identify.identifyTime on ${successes(statuses).length} endpoint(s): ` +
                        JSON.stringify(statuses),
                );
                const written = write.ok ? successes(write.value) : [];
                checks.push({
                    what: "A wildcard write must reach more than one endpoint",
                    check: () => (write.ok && written.length <= 1 ? { ...write.check, verdict: "fail" } : write.check),
                });

                const logCheck = await expectMessageWithPath(th.log, th.flavor, "write", path, from, LOG_TIMEOUT);
                checks.push({ what: "WriteRequestMessage log for step 2", check: () => logCheck });

                for (const { endpoint } of written) {
                    const read = await attempt(
                        () =>
                            dut
                                .node(ref)
                                .readAttribute({ endpoint, cluster: IDENTIFY_ID, attribute: IDENTIFY_TIME.id }),
                        value => `endpoint ${endpoint} reports identifyTime=${JSON.stringify(value)}`,
                    );
                    checks.push({
                        what: `endpoint ${endpoint} identifyTime`,
                        // identifyTime counts down from the written value, so the device may already report less
                        check: () =>
                            read.ok && typeof read.value !== "number" ? { ...read.check, verdict: "fail" } : read.check,
                    });
                }
            });
        }),
        {
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
            flavors: STEP_2_FLAVORS,
        },
    )
    .step(
        3,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type bool.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: requireId(LOCAL_CONFIG_DISABLED.id, "BasicInformation.localConfigDisabled"),
            };
            return withChecks(cx, checks => writeAndCheck(cx, ref, "3", path, true, checks));
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_Bool",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        4,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type string.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: requireId(NODE_LABEL.id, "BasicInformation.nodeLabel"),
            };
            return withChecks(cx, checks => writeAndCheck(cx, ref, "4", path, "node", checks));
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_String",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        5,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type unsigned integer.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: requireId(ON_OFF_TRANSITION_TIME.id, "LevelControl.onOffTransitionTime"),
            };
            return withChecks(cx, checks => writeAndCheck(cx, ref, "5", path, 1, checks));
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_UnsignedInteger",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        6,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type signed integer.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: THERMOSTAT_ID,
                attribute: requireId(LOCAL_TEMPERATURE_CALIBRATION.id, "Thermostat.localTemperatureCalibration"),
            };
            return withChecks(cx, checks => writeAndCheck(cx, ref, "6", path, -5, checks));
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_SignedInteger",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        7,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type floating point.",
        commissioned.withRef("dut", (cx, ref) =>
            withChecks(cx, checks =>
                writeAndReadBack(
                    cx,
                    ref,
                    "7",
                    unitTestingPath("floatSingle"),
                    FLOAT_VALUE,
                    read => read === FLOAT_VALUE,
                    checks,
                ),
            ),
        ),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_FloatingPoint",
            notApplicable: unitTestingNotApplicable,
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        8,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type Octet String.",
        commissioned.withRef("dut", (cx, ref) =>
            withChecks(cx, checks =>
                writeAndReadBack(
                    cx,
                    ref,
                    "8",
                    unitTestingPath("octetString"),
                    OCTET_STRING_VALUE,
                    read => sameField(OCTET_STRING_VALUE, read),
                    checks,
                ),
            ),
        ),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_OctetString",
            notApplicable: unitTestingNotApplicable,
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        9,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type Struct.",
        commissioned.withRef("dut", (cx, ref) =>
            withChecks(cx, checks =>
                writeAndReadBack(cx, ref, "9", unitTestingPath("structAttr"), STRUCT_VALUE, isStructValue, checks),
            ),
        ),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_Struct",
            notApplicable: unitTestingNotApplicable,
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        10,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type List.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: USER_LABEL_ID,
                attribute: requireId(LABEL_LIST.id, "UserLabel.labelList"),
            };
            const labels = [
                { label: "room", value: "kitchen" },
                { label: "floor", value: "1" },
            ];
            return withChecks(cx, checks => writeAndCheck(cx, ref, "10", path, labels, checks));
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_List",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        11,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type enum.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: THERMOSTAT_USER_INTERFACE_CONFIGURATION_ID,
                attribute: requireId(
                    TEMPERATURE_DISPLAY_MODE.id,
                    "ThermostatUserInterfaceConfiguration.temperatureDisplayMode",
                ),
            };
            return withChecks(cx, checks => writeAndCheck(cx, ref, "11", path, 1, checks));
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest.Attribute.DataType_Enum",
            expected: "Verify on the TH that the correct WriteRequestMessage has been received.",
        },
    )
    .step(
        12,
        "DUT sends the WriteRequestMessage to the TH to write an attribute of data type bitmap.",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: COLOR_CONTROL_ID,
                attribute: requireId(OPTIONS.id, "ColorControl.options"),
            };
            return withChecks(cx, checks => writeAndCheck(cx, ref, "12", path, 1, checks));
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
        commissioned.withRef("dut", (cx, ref) => {
            const th = cx.devices.th;
            const path = unitTestingPath("listLongOctetString");
            return withChecks(cx, async checks => {
                const request = await writeAndReadBack(cx, ref, "13", path, LONG_LIST_VALUE, isLongListValue, checks);

                const chunked = await expectChunkedWrite(th.log, th.flavor, request, LOG_TIMEOUT);
                checks.push({ what: "Chunked WriteRequestMessages for step 13", check: () => chunked });
            });
        }),
        {
            notApplicable: unitTestingNotApplicable,
            notApplicableAtRun: cx =>
                chunkedWriteNotApplicable(
                    cx,
                    commissioned.require("dut", "Step 13 ran before the DUT was commissioned"),
                    unitTestingPath("listLongOctetString"),
                ),
            controllerCapabilities: ["chunked-write"],
            expected:
                "Verify on the TH that the correct WriteRequestMessage has been received and MoreChunkedMessages is " +
                "set to True. Verify that the DUT waits for the WriteResponse action from the TH before sending the " +
                "next WriteRequestMessage.",
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
            await withChecks(cx, async checks => {
                for (let repeat = 1; repeat <= 3; repeat++) {
                    await writeAndCheck(cx, ref, `14 (attempt ${repeat})`, path, 1, checks);
                }
            });
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

            await withChecks(cx, async checks => {
                const versions = await attempt(
                    () => clusterVersions(node, [labelPath, levelPath]),
                    ([labelVersion, levelVersion]) =>
                        `data versions read: BasicInformation=${labelVersion}, LevelControl=${levelVersion}`,
                );
                checks.push({ what: "Data versions", check: () => versions.check });
                if (!versions.ok) {
                    return;
                }
                const [labelVersion, levelVersion] = versions.value;

                const from = th.log.mark();
                const write = await attempt(
                    () =>
                        node.writeAttributes([
                            { path: labelPath, value: "tc-idm-3-1-step-15", dataVersion: labelVersion },
                            { path: levelPath, value: 3, dataVersion: levelVersion },
                        ]),
                    statuses => `version-conditional write answered ${JSON.stringify(statuses)}`,
                );
                const written =
                    write.ok &&
                    write.value.length === 2 &&
                    write.value.every(({ status }) => status === Status.Success);
                checks.push({
                    what: "Version-conditional write",
                    check: () => (write.ok && !written ? { ...write.check, verdict: "fail" } : write.check),
                });

                const logCheck = await expectMessageWithPath(th.log, th.flavor, "write", labelPath, from, LOG_TIMEOUT);
                checks.push({ what: "WriteRequestMessage log for step 15", check: () => logCheck });

                if (written) {
                    const readBack = await attempt(
                        async () => ({
                            label: await node.readAttribute(labelPath),
                            level: await node.readAttribute(levelPath),
                        }),
                        ({ label, level }) =>
                            `read back nodeLabel=${JSON.stringify(label)}, onLevel=${JSON.stringify(level)}`,
                    );
                    const tookEffect =
                        readBack.ok && readBack.value.label === "tc-idm-3-1-step-15" && readBack.value.level === 3;
                    checks.push({
                        what: "Write took effect",
                        check: () =>
                            readBack.ok && !tookEffect ? { ...readBack.check, verdict: "fail" } : readBack.check,
                    });

                    // The plan stops at the successful write, which a device ignoring the version would also
                    // pass. Repeating it with the now-stale versions is the only evidence the version was honored.
                    const stale = await attempt(
                        () =>
                            node.writeAttributes([
                                { path: labelPath, value: "tc-idm-3-1-stale", dataVersion: labelVersion },
                            ]),
                        statuses => `write with the stale data version answered ${JSON.stringify(statuses)}`,
                    );
                    const rejected =
                        stale.ok && stale.value.length === 1 && stale.value[0].status === Status.DataVersionMismatch;
                    checks.push({
                        what: "Stale data version rejected",
                        check: () => (stale.ok && !rejected ? { ...stale.check, verdict: "fail" } : stale.check),
                    });
                }
            });
        }),
        {
            controllerCapabilities: ["data-versions", "multi-path-write"],
            expected:
                "Verify that the TH sends a Write Response message with a success back to the DUT. Verify by " +
                "sending a ReadRequest that the Write Action on TH was successful.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
