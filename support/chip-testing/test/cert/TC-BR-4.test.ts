/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis, Time } from "@matter/general";
import { Matter } from "@matter/model";
import type { AttributeReadEntry, CertNodeRef, CertStepContext, ClientEndpointEntry } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    expectAttributePathIB,
    expectCommandInvoke,
    LOG_TIMEOUT,
    record,
    recordAll,
    requireId,
} from "./tc-support.js";

const DESCRIPTOR = Matter.clusters.require("Descriptor");
const BRIDGED_DEVICE_BASIC_INFORMATION = Matter.clusters.require("BridgedDeviceBasicInformation");
const ON_OFF = Matter.clusters.require("OnOff");
const TEMPERATURE_MEASUREMENT = Matter.clusters.require("TemperatureMeasurement");
const POWER_SOURCE = Matter.clusters.require("PowerSource");

const DESCRIPTOR_ID = requireId(DESCRIPTOR.id, "Descriptor cluster");
const DEVICE_TYPE_LIST_ID = requireId(DESCRIPTOR.attributes.require("deviceTypeList").id, "Descriptor.deviceTypeList");
const PARTS_LIST_ID = requireId(DESCRIPTOR.attributes.require("partsList").id, "Descriptor.partsList");

const BRIDGED_INFO_ID = requireId(BRIDGED_DEVICE_BASIC_INFORMATION.id, "BridgedDeviceBasicInformation cluster");
const NODE_LABEL_ID = requireId(
    BRIDGED_DEVICE_BASIC_INFORMATION.attributes.require("nodeLabel").id,
    "BridgedDeviceBasicInformation.nodeLabel",
);

const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ON_OFF_ATTRIBUTE_ID = requireId(ON_OFF.attributes.require("onOff").id, "OnOff.onOff");

const TEMPERATURE_ID = requireId(TEMPERATURE_MEASUREMENT.id, "TemperatureMeasurement cluster");
const MEASURED_VALUE_ID = requireId(
    TEMPERATURE_MEASUREMENT.attributes.require("measuredValue").id,
    "TemperatureMeasurement.measuredValue",
);

const POWER_SOURCE_ID = requireId(POWER_SOURCE.id, "PowerSource cluster");
const BAT_CHARGE_LEVEL_ID = requireId(
    POWER_SOURCE.attributes.require("batChargeLevel").id,
    "PowerSource.batChargeLevel",
);

/** The device types the plan's endpoint list names. */
const ON_OFF_LIGHT_DEVICE_TYPE = 0x0100;
const TEMPERATURE_SENSOR_DEVICE_TYPE = 0x0302;
const POWER_SOURCE_DEVICE_TYPE = 0x0011;
const AGGREGATOR_DEVICE_TYPE = 0x000e;

const ROOT_ENDPOINT = 0;
const AGGREGATOR_ENDPOINT = 1;

/**
 * The endpoints chip's `bridge-app` exposes, which the matter.js bridge test device mirrors.
 *
 * **The plan's own endpoint list is wrong here**, and this follows the app the plan names rather than
 * the list: the plan puts five lights at 3 and 10-13 and a power source at 9, where the app puts its
 * lights at 3 and 9-12 (one plus four for the Actions test plan), the power source on the composed
 * endpoint 6 itself, and nothing at all at 13 until step 3c adds it.
 */
const LIGHTS = [3, 9, 10, 11, 12];
const TEMPERATURE_SENSORS = [4, 5, 7, 8];
const COMPOSED_ENDPOINT = 6;
const COMPOSED_SENSORS = [7, 8];

/**
 * The endpoints carrying Bridged Device Basic Information: every device the bridge exposes, plus the
 * composed endpoint, which the bridge describes in place of the sensors below it. Those sensors are
 * parts of a device the bridge already named, so they carry none of their own.
 */
const NAMED_DEVICES = [...LIGHTS, ...TEMPERATURE_SENSORS.filter(number => !COMPOSED_SENSORS.includes(number))]
    .concat(COMPOSED_ENDPOINT)
    .sort((a, b) => a - b);

/**
 * The bridge's first light — the one every command the plan uses acts on: chip's toggle switches it,
 * its rename renames it, and its remove removes it. The four beyond it belong to the Actions plan and
 * no command here touches them, which is what makes them the control group for a toggle.
 */
const LIGHT_1_ENDPOINT = 3;

/** The light the bridge gains in step 3c, which is a different device from {@link LIGHT_1_ENDPOINT}. */
const ADDED_LIGHT_ENDPOINT = 13;

/** The name step 3a renames {@link LIGHT_1_ENDPOINT} to. */
const RENAMED_LABEL = "Light 1b";

/** How far one warming moves a sensor, in the hundredths of a degree the cluster reports. */
const ONE_DEGREE = 100;

/**
 * How long the DUT is given to take in a change the TH made.
 *
 * A change reaches the DUT as a report on the subscription it holds for the whole node, so the budget
 * covers the report and the controller's own handling of it, not a poll interval.
 */
const NOTICE_WAIT_MS = 20_000;
const POLL_MS = 100;

const commissioned = new CommissionedRefs();

function node(cx: CertStepContext) {
    return cx.controllers.dut.node(commissioned.require("dut"));
}

/** Waits until `predicate` holds, or the budget runs out; reports whether it held. */
async function until(predicate: () => Promise<boolean>): Promise<boolean> {
    const deadline = Time.nowUs + Millis(NOTICE_WAIT_MS);
    for (;;) {
        if (await predicate()) {
            return true;
        }
        if (Time.nowUs >= deadline) {
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
}

/** The value of one entry of a wildcard read, or `undefined` where the read returned no such path. */
function valueAt(entries: AttributeReadEntry[], endpoint: number, cluster: number, attribute: number): unknown {
    return entries.find(
        entry => entry.endpoint === endpoint && entry.cluster === cluster && entry.attribute === attribute,
    )?.value;
}

/** Every endpoint a wildcard read of `cluster`/`attribute` answered for. */
function endpointsAnswering(entries: AttributeReadEntry[], cluster: number, attribute: number): number[] {
    return entries
        .filter(entry => entry.cluster === cluster && entry.attribute === attribute)
        .map(entry => entry.endpoint)
        .sort((a, b) => a - b);
}

/** The device types a `deviceTypeList` value names, whatever shape the adapter decoded it into. */
function deviceTypesOf(value: unknown): number[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(entry =>
            typeof entry === "object" && entry !== null && "deviceType" in entry ? Number(entry.deviceType) : NaN,
        )
        .filter(id => !Number.isNaN(id));
}

/** The endpoint numbers a `partsList` value names. */
function partsOf(value: unknown): number[] {
    return Array.isArray(value) ? value.map(Number).filter(number => !Number.isNaN(number)) : [];
}

/**
 * Reads `attribute` of `cluster` on every endpoint of the TH, and records the TH's own log as saying
 * the DUT asked for it.
 *
 * A wildcard endpoint is what the plan's "from all available endpoints" amounts to for a controller
 * the test drives: one request whose expansion the TH performs, so the answer names the endpoints the
 * TH has rather than the ones this file expects it to have.
 */
async function readEveryEndpoint(
    cx: CertStepContext,
    what: string,
    cluster: number,
    attribute: number,
): Promise<AttributeReadEntry[]> {
    const th = cx.devices.th;
    const from = await th.log.markSettled();

    const entries = await node(cx).readAttributes([{ cluster, attribute }]);

    const logCheck = await expectAttributePathIB(th.log, th.flavor, { cluster, attribute }, from, LOG_TIMEOUT);
    record(cx, logCheck, `the TH received the DUT's read of ${what}`);

    return entries;
}

/** The endpoints the DUT holds for the TH, refusing a controller that holds none. */
async function heldEndpoints(cx: CertStepContext): Promise<ClientEndpointEntry[]> {
    return node(cx).clientEndpoints();
}

function heldEndpoint(entries: ClientEndpointEntry[], endpoint: number): ClientEndpointEntry | undefined {
    return entries.find(entry => entry.endpoint === endpoint);
}

async function heldAttribute(
    cx: CertStepContext,
    endpoint: number,
    cluster: number,
    attribute: number,
): Promise<unknown> {
    return node(cx).clientAttribute({ endpoint, cluster, attribute });
}

/**
 * What the DUT holds for `attribute` on each of `endpoints`, taken before anything reads it.
 *
 * A read feeds the controller's own copy of the node, so a held value taken after one is the value
 * that read just delivered and says nothing about what reached the DUT on its own. Every claim here
 * that the DUT took a value in rests on the copy as it stood before the read compared against it.
 */
async function heldBefore(
    cx: CertStepContext,
    endpoints: readonly number[],
    cluster: number,
    attribute: number,
): Promise<Map<number, unknown>> {
    const held = new Map<number, unknown>();
    for (const endpoint of endpoints) {
        held.set(endpoint, await heldAttribute(cx, endpoint, cluster, attribute));
    }
    return held;
}

certTest("TC-BR-4", {
    plan: "bridge.adoc",
    pics: ["MCORE.BRIDGECLIENT"],
    app: "bridge",

    // chip's bridge-app cannot encode PowerSource.GeneratedCommandList on its composed endpoint and
    // destroys the read handler mid-chunk, so a controller's wildcard read of the bridge never
    // completes and it never subscribes. Restore the chip flavors once
    // https://github.com/project-chip/connectedhomeip/issues/73561 is fixed.
    flavors: ["matterjs"],
})
    .step(
        "1a",
        "Start bridge-app on TH. Commission TH to DUT. Monitor traffic between DUT and TH.",
        async cx => {
            const th = cx.devices.th;

            const ref: CertNodeRef = await cx.controllers.dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const deviceTypes = await readEveryEndpoint(cx, "DeviceTypeList", DESCRIPTOR_ID, DEVICE_TYPE_LIST_ID);
            const parts = await readEveryEndpoint(cx, "PartsList", DESCRIPTOR_ID, PARTS_LIST_ID);

            const answered = endpointsAnswering(deviceTypes, DESCRIPTOR_ID, DEVICE_TYPE_LIST_ID);
            const expected = [ROOT_ENDPOINT, AGGREGATOR_ENDPOINT, ...LIGHTS, ...TEMPERATURE_SENSORS, COMPOSED_ENDPOINT]
                .sort((a, b) => a - b)
                .filter((number, index, all) => all.indexOf(number) === index);

            const missing = expected.filter(number => !answered.includes(number));

            // PartsList is mandatory on every endpoint, so a conforming leaf answers it empty
            const answeringParts = endpointsAnswering(parts, DESCRIPTOR_ID, PARTS_LIST_ID);
            const missingParts = expected.filter(number => !answeringParts.includes(number));

            const aggregatorParts = partsOf(valueAt(parts, AGGREGATOR_ENDPOINT, DESCRIPTOR_ID, PARTS_LIST_ID));
            const composedParts = partsOf(valueAt(parts, COMPOSED_ENDPOINT, DESCRIPTOR_ID, PARTS_LIST_ID));

            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict: missing.length === 0 ? "pass" : "fail",
                        detail: `the DUT read DeviceTypeList from endpoints ${answered.join(", ")}`,
                    }),
                    what: "the DUT read the device type of every endpoint the plan names",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict: missingParts.length === 0 ? "pass" : "fail",
                        detail: `the DUT read PartsList from endpoints ${answeringParts.join(", ")}`,
                    }),
                    what: "the DUT read the parts of every endpoint the plan names",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict: COMPOSED_SENSORS.every(number => composedParts.includes(number)) ? "pass" : "fail",
                        detail:
                            `the composed device on endpoint ${COMPOSED_ENDPOINT} names parts ` +
                            `${composedParts.join(", ")}; the aggregator names ${aggregatorParts.join(", ")}`,
                    }),
                    what: "the DUT read a PartsList that puts the composed device's sensors below it",
                },
            ]);
        },
        {
            expected:
                "Verify DUT reads relevant information from the various endpoints of TH: DUT is expected to " +
                "read DeviceTypeList and PartsList from all available endpoints.",
        },
    )
    .step(
        "1b",
        "Verify DUT contains the (supported) devices from the endpoint list",
        async cx => {
            const held = await heldEndpoints(cx);

            const lights = LIGHTS.filter(number =>
                heldEndpoint(held, number)?.deviceTypes.includes(ON_OFF_LIGHT_DEVICE_TYPE),
            );
            const sensors = TEMPERATURE_SENSORS.filter(number =>
                heldEndpoint(held, number)?.deviceTypes.includes(TEMPERATURE_SENSOR_DEVICE_TYPE),
            );
            const composed = heldEndpoint(held, COMPOSED_ENDPOINT);
            const aggregator = heldEndpoint(held, AGGREGATOR_ENDPOINT);

            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict:
                            lights.length === LIGHTS.length && sensors.length === TEMPERATURE_SENSORS.length
                                ? "pass"
                                : "fail",
                        detail:
                            `the DUT holds lights on ${lights.join(", ")} and temperature sensors on ` +
                            `${sensors.join(", ")}`,
                    }),
                    what: "the DUT's own device list names every bridged device the TH exposes",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict:
                            composed?.deviceTypes.includes(POWER_SOURCE_DEVICE_TYPE) === true &&
                            aggregator?.deviceTypes.includes(AGGREGATOR_DEVICE_TYPE) === true
                                ? "pass"
                                : "fail",
                        detail:
                            `endpoint ${AGGREGATOR_ENDPOINT} is the aggregator and endpoint ${COMPOSED_ENDPOINT} ` +
                            `carries device types ${(composed?.deviceTypes ?? []).join(", ")}`,
                    }),
                    what: "the DUT holds the composed device as the bridge's own battery-powered device",
                },
            ]);
        },
        {
            pics: "MCORE.DEVLIST.UseDevices",
            expected: "Verify DUT contains the (supported) devices from the above list.",
        },
    )
    .step(
        "1c",
        "Verify DUT has read the NodeLabel attribute from the Bridged Device Basic Information cluster on " +
            "various endpoints",
        async cx => {
            const held = await heldBefore(cx, NAMED_DEVICES, BRIDGED_INFO_ID, NODE_LABEL_ID);
            const entries = await readEveryEndpoint(cx, "NodeLabel", BRIDGED_INFO_ID, NODE_LABEL_ID);
            const answered = endpointsAnswering(entries, BRIDGED_INFO_ID, NODE_LABEL_ID);
            const missing = NAMED_DEVICES.filter(endpoint => !answered.includes(endpoint));

            const disagreeing = NAMED_DEVICES.filter(
                endpoint => held.get(endpoint) !== valueAt(entries, endpoint, BRIDGED_INFO_ID, NODE_LABEL_ID),
            );

            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict: missing.length === 0 ? "pass" : "fail",
                        detail:
                            `the DUT read NodeLabel from endpoints ${answered.join(", ")}; the bridged devices ` +
                            `are ${NAMED_DEVICES.join(", ")}`,
                    }),
                    what: "the DUT read the name of every bridged device that has one",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict: disagreeing.length === 0 ? "pass" : "fail",
                        detail:
                            `the DUT already held the name the TH reports on ` +
                            `${NAMED_DEVICES.length - disagreeing.length} of ${NAMED_DEVICES.length} endpoints`,
                    }),
                    what: "the DUT's own device list carries those names",
                },
            ]);
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceName",
            expected: "Verify DUT contains the names for the (supported) devices from the above list.",
        },
    )
    .step(
        "1d",
        "Verify DUT has read or reads the OnOff attribute from the On/Off cluster for the endpoints " +
            "containing an On/Off light",
        async cx => {
            await recordLightState(cx, "the DUT read the state of every bridged light");
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceState",
            expected: "Verify DUT contains the state for the (supported) devices from the above list.",
        },
    )
    .step(
        "1e",
        "Use TH/bridge-app to change the on/off state of one or more of the bridged On/Off lights",
        async cx => {
            const before = await heldAttribute(cx, LIGHT_1_ENDPOINT, ON_OFF_ID, ON_OFF_ATTRIBUTE_ID);
            if (typeof before !== "boolean") {
                throw new CertCheckFailedError(
                    `the DUT holds no OnOff for endpoint ${LIGHT_1_ENDPOINT} (${describeValue(before)}), so a ` +
                        "toggle it took in cannot be told from a first value arriving",
                );
            }

            await cx.devices.th.backchannel({ name: "toggleBridgedLights" });

            // A first report of the value the light already had would satisfy a mere "it differs"
            // without a toggle having been seen, so the wait names the value it must reach
            const expected = !before;
            const noticed = await until(
                async () => (await heldAttribute(cx, LIGHT_1_ENDPOINT, ON_OFF_ID, ON_OFF_ATTRIBUTE_ID)) === expected,
            );
            const after = await heldAttribute(cx, LIGHT_1_ENDPOINT, ON_OFF_ID, ON_OFF_ATTRIBUTE_ID);

            record(
                cx,
                {
                    type: "response",
                    verdict: noticed ? "pass" : "fail",
                    detail:
                        `the DUT held ${before} for endpoint ${LIGHT_1_ENDPOINT}'s OnOff and now holds ${after}, ` +
                        `where the toggle makes it ${expected}`,
                },
                "the DUT took in the light the TH switched",
            );

            await recordLightState(cx, "the DUT reads the updated state of every bridged light");
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceState",
            expected: "Verify DUT contains the updated state for the (supported) devices from the above list.",
        },
    )
    .step(
        "1f",
        "Verify DUT has read or reads the MeasuredValue attribute from the Temperature Measurement cluster " +
            "for the endpoints containing a Temperature Sensor",
        async cx => {
            await recordTemperatures(cx, "the DUT read the temperature of every bridged sensor");
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceState",
            expected: "Verify DUT contains the state for the (supported) device from the above list.",
        },
    )
    .step(
        "1g",
        "Use TH/bridge-app to change the simulated temperature level of the simulated temperature sensors",
        async cx => {
            // The command warms every sensor, each reporting on its own, so the wait covers all of
            // them: what follows compares the whole set, and a sensor still in flight would read as
            // the DUT disagreeing with the TH
            const held = await heldBefore(cx, TEMPERATURE_SENSORS, TEMPERATURE_ID, MEASURED_VALUE_ID);
            const expected = new Map<number, number>();
            for (const endpoint of TEMPERATURE_SENSORS) {
                const value = held.get(endpoint);
                if (typeof value !== "number") {
                    throw new CertCheckFailedError(
                        `the DUT holds no MeasuredValue for endpoint ${endpoint} (${describeValue(value)}), so a ` +
                            "warming it took in cannot be told from a first value arriving",
                    );
                }

                // A first report of the temperature a sensor already had would satisfy a mere "it
                // differs" without a warming having been seen, so the wait names the value to reach
                expected.set(endpoint, value + ONE_DEGREE);
            }

            await cx.devices.th.backchannel({ name: "warmBridgedTemperatureSensors" });

            const noticed = await until(async () => {
                for (const endpoint of TEMPERATURE_SENSORS) {
                    if (
                        (await heldAttribute(cx, endpoint, TEMPERATURE_ID, MEASURED_VALUE_ID)) !==
                        expected.get(endpoint)
                    ) {
                        return false;
                    }
                }
                return true;
            });

            const after = await heldBefore(cx, TEMPERATURE_SENSORS, TEMPERATURE_ID, MEASURED_VALUE_ID);
            const behind = TEMPERATURE_SENSORS.filter(endpoint => after.get(endpoint) !== expected.get(endpoint));

            record(
                cx,
                {
                    type: "response",
                    verdict: noticed ? "pass" : "fail",
                    detail: noticed
                        ? `every sensor's MeasuredValue reached the value one warming makes it, ` +
                          `${TEMPERATURE_SENSORS.map(endpoint => `${endpoint}: ${describeValue(after.get(endpoint))}`).join(", ")}`
                        : `the DUT still holds a temperature short of one warming on endpoints ` +
                          `${behind.map(endpoint => `${endpoint} (${describeValue(after.get(endpoint))}, expected ${expected.get(endpoint)})`).join(", ")}`,
                },
                "the DUT took in the temperature the TH changed",
            );

            await recordTemperatures(cx, "the DUT reads the updated temperature of every bridged sensor");
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceState",
            expected: "Verify DUT contains the updated state for the (supported) device from the above list.",
        },
    )
    .step(
        "1h",
        "Verify DUT has read or reads the BatChargeLevel attribute from the Power Source cluster from the " +
            "relevant endpoint",
        async cx => {
            const held = await heldAttribute(cx, COMPOSED_ENDPOINT, POWER_SOURCE_ID, BAT_CHARGE_LEVEL_ID);
            const entries = await readEveryEndpoint(cx, "BatChargeLevel", POWER_SOURCE_ID, BAT_CHARGE_LEVEL_ID);
            const answered = endpointsAnswering(entries, POWER_SOURCE_ID, BAT_CHARGE_LEVEL_ID);
            const read = valueAt(entries, COMPOSED_ENDPOINT, POWER_SOURCE_ID, BAT_CHARGE_LEVEL_ID);

            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict: read === undefined ? "fail" : "pass",
                        detail:
                            `the DUT read BatChargeLevel from endpoints ${answered.join(", ")}; endpoint ` +
                            `${COMPOSED_ENDPOINT} reports ${read}`,
                    }),
                    what: "the DUT read the battery level of the composed device",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict: read !== undefined && held === read ? "pass" : "fail",
                        detail: `the DUT already held ${describeValue(held)} where the TH reports ${describeValue(read)}`,
                    }),
                    what: "the DUT's own device list carries that battery level",
                },
            ]);
        },
        {
            pics: "MCORE.DEVLIST.UseBatInfo",
            expected: "Verify DUT contains the state of the battery of the (supported) devices from the above list.",
        },
    )
    .step(
        "2a",
        "Use the DUT to change the on/off state of one or more of the bridged On/Off lights",
        async cx => {
            const th = cx.devices.th;

            // Step 1e's toggle leaves this light on, and an On command that changes nothing cannot
            // show the state change the step is about
            await node(cx).invoke("OnOff", "off", {}, LIGHT_1_ENDPOINT);
            const before = await node(cx).readAttribute({
                endpoint: LIGHT_1_ENDPOINT,
                cluster: ON_OFF_ID,
                attribute: ON_OFF_ATTRIBUTE_ID,
            });
            if (before !== false) {
                throw new CertCheckFailedError(
                    `endpoint ${LIGHT_1_ENDPOINT}'s OnOff reads ${describeValue(before)} after an Off command, so ` +
                        "an On command that follows cannot be told from the light already being on",
                );
            }

            const from = await th.log.markSettled();

            await node(cx).invoke("OnOff", "on", {}, LIGHT_1_ENDPOINT);

            const logCheck = await expectCommandInvoke(
                th.log,
                th.flavor,
                LIGHT_1_ENDPOINT,
                ON_OFF_ID,
                requireId(ON_OFF.commands.require("on").id, "OnOff.on"),
                [],
                from,
                LOG_TIMEOUT,
            );
            record(cx, logCheck, `the TH received the DUT's On command for endpoint ${LIGHT_1_ENDPOINT}`);

            const value = await node(cx).readAttribute({
                endpoint: LIGHT_1_ENDPOINT,
                cluster: ON_OFF_ID,
                attribute: ON_OFF_ATTRIBUTE_ID,
            });

            record(
                cx,
                {
                    type: "response",
                    verdict: value === true ? "pass" : "fail",
                    detail:
                        `endpoint ${LIGHT_1_ENDPOINT}'s OnOff read ${before} before the command and ${value} ` +
                        "after it",
                },
                "the bridged light the DUT commanded is on",
            );
        },
        {
            expected:
                "Verify the DUT sends On command (On/Off cluster). Verify that simulated light in TH changes " +
                "state.",
        },
    )
    .step(
        "3a",
        "Use TH/bridge-app to rename a bridged light",
        async cx => {
            await cx.devices.th.backchannel({ name: "renameBridgedLights" });

            const noticed = await until(
                async () =>
                    (await heldAttribute(cx, LIGHT_1_ENDPOINT, BRIDGED_INFO_ID, NODE_LABEL_ID)) === RENAMED_LABEL,
            );
            const held = await heldAttribute(cx, LIGHT_1_ENDPOINT, BRIDGED_INFO_ID, NODE_LABEL_ID);

            record(
                cx,
                {
                    type: "response",
                    verdict: noticed ? "pass" : "fail",
                    detail: `the DUT holds ${JSON.stringify(held)} for endpoint ${LIGHT_1_ENDPOINT}'s NodeLabel`,
                },
                "the DUT took in the renamed bridged light",
            );
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceName",
            expected:
                "Verify DUT reads (or gets the update via a previously set up subscription) an updated version " +
                "of the NodeLabel attribute in the Bridged Device Basic Information cluster of the bridged device " +
                "that got renamed.",
        },
    )
    .step(
        "3b",
        "Verify DUT contains the updated name for the renamed device",
        async cx => {
            const held = await heldAttribute(cx, LIGHT_1_ENDPOINT, BRIDGED_INFO_ID, NODE_LABEL_ID);
            const entries = await readEveryEndpoint(cx, "NodeLabel", BRIDGED_INFO_ID, NODE_LABEL_ID);
            const read = valueAt(entries, LIGHT_1_ENDPOINT, BRIDGED_INFO_ID, NODE_LABEL_ID);

            record(
                cx,
                {
                    type: "response",
                    verdict: read === RENAMED_LABEL && held === read ? "pass" : "fail",
                    detail: `the TH reports ${JSON.stringify(read)} and the DUT already held ${JSON.stringify(held)}`,
                },
                "the DUT's own device list carries the new name",
            );
        },
        {
            pics: "MCORE.DEVLIST.UseDeviceName",
            expected: "Verify DUT contains the updated name for the renamed device.",
        },
    )
    .step(
        "3c",
        "Use TH/bridge-app to add a bridged light",
        async cx => {
            await cx.devices.th.backchannel({ name: "addBridgedLight" });

            const noticed = await until(async () =>
                (await heldEndpoints(cx)).some(entry => entry.endpoint === ADDED_LIGHT_ENDPOINT),
            );

            const parts = await readEveryEndpoint(cx, "PartsList", DESCRIPTOR_ID, PARTS_LIST_ID);
            const rootParts = partsOf(valueAt(parts, ROOT_ENDPOINT, DESCRIPTOR_ID, PARTS_LIST_ID));
            const aggregatorParts = partsOf(valueAt(parts, AGGREGATOR_ENDPOINT, DESCRIPTOR_ID, PARTS_LIST_ID));
            const addedAnsweredParts = endpointsAnswering(parts, DESCRIPTOR_ID, PARTS_LIST_ID).includes(
                ADDED_LIGHT_ENDPOINT,
            );

            const deviceTypes = await readEveryEndpoint(cx, "DeviceTypeList", DESCRIPTOR_ID, DEVICE_TYPE_LIST_ID);
            const addedTypes = deviceTypesOf(
                valueAt(deviceTypes, ADDED_LIGHT_ENDPOINT, DESCRIPTOR_ID, DEVICE_TYPE_LIST_ID),
            );

            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict: noticed ? "pass" : "fail",
                        detail: `the DUT ${noticed ? "holds" : "does not hold"} endpoint ${ADDED_LIGHT_ENDPOINT}`,
                    }),
                    what: "the DUT took in the bridged light the TH added",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict:
                            rootParts.includes(ADDED_LIGHT_ENDPOINT) &&
                            aggregatorParts.includes(ADDED_LIGHT_ENDPOINT) &&
                            addedAnsweredParts
                                ? "pass"
                                : "fail",
                        detail:
                            `the root endpoint names parts ${rootParts.join(", ")}, the aggregator names ` +
                            `${aggregatorParts.join(", ")}, and endpoint ${ADDED_LIGHT_ENDPOINT} ` +
                            `${addedAnsweredParts ? "answered" : "did not answer"} a PartsList of its own`,
                    }),
                    what: "the DUT read the added endpoint's PartsList and those of the root and the aggregator",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict: addedTypes.includes(ON_OFF_LIGHT_DEVICE_TYPE) ? "pass" : "fail",
                        detail: `endpoint ${ADDED_LIGHT_ENDPOINT} reports device types ${addedTypes.join(", ")}`,
                    }),
                    what: "the DUT read the added endpoint's own device type",
                },
            ]);
        },
        {
            expected:
                "Verify DUT reads (or gets the update via a previously set up subscription) an updated version " +
                "of the PartsList attribute in the Descriptor cluster on endpoint 0 and the endpoint of the " +
                "Aggregator device type to be aware of the added device. Verify DUT reads PartsList and DeviceType " +
                "attribute of the newly added endpoint.",
        },
    )
    .step(
        "3d",
        "Verify DUT contains the added device in the list of devices",
        async cx => {
            const added = heldEndpoint(await heldEndpoints(cx), ADDED_LIGHT_ENDPOINT);

            record(
                cx,
                {
                    type: "response",
                    verdict: added?.deviceTypes.includes(ON_OFF_LIGHT_DEVICE_TYPE) ? "pass" : "fail",
                    detail:
                        added === undefined
                            ? `the DUT's device list has no endpoint ${ADDED_LIGHT_ENDPOINT}`
                            : `the DUT holds endpoint ${ADDED_LIGHT_ENDPOINT} with device types ${added.deviceTypes.join(", ")}`,
                },
                "the DUT's own device list names the added device",
            );
        },
        {
            pics: "MCORE.DEVLIST.UseDevices",
            expected: "Verify DUT contains the added device in the list of devices.",
        },
    )
    .step(
        "3e",
        "Use TH/bridge-app to remove a bridged light",
        async cx => {
            await cx.devices.th.backchannel({ name: "removeBridgedLight" });

            const noticed = await until(
                async () => !(await heldEndpoints(cx)).some(entry => entry.endpoint === LIGHT_1_ENDPOINT),
            );

            const parts = await readEveryEndpoint(cx, "PartsList", DESCRIPTOR_ID, PARTS_LIST_ID);
            const rootParts = partsOf(valueAt(parts, ROOT_ENDPOINT, DESCRIPTOR_ID, PARTS_LIST_ID));
            const aggregatorParts = partsOf(valueAt(parts, AGGREGATOR_ENDPOINT, DESCRIPTOR_ID, PARTS_LIST_ID));

            recordAll(cx, [
                {
                    check: () => ({
                        type: "response",
                        verdict: noticed ? "pass" : "fail",
                        detail: `the DUT ${noticed ? "no longer holds" : "still holds"} endpoint ${LIGHT_1_ENDPOINT}`,
                    }),
                    what: "the DUT took in the bridged light the TH removed",
                },
                {
                    check: () => ({
                        type: "response",
                        verdict:
                            !rootParts.includes(LIGHT_1_ENDPOINT) && !aggregatorParts.includes(LIGHT_1_ENDPOINT)
                                ? "pass"
                                : "fail",
                        detail:
                            `the root endpoint names parts ${rootParts.join(", ")} and the aggregator names ` +
                            `${aggregatorParts.join(", ")}`,
                    }),
                    what: "the DUT read a PartsList that no longer names the removed endpoint",
                },
            ]);
        },
        {
            expected:
                "Verify DUT reads (or gets the update via a previously set up subscription) an updated version " +
                "of the PartsList attribute in the Descriptor cluster on endpoint 0 and the endpoint of the " +
                "Aggregator device type to be aware of the removed device.",
        },
    )
    .step(
        "3f",
        "Verify DUT no longer contains the removed device in the list of devices",
        async cx => {
            const held = await heldEndpoints(cx);

            record(
                cx,
                {
                    type: "response",
                    verdict: heldEndpoint(held, LIGHT_1_ENDPOINT) === undefined ? "pass" : "fail",
                    detail: `the DUT's device list names endpoints ${held.map(entry => entry.endpoint).join(", ")}`,
                },
                "the DUT's own device list no longer names the removed device",
            );
        },
        {
            pics: "MCORE.DEVLIST.UseDevices",
            expected: "Verify DUT no longer contains the removed device in the list of devices.",
        },
    )
    .finalize(async cx => {
        await commissioned.decommissionAll(cx);
    });

/**
 * Records that the DUT read every bridged light's state and holds what the TH reported.
 *
 * The read and the DUT's own value are separate claims: the read says the TH answered, the held value
 * says the DUT took the answer in, and only the second can fail once a subscription is delivering.
 */
async function recordLightState(cx: CertStepContext, what: string) {
    const held = await heldBefore(cx, LIGHTS, ON_OFF_ID, ON_OFF_ATTRIBUTE_ID);
    const entries = await readEveryEndpoint(cx, "OnOff", ON_OFF_ID, ON_OFF_ATTRIBUTE_ID);
    const answered = endpointsAnswering(entries, ON_OFF_ID, ON_OFF_ATTRIBUTE_ID);

    const disagreeing = LIGHTS.filter(
        endpoint => held.get(endpoint) !== valueAt(entries, endpoint, ON_OFF_ID, ON_OFF_ATTRIBUTE_ID),
    );

    const missing = LIGHTS.filter(number => !answered.includes(number));

    recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: missing.length === 0 ? "pass" : "fail",
                detail:
                    missing.length === 0
                        ? `the DUT read OnOff from endpoints ${answered.join(", ")}`
                        : `the DUT read OnOff from endpoints ${answered.join(", ")}, and none for ` +
                          `${missing.join(", ")}`,
            }),
            what,
        },
        {
            check: () => ({
                type: "response",
                verdict: disagreeing.length === 0 ? "pass" : "fail",
                detail:
                    disagreeing.length > 0
                        ? `the DUT held a different state on endpoints ${disagreeing.join(", ")}`
                        : `the DUT already held the state the TH reports on all ${LIGHTS.length} lights`,
            }),
            what: "the DUT's own device list carries those states",
        },
    ]);
}

/** As {@link recordLightState}, for the temperature the bridged sensors report. */
async function recordTemperatures(cx: CertStepContext, what: string) {
    const held = await heldBefore(cx, TEMPERATURE_SENSORS, TEMPERATURE_ID, MEASURED_VALUE_ID);
    const entries = await readEveryEndpoint(cx, "MeasuredValue", TEMPERATURE_ID, MEASURED_VALUE_ID);
    const answered = endpointsAnswering(entries, TEMPERATURE_ID, MEASURED_VALUE_ID);

    const disagreeing = TEMPERATURE_SENSORS.filter(
        endpoint => held.get(endpoint) !== valueAt(entries, endpoint, TEMPERATURE_ID, MEASURED_VALUE_ID),
    );

    const missing = TEMPERATURE_SENSORS.filter(number => !answered.includes(number));

    recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: missing.length === 0 ? "pass" : "fail",
                detail:
                    missing.length === 0
                        ? `the DUT read MeasuredValue from endpoints ${answered.join(", ")}`
                        : `the DUT read MeasuredValue from endpoints ${answered.join(", ")}, and none for ` +
                          `${missing.join(", ")}`,
            }),
            what,
        },
        {
            check: () => ({
                type: "response",
                verdict: disagreeing.length === 0 ? "pass" : "fail",
                detail:
                    disagreeing.length > 0
                        ? `the DUT held a different temperature on endpoints ${disagreeing.join(", ")}`
                        : `the DUT already held the temperature the TH reports on all ` +
                          `${TEMPERATURE_SENSORS.length} sensors`,
            }),
            what: "the DUT's own device list carries those temperatures",
        },
    ]);
}
