/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient } from "#behaviors/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { newPreset, PRESETS_ATTRIBUTE, presetsEndpoint, recordThermostatChanges } from "./preset-helpers.js";

async function commissionedThermostat() {
    const site = new MockSite();
    const deviceEp = presetsEndpoint();
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
                value: [newPreset()],
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

        await writePresets(ep1, [newPreset()]);

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

        expect(deviceAnnouncements.filter(attrs => attrs.includes(PRESETS_ATTRIBUTE))).length(1);

        // The controller learns the handle the device generated, so it can address the preset in a later write
        const cached = cachedPresets(ep1);
        expect(cached.length).equals(1);
        expect(cached[0].presetHandle?.byteLength).equals(16);
        expect(clientReports[clientReports.length - 1][0].presetHandle?.byteLength).equals(16);
    });

    it("declines a write outside an atomic write", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await expect(writePresets(ep1, [newPreset()])).rejectedWith("Multiple writes failed");

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
        expect(cachedPresets(ep1).length).equals(0);
    });

    it("declines a preset carrying a handle the device does not know", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writePresets(ep1, [newPreset({ presetHandle: new Uint8Array([1, 2, 3, 4]) })])).rejectedWith(
            "Not found",
        );

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
        expect(cachedPresets(ep1).length).equals(0);
    });

    it("declines two presets that share a scenario and carry no name", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);

        // The decoded payload omits an absent name where a locally written preset carries null, and the
        // specification counts "no name" as a value that may not repeat within a scenario
        await expect(writePresets(ep1, [newPreset(), newPreset()])).rejectedWith("Constraint error");

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
    });

    it("declines a named preset when the preset type does not support names", async () => {
        await using ctx = await commissionedThermostat();
        const { ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writePresets(ep1, [newPreset({ name: "Home" })])).rejectedWith("Constraint error");
    });

    it("refuses a commit whose settled presets an observer stripped the handle from", async () => {
        await using ctx = await commissionedThermostat();
        const { device, deviceEp, ep1 } = ctx;

        deviceEp.events.thermostat.persistedPresets$Changing.on((presets: Thermostat.Preset[]) => {
            for (const preset of presets) {
                preset.presetHandle = null;
            }
        });

        const deviceAnnouncements = recordThermostatChanges(device);

        await beginWrite(ep1);
        await writePresets(ep1, [newPreset()]);

        // The command reports a generic failure; the reason travels in the attribute's status
        expect(await commitWrite(ep1)).deep.equals({
            statusCode: Status.Failure,
            attributeStatus: [{ attributeId: PRESETS_ATTRIBUTE, statusCode: Status.ConstraintError }],
        });

        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
        expect(deviceAnnouncements.filter(attrs => attrs.includes(PRESETS_ATTRIBUTE))).length(0);
    });

    it("discards a staged write on RollbackWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);
        await writePresets(ep1, [newPreset()]);

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
