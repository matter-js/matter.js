/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, Seconds } from "@matter/general";
import { Endpoint } from "@matter/main";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { ElectricalEnergyMeasurementServer } from "@matter/main/behaviors/electrical-energy-measurement";
import { ElectricalPowerMeasurementServer } from "@matter/main/behaviors/electrical-power-measurement";
import { GeneralDiagnosticsServer } from "@matter/main/behaviors/general-diagnostics";
import { ValidationError } from "@matter/main/types";
import { AllDevicesTestInstance } from "../../src/AllDevicesTestInstance.js";
import { listDeviceTypes, listLeafDeviceTypes } from "../../src/devices/DeviceTypeRegistry.js";

function setupWith(...appArgs: string[]) {
    return new AllDevicesTestInstance({ commandPipeFactory: async () => {}, appArgs }).setupServer();
}

describe("AllDevicesTestInstance --device", () => {
    it("refuses an endpoint number that is not a valid endpoint", async () => {
        await expect(setupWith("--device", "on-off-light:0")).rejectedWith(
            ValidationError,
            'Invalid endpoint in --device "on-off-light:0"',
        );
        await expect(setupWith("--device", "on-off-light:0xffff")).rejectedWith(ValidationError, "Invalid endpoint");
    });

    it("refuses an unsupported device type", async () => {
        await expect(setupWith("--device", "on-off-light", "--device", "no-such-device")).rejectedWith(
            ValidationError,
            'unsupported --device "no-such-device"',
        );
    });

    it("adds an aggregator on endpoint 1 without --device", async () => {
        const node = await setupWith();
        try {
            expect([...node.parts].map(({ number, type }) => [number, type.name])).deep.equals([[1, "Aggregator"]]);
        } finally {
            await node.close();
        }
    });

    it("adds every leaf device type for * on a node with groupcast", async () => {
        const node = await setupWith("--device", "*", "--groupcast");
        try {
            expect([...node.parts].length).equals(listLeafDeviceTypes().length);

            const numbers = new Array<number>();
            const collect = (endpoint: Endpoint) => {
                for (const part of endpoint.parts) {
                    numbers.push(part.number);
                    collect(part);
                }
            };
            collect(node);
            expect(new Set(numbers).size).equals(numbers.length);
        } finally {
            await node.close();
        }
    });

    it("numbers the devices of *:N from N", async () => {
        const node = await setupWith("--device", "*:3");
        try {
            const numbers = [...node.parts].map(({ number }) => number);
            expect(numbers.slice(0, listLeafDeviceTypes().length)).deep.equals(
                listLeafDeviceTypes().map((_type, index) => 3 + index),
            );
        } finally {
            await node.close();
        }
    });

    it("refuses an endpoint number given twice", async () => {
        await expect(setupWith("--device", "on-off-light:3", "--device", "dimmable-light:3")).rejectedWith(
            ValidationError,
            "Endpoint 3 declared twice in --device flags",
        );
    });

    it("adds a device below the endpoint parent= names", async () => {
        const node = await setupWith("--device", "aggregator:1", "--device", "on-off-light:5,parent=1");
        try {
            expect(structureOf(node)).deep.equals([[1, "Aggregator", [[5, "OnOffLight", []]]]]);
        } finally {
            await node.close();
        }
    });

    it("wraps a bridged device in a bridged node named after it", async () => {
        const node = await setupWith("--device", "aggregator:1", "--device", "on-off-light:2,parent=1,bridged");
        try {
            expect(structureOf(node)).deep.equals([[1, "Aggregator", [[2, "BridgedNode", [[3, "OnOffLight", []]]]]]]);
            const [bridgedNode] = [...[...node.parts][0].parts];
            expect(bridgedNode.stateOf(BridgedDeviceBasicInformationServer).nodeLabel).equals("On Off Light");
        } finally {
            await node.close();
        }
    });

    it("bridges every leaf device below the aggregator for *,parent=1,bridged", async () => {
        const node = await setupWith("--device", "aggregator:1", "--device", "*,parent=1,bridged");
        try {
            const [aggregator, ...others] = [...node.parts];
            expect(aggregator.number).equals(1);
            expect(others).deep.equals([]);

            const bridgedNodes = [...aggregator.parts];
            expect(bridgedNodes.map(({ number }) => number)).deep.equals(
                listLeafDeviceTypes().map((_type, index) => 2 + 2 * index),
            );
            for (const bridgedNode of bridgedNodes) {
                expect(bridgedNode.type.name).equals("BridgedNode");
                expect([...bridgedNode.parts].map(({ number }) => number)).deep.equals([bridgedNode.number + 1]);
            }
        } finally {
            await node.close();
        }
    });

    it("refuses a --device value CHIP refuses", async () => {
        await expect(setupWith("--device", "on-off-light:2,color=red")).rejectedWith(
            ValidationError,
            'Unknown option "color=red"',
        );
        await expect(setupWith("--device", "bridged-node:2")).rejectedWith(ValidationError, "needs parent=");
        await expect(setupWith("--device", "on-off-light:1", "--device", "bridged-node:2,parent=1")).rejectedWith(
            ValidationError,
            'must be an aggregator, but endpoint 1 is "on-off-light"',
        );
        await expect(setupWith("--device", "on-off-light:2,parent=1")).rejectedWith(
            ValidationError,
            "Parent endpoint 1",
        );
    });

    it("leaves only the aggregator and the bridged node out of *", () => {
        const leaves = listLeafDeviceTypes();
        expect(leaves).include.members(["on-off-light", "electrical-sensor"]);
        expect(leaves).not.include.members(["aggregator"]);
        expect(leaves).not.include.members(["bridged-node"]);
        expect(leaves.length).equals(listDeviceTypes().length - 2);
    });

    it("refuses an endpoint number that is not a plain decimal up to 0xfffe", async () => {
        for (const value of ["on-off-light:65535", "on-off-light:03", "on-off-light:3x"]) {
            await expect(setupWith("--device", value)).rejectedWith(ValidationError, "Invalid endpoint");
        }
    });

    it("skips an empty option", async () => {
        const node = await setupWith("--device", "on-off-light:3,");
        try {
            expect(structureOf(node)).deep.equals([[3, "OnOffLight", []]]);
        } finally {
            await node.close();
        }
    });

    it("numbers bridged wildcard devices after a numbered bridged device", async () => {
        const node = await setupWith(
            "--device",
            "aggregator:1",
            "--device",
            "on-off-light:2,parent=1,bridged",
            "--device",
            "*,parent=1,bridged",
        );
        try {
            const bridgedNodes = [...[...node.parts][0].parts].map(({ number }) => number);
            expect(bridgedNodes).deep.equals([2, ...listLeafDeviceTypes().map((_type, index) => 4 + 2 * index)]);
        } finally {
            await node.close();
        }
    });

    it("continues numbering after each numbered or bridged *", async () => {
        const node = await setupWith(
            "--device",
            "aggregator:1",
            "--device",
            "*:2",
            "--device",
            "*,parent=1,bridged",
            "--device",
            "*,parent=1,bridged",
        );
        try {
            const count = listLeafDeviceTypes().length;
            const bridgedNodes = [...[...node.parts][0].parts].map(({ number }) => number);
            expect(bridgedNodes).deep.equals(
                Array.from({ length: 2 * count }, (_entry, index) => 2 + count + 2 * index),
            );
        } finally {
            await node.close();
        }
    });

    it("does not wrap a bridged node in another bridged node", async () => {
        const node = await setupWith("--device", "aggregator:1", "--device", "bridged-node:2,parent=1,bridged");
        try {
            expect(structureOf(node)).deep.equals([[1, "Aggregator", [[2, "BridgedNode", []]]]]);
        } finally {
            await node.close();
        }
    });

    it("refuses a parent declared after its child", async () => {
        await expect(setupWith("--device", "on-off-light:2,parent=1", "--device", "aggregator:1")).rejectedWith(
            ValidationError,
            "Parent endpoint 1",
        );
    });

    it("refuses bridged without an endpoint number", async () => {
        await expect(setupWith("--device", "aggregator:1", "--device", "chime,parent=1,bridged")).rejectedWith(
            ValidationError,
            '"bridged" needs an endpoint number',
        );
    });
});

describe("AllDevicesTestInstance electrical-sensor", () => {
    const enableKey = Bytes.fromHex("000102030405060708090a0b0c0d0e0f");

    async function withSensor(fn: (node: Awaited<ReturnType<typeof setupWith>>, sensor: Endpoint) => Promise<void>) {
        const node = await setupWith(
            "--device",
            "electrical-sensor:1",
            "--enable-key",
            "000102030405060708090a0b0c0d0e0f",
        );
        MockTime.enable();
        try {
            const [sensor] = [...node.parts];
            await fn(node, sensor);
        } finally {
            MockTime.disable();
            await node.close();
        }
    }

    /** Advances mock time and waits for the reading that the periodic timer commits in its own transaction. */
    async function nextReading(sensor: Endpoint, interval: Duration) {
        const changed = new Promise(resolve =>
            sensor.eventsOf(ElectricalPowerMeasurementServer).activePower$Changed.once(resolve),
        );
        await MockTime.advance(interval.valueOf());
        await changed;
    }

    async function trigger(node: Awaited<ReturnType<typeof setupWith>>, eventTrigger: bigint) {
        await node.act(agent => agent.get(GeneralDiagnosticsServer).testEventTrigger({ enableKey, eventTrigger }));
    }

    it("reads a fake 1 kW load every 2 s until the stop trigger", async () => {
        await withSensor(async (node, sensor) => {
            await trigger(node, 0x0091_0001_0000_0001n);
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(980_000);
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).voltage).equals(229_000);
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activeCurrent).equals(3_848);
            const energy = sensor.stateOf(ElectricalEnergyMeasurementServer);
            expect(energy).nested.property("cumulativeEnergyImported.energy", 544);
            expect(energy).nested.property("periodicEnergyExported.energy", 0);

            await nextReading(sensor, Seconds(2));
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(985_000);
            expect(sensor.stateOf(ElectricalEnergyMeasurementServer)).nested.property(
                "cumulativeEnergyImported.energy",
                544 + 547,
            );

            await trigger(node, 0x0091_0001_0000_0000n);
            await MockTime.advance(Seconds(4).valueOf());
            await new Promise(resolve => setImmediate(resolve));
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(985_000);
        });
    });

    it("reads a fake 3 kW generator on a trigger for all endpoints", async () => {
        await withSensor(async (node, sensor) => {
            await trigger(node, 0x0091_0000_0000_0002n);
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(-3_020_000);
            const energy = sensor.stateOf(ElectricalEnergyMeasurementServer);
            expect(energy).nested.property("periodicEnergyExported.energy", 4194);
            expect(energy).nested.property("periodicEnergyImported.energy", 0);

            await nextReading(sensor, Seconds(5));
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(-3_015_000);
            expect(sensor.stateOf(ElectricalEnergyMeasurementServer)).nested.property(
                "cumulativeEnergyExported.energy",
                4194 + 4187,
            );

            await trigger(node, 0x0091_0000_0000_0000n);
        });
    });

    it("restarts the readings with the new load", async () => {
        await withSensor(async (node, sensor) => {
            await trigger(node, 0x0091_0000_0000_0001n);
            await trigger(node, 0x0091_0000_0000_0002n);
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(-3_015_000);
            const energy = sensor.stateOf(ElectricalEnergyMeasurementServer);
            expect(energy).nested.property("cumulativeEnergyImported.energy", 0);
            expect(energy).nested.property("cumulativeEnergyExported.energy", 4187);

            await MockTime.advance(Seconds(2).valueOf());
            await new Promise(resolve => setImmediate(resolve));
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(-3_015_000);

            await nextReading(sensor, Seconds(3));
            expect(sensor.stateOf(ElectricalPowerMeasurementServer).activePower).equals(-3_010_000);
        });
    });

    it("refuses an unknown energy reporting trigger", async () => {
        await withSensor(async node => {
            await expect(trigger(node, 0x0091_0000_0000_0003n)).rejectedWith("Wrong test event");
        });
    });

    it("refuses a trigger for another endpoint", async () => {
        await withSensor(async node => {
            await expect(trigger(node, 0x0091_0002_0000_0001n)).rejectedWith("Wrong test event");
        });
    });
});

type Structure = [number, string, Structure[]];

function structureOf(endpoint: Endpoint): Structure[] {
    return [...endpoint.parts].map(part => [part.number, part.type.name, structureOf(part)]);
}
