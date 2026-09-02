/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AmbientContextSensingServer } from "#behaviors/ambient-context-sensing";
import { OccupancySensingServer } from "#behaviors/occupancy-sensing";
import { SoilMeasurementServer } from "#behaviors/soil-measurement";
import { OccupancySensorDevice } from "#devices/occupancy-sensor";
import { SoilSensorDevice } from "#devices/soil-sensor";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { AttributeWriteResponse, ConstraintError, Write } from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    MeasurementType,
    Status,
    TlvUInt16,
    WriteRequest,
} from "@matter/types";
import { OccupancySensing } from "@matter/types/clusters/occupancy-sensing";
import { MockServerNode } from "./mock-server-node.js";

const HOLD_TIME_LIMITS = { holdTimeMin: 10, holdTimeMax: 100, holdTimeDefault: 50 };

const OccupancyDevice = OccupancySensorDevice.with(
    OccupancySensingServer.with("PassiveInfrared").set({
        occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
        holdTime: 50,
        holdTimeLimits: HOLD_TIME_LIMITS,
    }),
);

const AmbientContextSensingEndpoint = MutableEndpoint({
    name: "AmbientContextSensingTest",
    deviceType: 0x0015,
    deviceRevision: 1,
}).with(
    AmbientContextSensingServer.with("HumanActivity").set({
        holdTime: 50,
        holdTimeLimits: HOLD_TIME_LIMITS,
    }),
);

const SOIL_LIMITS = {
    measurementType: MeasurementType.SoilMoisture,
    measured: true,
    minMeasuredValue: 20,
    maxMeasuredValue: 80,
    accuracyRanges: [{ rangeMin: 20, rangeMax: 80, percentMax: 1000 }],
};

const SoilDevice = SoilSensorDevice.with(
    SoilMeasurementServer.set({
        soilMoistureMeasurementLimits: SOIL_LIMITS,
        soilMoistureMeasuredValue: 50,
    }),
);

const OCCUPANCY_HOLD_TIME = {
    endpointId: EndpointNumber(1),
    clusterId: ClusterId(0x406),
    attributeId: AttributeId(0x3),
};

const AMBIENT_CONTEXT_HOLD_TIME = {
    endpointId: EndpointNumber(1),
    clusterId: ClusterId(0x431),
    attributeId: AttributeId(0x9),
};

describe("dot-qualified constraint bounds", () => {
    describe("OccupancySensing.HoldTime", () => {
        it("accepts a value within the declared limits", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 50)).status).equals(Status.Success);
        });

        it("accepts the lower bound", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 10)).status).equals(Status.Success);
        });

        it("accepts the upper bound", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 100)).status).equals(Status.Success);
        });

        it("rejects a value below the declared limits", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 9)).status).equals(
                Status.ConstraintError,
            );
        });

        it("rejects a value above the declared limits", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 101)).status).equals(
                Status.ConstraintError,
            );
        });

        it("rejects the far end of the type range", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 65535)).status).equals(
                Status.ConstraintError,
            );
        });

        it("rejects zero", async () => {
            expect((await writeHoldTime(OccupancyDevice, OCCUPANCY_HOLD_TIME, 0)).status).equals(
                Status.ConstraintError,
            );
        });
    });

    describe("AmbientContextSensing.HoldTime", () => {
        it("accepts a value within the declared limits", async () => {
            expect((await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 50)).status).equals(
                Status.Success,
            );
        });

        it("accepts the lower bound", async () => {
            expect((await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 10)).status).equals(
                Status.Success,
            );
        });

        it("accepts the upper bound", async () => {
            expect((await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 100)).status).equals(
                Status.Success,
            );
        });

        it("rejects a value below the declared limits", async () => {
            expect((await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 9)).status).equals(
                Status.ConstraintError,
            );
        });

        it("rejects a value above the declared limits", async () => {
            expect((await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 101)).status).equals(
                Status.ConstraintError,
            );
        });

        it("rejects zero", async () => {
            expect((await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 0)).status).equals(
                Status.ConstraintError,
            );
        });

        it("rejects the far end of the type range", async () => {
            expect(
                (await writeHoldTime(AmbientContextSensingEndpoint, AMBIENT_CONTEXT_HOLD_TIME, 65535)).status,
            ).equals(Status.ConstraintError);
        });
    });

    // SoilMoistureMeasuredValue is "R V", so a client cannot reach it; the bound guards the developer instead
    describe("SoilMeasurement.SoilMoistureMeasuredValue", () => {
        it("accepts a value within the declared limits", async () => {
            expect(await setSoilMoisture(80)).equals(80);
        });

        it("accepts null", async () => {
            expect(await setSoilMoisture(null)).equals(null);
        });

        it("rejects a value below the declared limits", async () => {
            await expect(setSoilMoisture(19)).rejectedWith(
                ConstraintError,
                /soilMoistureMeasurementLimits\.minMeasuredValue to soilMoistureMeasurementLimits\.maxMeasuredValue/,
            );
        });

        it("rejects a value above the declared limits", async () => {
            await expect(setSoilMoisture(81)).rejectedWith(
                ConstraintError,
                /soilMoistureMeasurementLimits\.minMeasuredValue to soilMoistureMeasurementLimits\.maxMeasuredValue/,
            );
        });
    });

    // HoldTime is non-volatile, so a stored value outside the limits reaches validation when the behavior initializes
    describe("validation at behavior initialization", () => {
        it("accepts a configured value within the declared limits", async () => {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
            await node.add(OccupancyDevice);
        });

        it("refuses to initialize with a configured value outside the declared limits", async () => {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });

            let error: unknown;
            try {
                await node.add(
                    OccupancySensorDevice.with(
                        OccupancySensingServer.with("PassiveInfrared").set({
                            occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
                            holdTime: 5,
                            holdTimeLimits: HOLD_TIME_LIMITS,
                        }),
                    ),
                );
            } catch (e) {
                error = e;
            }

            const constraintErrors = errorsOf(error).filter(e => e instanceof ConstraintError);
            expect(constraintErrors.length).equals(1);
            expect(constraintErrors[0].message).match(/holdTimeLimits\.holdTimeMin to holdTimeLimits\.holdTimeMax/);
        });
    });
});

async function writeHoldTime(
    device: Parameters<MockServerNode["add"]>[0],
    path: { endpointId: EndpointNumber; clusterId: ClusterId; attributeId: AttributeId },
    value: number,
) {
    await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
    await node.add(device);

    const response = await writeAttrRawAsAdmin(node, {
        writeRequests: [{ path, data: TlvUInt16.encodeTlv(value) }],
    });

    return { status: response.data?.[0]?.status, counts: response.counts };
}

async function setSoilMoisture(value: number | null) {
    await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
    const endpoint = await node.add(SoilDevice);

    await endpoint.act(agent => {
        agent.get(SoilMeasurementServer).state.soilMoistureMeasuredValue = value;
    });

    return endpoint.act(agent => agent.get(SoilMeasurementServer).state.soilMoistureMeasuredValue);
}

function errorsOf(error: unknown): Error[] {
    if (!(error instanceof Error)) {
        return [];
    }

    const nested = error instanceof AggregateError ? [...error.errors] : [];
    if (error.cause !== undefined) {
        nested.push(error.cause);
    }

    return [error, ...nested.flatMap(errorsOf)];
}

async function writeAttrRawAsAdmin(node: MockServerNode, data: Partial<WriteRequest>) {
    const request = {
        suppressResponse: false,
        ...data,
    } as Write;

    const fabric = await node.addFabric();
    const exchange = await node.createExchange({ fabric });
    return node.online({ command: true, exchange }, async ({ context }) => {
        const response = new AttributeWriteResponse(node.protocol, context);
        return { data: await response.process(request), counts: response.counts };
    });
}
