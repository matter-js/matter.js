/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Environment, MockStorageService, StorageService } from "@matter/general";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { StatusResponse } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import {
    newPreset,
    PresetsThermostat,
    PresetsThermostatServer,
    thermostatConfig,
    unconfiguredPresetsEndpoint,
} from "./preset-helpers.js";

function writePresets(deviceEp: Endpoint<typeof PresetsThermostat>, presets: Thermostat.Preset[]) {
    return MockTime.resolve(deviceEp.set({ thermostat: { presets } }), { macrotasks: true });
}

describe("Presets configuration", () => {
    before(() => MockTime.init());

    it("declines a remote write outside an atomic write when the application configured no presets", async () => {
        await using site = new MockSite();
        const deviceEp = unconfiguredPresetsEndpoint();
        const { controller } = await site.addCommissionedPair({
            device: { type: MockServerNode.RootEndpoint, device: deviceEp },
        });
        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;

        // Presets carries quality T, so a client may only write it inside an atomic write
        const write = () =>
            MockTime.resolve(
                ep1.act(agent => {
                    agent.get(ThermostatClient).state.presets = [newPreset()];
                }),
            );

        await expect(write()).rejected;
        expect(deviceEp.state.thermostat.presets).deep.equals([]);

        // The same write inside an atomic write is accepted, so the refusal above is the atomicity rule rather than
        // the endpoint failing to serve the attribute at all
        await MockTime.resolve(
            ep1.commandsOf(ThermostatClient).atomicRequest({
                requestType: Thermostat.RequestType.BeginWrite,
                attributeRequests: [Thermostat.attributes.presets.id],
                timeout: 5000,
            }),
        );
        await write();
        await MockTime.resolve(
            ep1.commandsOf(ThermostatClient).atomicRequest({
                requestType: Thermostat.RequestType.CommitWrite,
                attributeRequests: [Thermostat.attributes.presets.id],
            }),
        );
        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        expect(deviceEp.state.thermostat.presets.length).equals(1);
        expect(deviceEp.state.thermostat.presets[0].presetHandle?.byteLength).equals(16);
    });

    it("validates a local write when the application configured no presets", async () => {
        const deviceEp = unconfiguredPresetsEndpoint();
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
        expect(node.lifecycle.isOnline).true;

        await expect(writePresets(deviceEp, [newPreset({ presetHandle: new Uint8Array([1, 2, 3, 4]) })])).rejectedWith(
            StatusResponse.NotFoundError,
            "does not exist in old Presets",
        );

        await writePresets(deviceEp, [newPreset()]);
        expect(deviceEp.state.thermostat.presets[0].presetHandle?.byteLength).equals(16);
    });

    it("serves presets a behavior type supplies as its own default", async () => {
        const preset = newPreset({ presetHandle: new Uint8Array(16).fill(9) });
        const Configured = PresetsThermostatServer.set({ ...thermostatConfig(), presets: [preset] });
        const deviceEp = new Endpoint(ThermostatDevice.with(Configured), { id: "thermostat", number: 1 });

        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
        expect(node.lifecycle.isOnline).true;

        const presets = deviceEp.state.thermostat.presets;
        expect(presets.length).equals(1);
        expect(presets[0].presetHandle).deep.equals(preset.presetHandle);
    });

    it("leaves the presets a behavior type supplies untouched", async () => {
        const preset = newPreset();
        const Configured = PresetsThermostatServer.set({ ...thermostatConfig(), presets: [preset] });

        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
            device: new Endpoint(ThermostatDevice.with(Configured), { id: "thermostat", number: 1 }),
        });
        expect(node.lifecycle.isOnline).true;

        // Every endpoint of a type shares that type's defaults, and validation issues handles into the presets it is
        // given
        expect(preset.presetHandle).equals(null);
        expect((Configured.defaults.presets as Thermostat.Preset[])[0].presetHandle).equals(null);
    });

    it("seeds from configuration, not from presets a device stored before the accessor existed", async () => {
        const environment = new Environment("test");
        const storage = new MockStorageService(environment);
        environment.set(StorageService, storage);
        const context = `root.parts.${unconfiguredPresetsEndpoint().id}.${PresetsThermostatServer.id}`;

        {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device: unconfiguredPresetsEndpoint(),
                environment,
            });
            await node.close();
        }

        // What a device left behind while the attribute was an ordinary stored value: written with no validation,
        // so it carries no handle and no client can address it
        const values = storage.store("node0").data;
        expect(values[context], "the thermostat's stored values").not.undefined;
        values[context].presets = [newPreset()] as never;

        // Without this the seed never runs, so the stale value could not have been consulted either way
        delete values[context].persistedPresets;

        {
            const deviceEp = unconfiguredPresetsEndpoint();
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device: deviceEp,
                environment,
            });

            expect(deviceEp.state.thermostat.presets).deep.equals([]);

            await node.close();
        }
    });
});
