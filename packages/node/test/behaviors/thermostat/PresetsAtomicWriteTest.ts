/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient, ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { ServerNode } from "#node/ServerNode.js";
import { Write } from "@matter/protocol";
import { AttributeId, EndpointNumber } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import { subscribedPeer } from "../../node/node-helpers.js";

const PresetsThermostat = ThermostatDevice.with(ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets"));

const PRESETS_ATTRIBUTE = Thermostat.attributes.presets.id;

const NEW_PRESET = {
    presetHandle: null,
    presetScenario: Thermostat.PresetScenario.Occupied,
    coolingSetpoint: 2600,
    heatingSetpoint: 2000,
    builtIn: false,
};

function deviceEndpoint() {
    return new Endpoint(PresetsThermostat, {
        number: 1,
        thermostat: {
            controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
            systemMode: Thermostat.SystemMode.Auto,
            occupiedHeatingSetpoint: 2000,
            occupiedCoolingSetpoint: 2600,
            minSetpointDeadBand: 25,
            numberOfPresets: 5,
            presetTypes: [
                {
                    presetScenario: Thermostat.PresetScenario.Occupied,
                    numberOfPresets: 5,

                    // SupportsNames is absent, so a preset carrying "name" is refused
                    presetTypeFeatures: {},
                },
            ],
            activePresetHandle: null,
            presets: [],
        },
    });
}

/**
 * Records the attribute IDs the device announces as changed for the thermostat cluster.  This is the only input a
 * server subscription has for attribute reports, so it decides what a subscribed controller learns.
 */
function recordThermostatChanges(device: ServerNode) {
    const announcements = new Array<AttributeId[]>();
    device.protocol.attrsChanged.on((_endpointId, clusterId, attrs) => {
        if (clusterId === Thermostat.id) {
            announcements.push([...attrs]);
        }
    });
    return announcements;
}

async function commissionedThermostat() {
    const site = new MockSite();
    const deviceEp = deviceEndpoint();
    const { controller, device } = await site.addCommissionedPair({
        device: { type: MockServerNode.RootEndpoint, device: deviceEp },
    });

    const peer1 = await subscribedPeer(controller, "peer1");
    const ep1 = peer1.parts.get("ep1")!;
    expect(ep1).not.undefined;

    return { device, deviceEp, ep1, [Symbol.asyncDispose]: () => site[Symbol.asyncDispose]() };
}

function beginWrite(ep1: Endpoint) {
    return MockTime.resolve(
        ep1.commandsOf(ThermostatClient).atomicRequest({
            requestType: Thermostat.RequestType.BeginWrite,
            attributeRequests: [PRESETS_ATTRIBUTE],
            timeout: 5000,
        }),
    );
}

function commitWrite(ep1: Endpoint) {
    return MockTime.resolve(
        ep1.commandsOf(ThermostatClient).atomicRequest({
            requestType: Thermostat.RequestType.CommitWrite,
            attributeRequests: [PRESETS_ATTRIBUTE],
        }),
    );
}

function cachedPresets(ep1: Endpoint) {
    return ep1.stateOf(ThermostatClient).presets ?? [];
}

function writePresets(ep1: Endpoint, presets: Thermostat.Preset[]) {
    return MockTime.resolve(
        ep1.act(agent => {
            agent.get(ThermostatClient).state.presets = presets;
        }),
    );
}

describe("Presets atomic write", () => {
    before(() => {
        MockTime.init();
    });

    it("encodes a whole-list assignment as replace-all followed by ADD", () => {
        const write = Write(
            Write.Attribute({
                endpoint: EndpointNumber(1),
                cluster: Thermostat,
                attributes: "presets",
                value: [NEW_PRESET],
            }),
        );

        expect(write.writeRequests.map(({ path }) => path.listIndex)).deep.equals([undefined, null]);
    });

    it("applies presets through BeginWrite, write and CommitWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { device, deviceEp, ep1 } = ctx;

        const deviceAnnouncements = recordThermostatChanges(device);
        const clientReports = new Array<Thermostat.Preset[]>();
        ep1.eventsOf(ThermostatClient).presets$Changed.on(value => void clientReports.push([...value]));

        expect(await beginWrite(ep1)).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: PRESETS_ATTRIBUTE, statusCode: 0 }],
            timeout: 5000,
        });

        await writePresets(ep1, [NEW_PRESET]);

        // The write is staged only; the device's stored value stays empty until commit
        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);

        expect(await commitWrite(ep1)).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: PRESETS_ATTRIBUTE, statusCode: 0 }],
        });

        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        const persisted = deviceEp.state.thermostat.persistedPresets!;
        expect(persisted.length).equals(1);
        expect(persisted[0].presetHandle?.byteLength).equals(16);
        expect(persisted[0].presetScenario).equals(Thermostat.PresetScenario.Occupied);
        expect(persisted[0].coolingSetpoint).equals(2600);
        expect(persisted[0].heatingSetpoint).equals(2000);
        expect(persisted[0].builtIn).equals(false);

        // Characterization: the device announces the change under the name of the field behind the attribute, which
        // carries no attribute id, so the announcement names nothing and no report reaches the subscriber.  The
        // controller therefore never learns the handle the device generated and cannot address the preset in a later
        // write without reading it back explicitly
        expect(deviceAnnouncements).deep.equals([[]]);
        expect(clientReports.map(presets => presets.map(({ presetHandle }) => presetHandle))).deep.equals([[null]]);
        expect(cachedPresets(ep1)[0]?.presetHandle).equals(null);
    });

    it("declines a write outside an atomic write", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await expect(writePresets(ep1, [NEW_PRESET])).rejectedWith("Multiple writes failed");

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
        expect(cachedPresets(ep1).length).equals(0);
    });

    it("declines a preset carrying a handle the device does not know", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writePresets(ep1, [{ ...NEW_PRESET, presetHandle: new Uint8Array([1, 2, 3, 4]) }])).rejectedWith(
            "Not found",
        );

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
        expect(cachedPresets(ep1).length).equals(0);
    });

    it("declines a named preset when the preset type does not support names", async () => {
        await using ctx = await commissionedThermostat();
        const { ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writePresets(ep1, [{ ...NEW_PRESET, name: "Home" }])).rejectedWith("Constraint error");
    });

    it("discards a staged write on RollbackWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);
        await writePresets(ep1, [NEW_PRESET]);

        expect(
            await MockTime.resolve(
                ep1.commandsOf(ThermostatClient).atomicRequest({
                    requestType: Thermostat.RequestType.RollbackWrite,
                    attributeRequests: [PRESETS_ATTRIBUTE],
                }),
            ),
        ).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: PRESETS_ATTRIBUTE, statusCode: 0 }],
        });

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
    });
});
