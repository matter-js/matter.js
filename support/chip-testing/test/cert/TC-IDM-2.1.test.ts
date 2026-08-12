/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { AttributePathSpec, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import { CommissionedRefs, expectAttributePathIB, expectChunkedTransfer } from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const ON_OFF = Matter.clusters.require("OnOff");
const MODE_SELECT = Matter.clusters.require("ModeSelect");
const LEVEL_CONTROL = Matter.clusters.require("LevelControl");
const PRESSURE_MEASUREMENT = Matter.clusters.require("PressureMeasurement");
const CO2_MEASUREMENT = Matter.clusters.require("CarbonDioxideConcentrationMeasurement");
const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const GENERAL_COMMISSIONING = Matter.clusters.require("GeneralCommissioning");
const OCCUPANCY_SENSING = Matter.clusters.require("OccupancySensing");
const DESCRIPTOR = Matter.clusters.require("Descriptor");

const VENDOR_ID = BASIC_INFORMATION.attributes.require("vendorId");
const CLUSTER_REVISION = BASIC_INFORMATION.attributes.require("clusterRevision");
const ON_OFF_ATTRIBUTE = ON_OFF.attributes.require("onOff");
const DESCRIPTION = MODE_SELECT.attributes.require("description");
const SUPPORTED_MODES = MODE_SELECT.attributes.require("supportedModes");
const CURRENT_LEVEL = LEVEL_CONTROL.attributes.require("currentLevel");
const OPTIONS = LEVEL_CONTROL.attributes.require("options");
const PRESSURE_MEASURED_VALUE = PRESSURE_MEASUREMENT.attributes.require("measuredValue");
const CO2_MEASURED_VALUE = CO2_MEASUREMENT.attributes.require("measuredValue");
const TRUSTED_ROOT_CERTIFICATES = OPERATIONAL_CREDENTIALS.attributes.require("trustedRootCertificates");
const BASIC_COMMISSIONING_INFO = GENERAL_COMMISSIONING.attributes.require("basicCommissioningInfo");
const OCCUPANCY_SENSOR_TYPE = OCCUPANCY_SENSING.attributes.require("occupancySensorType");
const SERVER_LIST = DESCRIPTOR.attributes.require("serverList");

const ENDPOINT_0 = 0;
const ENDPOINT_1 = 1;

// Matter's MEI cluster-ID encoding puts a nonzero vendor-id prefix in the upper 16 bits for every
// manufacturer-specific cluster; standard clusters always have a zero prefix. Verified against a
// real chip-all-clusters-app's zap config, whose manufacturer-specific clusters (Fault Injection
// 0xFFF1FC06, Unit Testing 0xFFF1FC05, Test Hidden Manufacturer Specific 0xFFF1FC21) all fall in
// this range; matter.js's own all-clusters app defines none.
const MANUFACTURER_SPECIFIC_CLUSTER_THRESHOLD = 0x10000;

/** A single `AttributePathSpec`-wildcard entry read back from `readAttribute`. */
interface WildcardEntry {
    endpoint: number;
    cluster: number;
    attribute: number;
    value: unknown;
}

function isWildcardEntry(entry: unknown): entry is WildcardEntry {
    return (
        typeof entry === "object" &&
        entry !== null &&
        "endpoint" in entry &&
        "cluster" in entry &&
        "attribute" in entry &&
        typeof entry.endpoint === "number" &&
        typeof entry.cluster === "number" &&
        typeof entry.attribute === "number"
    );
}

/** Narrows a wildcard read's result, which `CertNodeApi.readAttribute` types as `unknown`. */
function asWildcardEntries(value: unknown): WildcardEntry[] {
    if (!Array.isArray(value) || !value.every(isWildcardEntry)) {
        throw new InternalError(
            `Expected a wildcard read to return {endpoint,cluster,attribute,value} entries, got ${JSON.stringify(value)}`,
        );
    }
    return value;
}

function distinct<T>(values: T[]): T[] {
    return [...new Set(values)];
}

/** Reads `spec` from `th` via `dut`, and checks the chip log for the matching `AttributePathIB`. */
async function readAndCheckLog(
    cx: CertStepContext,
    ref: string,
    spec: AttributePathSpec,
): Promise<{ value: unknown; logCheck: CheckRecord }> {
    const th = cx.devices.th;
    const dut = cx.controllers.dut;
    const from = th.log.mark();
    const value = await dut.node(ref).readAttribute(spec);
    const logCheck = await expectAttributePathIB(th.log, th.flavor, spec, from, 15_000);
    return { value, logCheck };
}

function recordLogCheck(cx: CertStepContext, logCheck: CheckRecord): void {
    cx.recorder.check(logCheck);
    if (logCheck.verdict === "fail") {
        throw new Error(`AttributePathIB log check failed: ${JSON.stringify(logCheck)}`);
    }
}

const commissioned = new CommissionedRefs();

certTest("TC-IDM-2.1", { plan: "interactiondatamodel.adoc", pics: ["MCORE.IDM.C.ReadRequest"], app: "all-clusters" })
    .step(
        1,
        "DUT sends the Read Request Message to the TH to read one attribute on a given cluster and endpoint. AttributePath = [[Endpoint = Specific Endpoint, Cluster = Specific ClusterID, Attribute = Specific Attribute]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION.id,
                attribute: VENDOR_ID.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = value === 0xfff1;
            cx.recorder.check({ type: "response", verdict: pass ? "pass" : "fail", detail: `VendorID = ${value}` });
            if (!pass) {
                throw new Error(`Expected VendorID 0xfff1, got ${JSON.stringify(value)}`);
            }
        },
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        2,
        "DUT sends the Read Request Message to the TH to read all attributes on a given cluster and Endpoint AttributePath = [[Endpoint = Specific Endpoint, Cluster = Specific ClusterID]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { endpoint: ENDPOINT_0, cluster: BASIC_INFORMATION.id };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const allBasicInformationAt0 = entries.every(
                entry => entry.endpoint === ENDPOINT_0 && entry.cluster === BASIC_INFORMATION.id,
            );
            const vendorIdEntry = entries.find(entry => entry.attribute === VENDOR_ID.id);
            const pass = allBasicInformationAt0 && entries.length > 5 && vendorIdEntry?.value === 0xfff1;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${entries.length} attributes, all BasicInformation@0: ${allBasicInformationAt0}, vendorId=${vendorIdEntry?.value}`,
            });
            if (!pass) {
                throw new Error(`Unexpected cluster-wildcard read result: ${JSON.stringify(entries)}`);
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        3,
        "DUT sends the Read Request Message to the TH to read all attributes in all clusters and all endpoints Path = [[ ]] On receipt of this message, TH should send a report data action with the attribute values to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {};
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const marker = entries.find(
                entry =>
                    entry.endpoint === ENDPOINT_0 &&
                    entry.cluster === BASIC_INFORMATION.id &&
                    entry.attribute === VENDOR_ID.id,
            );
            const pass = entries.length > 100 && marker?.value === 0xfff1;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${entries.length} attributes total, vendorId marker=${marker?.value}`,
            });
            if (!pass) {
                throw new Error(`Unexpected full-wildcard read result: ${entries.length} entries`);
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        4,
        "DUT sends the Read Request Message to the TH to read a specific attribute from all endpoints and all clusters. AttributePath = [[ Attribute = Specific Attribute]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { attribute: CLUSTER_REVISION.id };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const allClusterRevision = entries.every(entry => entry.attribute === CLUSTER_REVISION.id);
            const distinctClusters = distinct(entries.map(entry => entry.cluster));
            const distinctEndpoints = distinct(entries.map(entry => entry.endpoint));
            const pass = allClusterRevision && distinctClusters.length > 5 && distinctEndpoints.length >= 2;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${entries.length} entries across ${distinctClusters.length} clusters, ${distinctEndpoints.length} endpoints`,
            });
            if (!pass) {
                throw new Error(
                    `Unexpected attribute-wildcard read result: ${JSON.stringify({ distinctClusters, distinctEndpoints })}`,
                );
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        5,
        "DUT sends the Read Request Message to the TH to read all attributes from a specific cluster on all endpoints AttributePath = [[ Cluster = Specific ClusterID]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { cluster: DESCRIPTOR.id };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const allDescriptor = entries.every(entry => entry.cluster === DESCRIPTOR.id);
            const distinctEndpoints = distinct(entries.map(entry => entry.endpoint));
            const pass = allDescriptor && distinctEndpoints.length >= 2;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${entries.length} Descriptor attributes across endpoints ${distinctEndpoints.join(",")}`,
            });
            if (!pass) {
                throw new Error(
                    `Unexpected cluster-wildcard-across-endpoints result: ${JSON.stringify(distinctEndpoints)}`,
                );
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        6,
        "DUT sends the Read Request Message to the TH to read a specific attribute from a given cluster on all endpoints. AttributePath = [[ Cluster = Specific Cluster, Attribute = specific attribute]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { cluster: DESCRIPTOR.id, attribute: SERVER_LIST.id };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const allMatch = entries.every(
                entry =>
                    entry.cluster === DESCRIPTOR.id && entry.attribute === SERVER_LIST.id && Array.isArray(entry.value),
            );
            const distinctEndpoints = distinct(entries.map(entry => entry.endpoint));
            const pass = allMatch && distinctEndpoints.length >= 2;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `ServerList read at endpoints ${distinctEndpoints.join(",")}`,
            });
            if (!pass) {
                throw new Error(`Unexpected cluster+attribute-wildcard result: ${JSON.stringify(entries)}`);
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        7,
        "DUT sends the Read Request Message to the TH to read all attributes from all clusters at a given endpoint. AttributePath = [[ Endpoint = Specific Endpoint]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { endpoint: ENDPOINT_1 };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const allEndpoint1 = entries.every(entry => entry.endpoint === ENDPOINT_1);
            const distinctClusters = distinct(entries.map(entry => entry.cluster));
            const pass = allEndpoint1 && distinctClusters.length > 10;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `${entries.length} attributes across ${distinctClusters.length} clusters at endpoint 1`,
            });
            if (!pass) {
                throw new Error(`Unexpected endpoint-wildcard result: ${distinctClusters.length} clusters`);
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        8,
        "DUT sends the Read Request Message to the TH to a specific endpoint to read a particular attribute from all the clusters at that endpoint AttributePath = [[ Endpoint = Specific Endpoint, Attribute = specific attribute]] On receipt of this message, TH should send a report data action with the attribute value to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { endpoint: ENDPOINT_1, attribute: CLUSTER_REVISION.id };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const allMatch = entries.every(
                entry => entry.endpoint === ENDPOINT_1 && entry.attribute === CLUSTER_REVISION.id,
            );
            const distinctClusters = distinct(entries.map(entry => entry.cluster));
            const pass = allMatch && distinctClusters.length > 10;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `ClusterRevision read from ${distinctClusters.length} clusters at endpoint 1`,
            });
            if (!pass) {
                throw new Error(`Unexpected endpoint+attribute-wildcard result: ${distinctClusters.length} clusters`);
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .step(
        9,
        "DUT sends the Read Request Message to the TH to read an attribute of data type bool.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: ON_OFF.id,
                attribute: ON_OFF_ATTRIBUTE.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = typeof value === "boolean";
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `OnOff = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a bool value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_Bool",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        10,
        "DUT sends the Read Request Message to the TH to read an attribute of data type string.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: MODE_SELECT.id,
                attribute: DESCRIPTION.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = typeof value === "string";
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `ModeSelect.Description = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a string value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_String",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        11,
        "DUT sends the Read Request Message to the TH to read an attribute of data type unsigned integer.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL.id,
                attribute: CURRENT_LEVEL.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = value === null || (typeof value === "number" && value >= 0 && value <= 255);
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `LevelControl.CurrentLevel = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a uint8 value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_UnsignedInteger",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        12,
        "DUT sends the Read Request Message to the TH to read an attribute of data type signed integer.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: PRESSURE_MEASUREMENT.id,
                attribute: PRESSURE_MEASURED_VALUE.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = value === null || typeof value === "number";
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `PressureMeasurement.MeasuredValue = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected an int16 value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_SignedInteger",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        13,
        "DUT sends the Read Request Message to the TH to read an attribute of data type floating point.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: CO2_MEASUREMENT.id,
                attribute: CO2_MEASURED_VALUE.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = value === null || typeof value === "number";
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `CarbonDioxideConcentrationMeasurement.MeasuredValue = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a floating-point value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_FloatingPoint",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        14,
        "DUT sends the Read Request Message to the TH to read an attribute of data type Octet String.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: OPERATIONAL_CREDENTIALS.id,
                attribute: TRUSTED_ROOT_CERTIFICATES.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = Array.isArray(value) && value.length > 0 && value.every(cert => cert instanceof Uint8Array);
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `TrustedRootCertificates: ${Array.isArray(value) ? `${value.length} entries` : JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a non-empty list of octet strings, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_OctetString",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        15,
        "DUT sends the Read Request Message to the TH to read an attribute of data type Struct.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: GENERAL_COMMISSIONING.id,
                attribute: BASIC_COMMISSIONING_INFO.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass =
                typeof value === "object" &&
                value !== null &&
                !Array.isArray(value) &&
                "failSafeExpiryLengthSeconds" in value;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `BasicCommissioningInfo = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a BasicCommissioningInfo struct, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_Struct",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        16,
        "DUT sends the Read Request Message to the TH to read an attribute of data type List.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: MODE_SELECT.id,
                attribute: SUPPORTED_MODES.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = Array.isArray(value) && value.length > 0;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `ModeSelect.SupportedModes: ${Array.isArray(value) ? `${value.length} entries` : JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a non-empty list, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_List",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        17,
        "DUT sends the Read Request Message to the TH to read an attribute of data type enum.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: OCCUPANCY_SENSING.id,
                attribute: OCCUPANCY_SENSOR_TYPE.id,
            };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = typeof value === "number";
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `OccupancySensing.OccupancySensorType = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected an enum (number) value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_Enum",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        18,
        "DUT sends the Read Request Message to the TH to read an attribute of data type bitmap.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = { endpoint: ENDPOINT_1, cluster: LEVEL_CONTROL.id, attribute: OPTIONS.id };
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const pass = typeof value === "object" && value !== null;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `LevelControl.Options = ${JSON.stringify(value)}`,
            });
            if (!pass) {
                throw new Error(`Expected a bitmap value, got ${JSON.stringify(value)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.ReadRequest.Attribute.DataType_Bitmap",
            expected: "Verify that the TH receives the right Read Request Message.",
        },
    )
    .step(
        19,
        "DUT sends the Read Request Message to the TH to read an attribute Repeat the above steps 3 times.",
        commissioned.withRef("dut", async (cx, ref) => {
            const spec: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: ON_OFF.id,
                attribute: ON_OFF_ATTRIBUTE.id,
            };
            const values = new Array<unknown>();
            for (let i = 0; i < 3; i++) {
                const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
                recordLogCheck(cx, logCheck);
                values.push(value);
            }

            const allBoolean = values.every(value => typeof value === "boolean");
            const allSame = values.every(value => value === values[0]);
            const pass = allBoolean && allSame;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail: `3 reads: ${JSON.stringify(values)}`,
            });
            if (!pass) {
                throw new Error(`Expected 3 identical bool reads, got ${JSON.stringify(values)}`);
            }
        }),
        { expected: "On the TH verify the received Read Request message is same for all the 3 times." },
    )
    .step(
        20,
        "DUT sends the Read Request Message to the TH to read something(Attribute) which is larger than 1 MTU(1280 bytes) and per spec can be chunked. For every chunked data message received, except the last one, DUT sends a status response.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const from = th.log.mark();

            const spec: AttributePathSpec = {};
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const pass = entries.length > 100;
            cx.recorder.check({
                type: "response",
                verdict: pass ? "pass" : "fail",
                detail:
                    `${entries.length} attributes returned (proxy for exceeding 1 MTU; the adapter's ` +
                    `high-level readAttribute does not expose per-chunk StatusResponse acking)`,
            });
            if (!pass) {
                throw new Error(`Expected a large wildcard read (>100 attributes), got ${entries.length}`);
            }

            const chunkCheck = await expectChunkedTransfer(th.log, th.flavor, from, 15_000);
            cx.recorder.check(chunkCheck);
            if (chunkCheck.verdict === "fail") {
                throw new Error(`Chunked-transfer log check failed: ${JSON.stringify(chunkCheck)}`);
            }
        }),
        {
            expected:
                "Verify on the TH that the DUT sends a status message back to the TH on receipt of the report data action for every chunked message except the last one. Verify that the last chunked message DUT does not send a status response back.",
        },
    )
    .step(
        21,
        "DUT sends the Read Request Message to the TH with Manufacturer specific clusters and attributes to read all attributes in all clusters and all endpoints Path = [[ ]]. On receipt of this message, TH should send a report data action with the attribute values to the DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const spec: AttributePathSpec = {};
            const { value, logCheck } = await readAndCheckLog(cx, ref, spec);
            recordLogCheck(cx, logCheck);

            const entries = asWildcardEntries(value);
            const sizePass = entries.length > 100;
            cx.recorder.check({
                type: "response",
                verdict: sizePass ? "pass" : "fail",
                detail: `${entries.length} attributes returned`,
            });

            const manufacturerSpecificClusters = distinct(
                entries
                    .filter(entry => entry.cluster >= MANUFACTURER_SPECIFIC_CLUSTER_THRESHOLD)
                    .map(entry => entry.cluster),
            );
            const foundIds = manufacturerSpecificClusters.map(id => `0x${id.toString(16)}`).join(", ");

            if (th.flavor.startsWith("chip")) {
                const msPass = manufacturerSpecificClusters.length > 0;
                cx.recorder.check({
                    type: "response",
                    verdict: msPass ? "pass" : "fail",
                    detail: msPass
                        ? `Manufacturer-specific clusters found: ${foundIds}`
                        : "No manufacturer-specific cluster (>=0x10000) found in the wildcard read",
                });
                if (!sizePass || !msPass) {
                    throw new Error(
                        `Unexpected full-wildcard read result: ${entries.length} entries, MS clusters [${foundIds}]`,
                    );
                }
            } else {
                cx.recorder.check({
                    type: "response",
                    verdict: "unverified",
                    detail: "matter.js all-clusters app defines no manufacturer-specific cluster",
                });
                if (!sizePass) {
                    throw new Error(`Expected a large wildcard read (>100 attributes), got ${entries.length}`);
                }
            }
        }),
        { expected: "Verify that the TH receives the right Read Request Message." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
