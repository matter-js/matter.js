/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "@matter/main";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { DescriptorServer } from "@matter/main/behaviors/descriptor";
import { OnOffServer } from "@matter/main/behaviors/on-off";
import { PowerSourceServer } from "@matter/main/behaviors/power-source";
import { TemperatureMeasurementServer } from "@matter/main/behaviors/temperature-measurement";
import { PowerSource } from "@matter/main/clusters";
import { BridgeTestInstance } from "../../src/BridgeTestInstance.js";

/** The device types chip's bridge-app declares, which the bridge test plans read. */
const ON_OFF_LIGHT = 0x0100;
const TEMPERATURE_SENSOR = 0x0302;
const BRIDGED_NODE = 0x0013;
const POWER_SOURCE = 0x0011;
const AGGREGATOR = 0x000e;

async function bridge() {
    const instance = new BridgeTestInstance({ commandPipeFactory: async () => {} });
    await instance.initialize();
    return instance;
}

function endpoints(instance: BridgeTestInstance) {
    const found = new Map<number, Endpoint>();
    instance.node.visit(endpoint => {
        if (endpoint.number !== undefined) {
            found.set(endpoint.number, endpoint);
        }
    });
    return found;
}

function deviceTypesOf(endpoint: Endpoint) {
    return endpoint.stateOf(DescriptorServer).deviceTypeList.map(entry => Number(entry.deviceType));
}

function partsOf(endpoint: Endpoint) {
    return [...endpoint.stateOf(DescriptorServer).partsList].map(Number).sort((a, b) => a - b);
}

describe("BridgeTestInstance", () => {
    let instance: BridgeTestInstance;

    beforeEach(async () => {
        instance = await bridge();
    });

    afterEach(async () => {
        await instance.close();
    });

    it("exposes the endpoints chip's bridge-app assigns", async () => {
        const found = endpoints(instance);

        expect([...found.keys()].sort((a, b) => a - b)).deep.equal([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

        expect(deviceTypesOf(found.get(1)!)).contains(AGGREGATOR);
        for (const light of [3, 9, 10, 11, 12]) {
            expect(deviceTypesOf(found.get(light)!), `endpoint ${light}`).contains(ON_OFF_LIGHT);
        }
        for (const sensor of [4, 5, 7, 8]) {
            expect(deviceTypesOf(found.get(sensor)!), `endpoint ${sensor}`).contains(TEMPERATURE_SENSOR);
        }
    });

    it("declares the composed device as both a bridged node and its own power source", async () => {
        const composed = endpoints(instance).get(6)!;

        expect(deviceTypesOf(composed)).members([BRIDGED_NODE, POWER_SOURCE]);

        const powerSource = composed.stateOf(PowerSourceServer.with("Battery"));
        expect(powerSource.batChargeLevel).equal(PowerSource.BatChargeLevel.Ok);
        expect([...powerSource.endpointList].map(Number)).members([6, 7, 8]);
    });

    it("puts the composed device's sensors below it rather than below the aggregator", async () => {
        const found = endpoints(instance);

        expect(partsOf(found.get(6)!)).deep.equal([7, 8]);

        // An aggregator uses the full-family pattern, so its own list names every descendant
        // (Matter Core § 9.2.3) — the tree is what says which sensors belong to the composed device
        expect(partsOf(found.get(1)!)).deep.equal([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it("gives the composed device's sensors no bridged device information of their own", async () => {
        const found = endpoints(instance);

        expect(found.get(4)!.behaviors.has(BridgedDeviceBasicInformationServer)).equal(true);
        expect(found.get(7)!.behaviors.has(BridgedDeviceBasicInformationServer)).equal(false);
    });

    it("toggles the lights chip's own toggle names, leaving the action lights alone", async () => {
        const found = endpoints(instance);
        const before = found.get(3)!.stateOf(OnOffServer).onOff;

        await instance.backchannel({ name: "toggleBridgedLights" });

        expect(found.get(3)!.stateOf(OnOffServer).onOff).equal(!before);
        expect(found.get(9)!.stateOf(OnOffServer).onOff).equal(before);
    });

    it("warms every temperature sensor by one degree", async () => {
        const found = endpoints(instance);
        const before = [4, 5, 7, 8].map(
            number => found.get(number)!.stateOf(TemperatureMeasurementServer).measuredValue,
        );

        await instance.backchannel({ name: "warmBridgedTemperatureSensors" });

        const after = [4, 5, 7, 8].map(
            number => found.get(number)!.stateOf(TemperatureMeasurementServer).measuredValue,
        );
        expect(after).deep.equal(before.map(value => value! + 100));
    });

    it("renames the light chip's own rename names", async () => {
        const found = endpoints(instance);

        await instance.backchannel({ name: "renameBridgedLights" });

        expect(found.get(3)!.stateOf(BridgedDeviceBasicInformationServer).nodeLabel).equal("Light 1b");
        expect(found.get(9)!.stateOf(BridgedDeviceBasicInformationServer).nodeLabel).equal("Action Light 1");
    });

    it("adds the second light, and does nothing when it is already there", async () => {
        await instance.backchannel({ name: "addBridgedLight" });

        const added = endpoints(instance).get(13);
        expect(added).not.undefined;
        expect(deviceTypesOf(added!)).contains(ON_OFF_LIGHT);
        expect(added!.stateOf(BridgedDeviceBasicInformationServer).nodeLabel).equal("Light 2");
        expect(partsOf(endpoints(instance).get(1)!)).contains(13);

        // The endpoint map is keyed by endpoint number, so a duplicate could never show up in it;
        // the aggregator's own list is where one would. Without the guard the second add throws on
        // the endpoint id instead, which is the same claim from the other side
        const partsBefore = partsOf(endpoints(instance).get(1)!);
        await instance.backchannel({ name: "addBridgedLight" });
        expect(partsOf(endpoints(instance).get(1)!)).deep.equal(partsBefore);
    });

    it("removes the first light, and does nothing when it is already gone", async () => {
        await instance.backchannel({ name: "removeBridgedLight" });

        expect(endpoints(instance).has(3)).equal(false);
        expect(partsOf(endpoints(instance).get(1)!)).not.contains(3);

        await instance.backchannel({ name: "removeBridgedLight" });
        expect(endpoints(instance).has(3)).equal(false);
    });

    it("toggles a light that was added after the bridge started", async () => {
        await instance.backchannel({ name: "addBridgedLight" });
        const added = endpoints(instance).get(13)!;
        const before = added.stateOf(OnOffServer).onOff;

        await instance.backchannel({ name: "toggleBridgedLights" });

        expect(endpoints(instance).get(13)!.stateOf(OnOffServer).onOff).equal(!before);
    });

    it("renames a light that was added after the bridge started", async () => {
        await instance.backchannel({ name: "addBridgedLight" });

        await instance.backchannel({ name: "renameBridgedLights" });

        expect(endpoints(instance).get(13)!.stateOf(BridgedDeviceBasicInformationServer).nodeLabel).equal("Light 2b");
    });
});
