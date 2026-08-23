/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/index.js";
import { Entropy, Environment, MemoryStorageDriver, StorageManager, StorageService } from "@matter/general";
import { StatusResponse } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { MockServerNode } from "../../node/mock-server-node.js";
import {
    newPreset,
    PRESETS_ATTRIBUTE,
    presetsEndpoint,
    PresetsThermostat,
    thermostatConfig,
    PresetsThermostatServer,
    recordThermostatChanges,
} from "./preset-helpers.js";

async function thermostat(numberOfPresets?: number, presets?: Thermostat.Preset[]) {
    const deviceEp = presetsEndpoint(numberOfPresets, presets);
    const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
    return { node, deviceEp, [Symbol.asyncDispose]: () => node.close() };
}

function writePresets(deviceEp: Endpoint<typeof PresetsThermostat>, presets: Thermostat.Preset[]) {
    return MockTime.resolve(deviceEp.set({ thermostat: { presets } }), { macrotasks: true });
}

function storedPresets(deviceEp: Endpoint<typeof PresetsThermostat>) {
    return deviceEp.state.thermostat.persistedPresets!;
}

describe("Presets local write", () => {
    before(() => MockTime.init());

    it("stores a locally written preset and generates a handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);

        const stored = storedPresets(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].presetHandle?.byteLength).equals(16);
        expect(stored[0].coolingSetpoint).equals(2600);
        expect(stored[0].builtIn).equals(false);
    });

    it("stores presets written directly to persistedPresets", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await MockTime.resolve(deviceEp.set({ thermostat: { persistedPresets: [newPreset()] } }), { macrotasks: true });

        const stored = storedPresets(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].presetHandle?.byteLength).equals(16);
    });

    it("serves the stored presets through the attribute", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);

        const presets = deviceEp.state.thermostat.presets;
        expect(presets.length).equals(1);
        expect(presets[0].coolingSetpoint).equals(2600);
        expect(presets[0].heatingSetpoint).equals(2000);
        expect(presets[0].presetHandle?.byteLength).equals(16);
    });

    it("announces the attribute as changed", async () => {
        await using ctx = await thermostat();
        const { node, deviceEp } = ctx;

        const announcements = recordThermostatChanges(node);

        await writePresets(deviceEp, [newPreset()]);

        expect(announcements.filter(attrs => attrs.includes(PRESETS_ATTRIBUTE))).length(1);
    });

    it("announces nothing when the write is refused", async () => {
        await using ctx = await thermostat(2);
        const { node, deviceEp } = ctx;

        const announcements = recordThermostatChanges(node);

        await expect(writePresets(deviceEp, [newPreset(), newPreset(), newPreset()])).rejected;

        expect(announcements.filter(attrs => attrs.includes(PRESETS_ATTRIBUTE))).length(0);
    });

    it("keeps the generated handle across a restart", async () => {
        const environment = new Environment("test");
        const storage = new StorageManager(new MemoryStorageDriver());
        storage.close = () => {};
        await storage.initialize();
        environment.get(StorageService).open = () => Promise.resolve(storage);

        // MockCrypto's entropy is constant, so a handle regenerated on the second boot would be indistinguishable
        // from the persisted one
        let nextByte = 0;
        environment.set(
            Entropy,
            new (class extends Entropy {
                randomBytes(length: number) {
                    return new Uint8Array(length).fill(++nextByte);
                }
            })(),
        );

        let handle: Thermostat.Preset["presetHandle"];

        {
            await using node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            const deviceEp = presetsEndpoint();
            await node.add(deviceEp);

            await writePresets(deviceEp, [newPreset()]);
            handle = storedPresets(deviceEp)[0].presetHandle;
            expect(handle?.byteLength).equals(16);

            await node.close();
        }

        {
            await using node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            const deviceEp = presetsEndpoint();
            await node.add(deviceEp);

            expect(storedPresets(deviceEp).length).equals(1);
            expect(storedPresets(deviceEp)[0].presetHandle).deep.equals(handle);

            await node.close();
        }
    });

    it("keeps an element-wise edit inside the transaction that made it", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);

        await expect(
            MockTime.resolve(
                deviceEp.act(async agent => {
                    agent.get(PresetsThermostatServer).state.presets[0].heatingSetpoint = 2100;
                    throw new StatusResponse.FailureError("abandon the write");
                }),
                { macrotasks: true },
            ),
        ).rejected;

        expect(storedPresets(deviceEp)[0].heatingSetpoint).equals(2000);
    });

    it("edits a stored preset addressed by its handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);
        const handle = storedPresets(deviceEp)[0].presetHandle!;

        await writePresets(deviceEp, [newPreset({ presetHandle: handle, heatingSetpoint: 2100 })]);

        const stored = storedPresets(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].presetHandle).deep.equals(handle);
        expect(stored[0].heatingSetpoint).equals(2100);
    });

    it("rejects a preset citing an unknown handle and keeps the stored presets", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);
        const stored = [...storedPresets(deviceEp)];

        await expect(writePresets(deviceEp, [newPreset({ presetHandle: new Uint8Array([1, 2, 3, 4]) })])).rejectedWith(
            StatusResponse.NotFoundError,
            "does not exist in old Presets",
        );

        expect(storedPresets(deviceEp)).deep.equals(stored);
    });

    it("keeps accepting writes after an observer stored a preset with no handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        // An application observer registers after the behavior, so it runs after normalization, and reverting the
        // value it was given produces no further change for pre-commit to announce
        const revert = (presets: Thermostat.Preset[]) => {
            presets[0].presetHandle = null;
        };
        deviceEp.events.thermostat.persistedPresets$Changing.on(revert);

        await writePresets(deviceEp, [newPreset()]);
        expect(storedPresets(deviceEp)[0].presetHandle).equals(null);

        // A preset that carries no handle addresses nothing, but it must not make the thermostat unwritable
        deviceEp.events.thermostat.persistedPresets$Changing.off(revert);
        await writePresets(deviceEp, [newPreset({ heatingSetpoint: 2100 })]);

        const stored = storedPresets(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].heatingSetpoint).equals(2100);
        expect(stored[0].presetHandle?.byteLength).equals(16);
    });

    it("validates a change an observer makes after the thermostat normalized", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        // An application observer registers after the behavior, so it runs after normalization; only the first
        // announcement that follows is the normalization coming back around
        deviceEp.events.thermostat.persistedPresets$Changing.on(presets => {
            if (presets[0].heatingSetpoint === 2000) {
                presets[0].heatingSetpoint = 3100;
            }
        });

        await expect(writePresets(deviceEp, [newPreset()])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "out of bounds",
        );

        expect(storedPresets(deviceEp)).deep.equals([]);
    });

    it("validates every write that shares one transaction", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        const unknownHandle = [newPreset({ presetHandle: new Uint8Array([1, 2, 3, 4]) })];

        const rejections = new Array<string>();

        await MockTime.resolve(
            deviceEp.act(async agent => {
                const thermostat = agent.get(PresetsThermostatServer);

                // The responder commits per attribute and continues on the same transaction, so a refused write must
                // not leave the next one unvalidated
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        thermostat.state.presets = unknownHandle;
                        await agent.context.transaction.commit();
                        rejections.push("accepted");
                    } catch (error) {
                        rejections.push((error as Error).message);
                    }
                }
            }),
            { macrotasks: true },
        );

        expect(rejections).length(2);
        for (const rejection of rejections) {
            expect(rejection).contains("does not exist in old Presets");
        }

        expect(storedPresets(deviceEp)).deep.equals([]);
    });

    it("validates again after a write it had accepted was rolled back", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        // An application reactor that refuses the change rolls back a write the thermostat had already validated
        deviceEp.events.thermostat.persistedPresets$Changing.on(() => {
            throw new StatusResponse.ConstraintErrorError("application refuses these presets");
        });

        const outcomes = new Array<string>();

        await MockTime.resolve(
            deviceEp.act(async agent => {
                const thermostat = agent.get(PresetsThermostatServer);

                for (const presets of [[newPreset()], [newPreset({ presetHandle: new Uint8Array([1, 2, 3, 4]) })]]) {
                    try {
                        thermostat.state.presets = presets;
                        await agent.context.transaction.commit();
                        outcomes.push("accepted");
                    } catch (error) {
                        outcomes.push((error as Error).message);
                    }
                }
            }),
            { macrotasks: true },
        );

        expect(outcomes[0]).contains("application refuses these presets");
        expect(outcomes[1]).contains("does not exist in old Presets");
        expect(storedPresets(deviceEp)).deep.equals([]);
    });

    it("rejects more presets than the thermostat supports", async () => {
        await using ctx = await thermostat(2);
        const { deviceEp } = ctx;

        await expect(writePresets(deviceEp, [newPreset(), newPreset(), newPreset()])).rejectedWith(
            "exceeds NumberOfPresets",
        );

        expect(storedPresets(deviceEp)).deep.equals([]);
    });

    it("rejects a named preset when the preset type does not support names", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(writePresets(deviceEp, [newPreset({ name: "Home" })])).rejectedWith(
            "Preset names are not supported",
        );

        expect(storedPresets(deviceEp)).deep.equals([]);
    });

    it("accepts an unnamed preset, whose name reads as null", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);

        expect(storedPresets(deviceEp)[0].name).equals(null);
    });

    it("rejects two unnamed presets for one scenario", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(writePresets(deviceEp, [newPreset(), newPreset()])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "Duplicate preset name",
        );

        expect(storedPresets(deviceEp)).deep.equals([]);
    });

    it("clears an activePresetHandle no preset carries", async () => {
        const deviceEp = new Endpoint(PresetsThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(), activePresetHandle: new Uint8Array(16).fill(7) },
        });
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        expect(node.lifecycle.isOnline).true;
        expect(deviceEp.state.thermostat.activePresetHandle).equals(null);
    });

    it("keeps an activePresetHandle a configured preset carries", async () => {
        const configured = newPreset({ presetHandle: new Uint8Array(16).fill(7) });
        const deviceEp = new Endpoint(PresetsThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(5, [configured]), activePresetHandle: configured.presetHandle },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        expect(deviceEp.state.thermostat.activePresetHandle).deep.equals(configured.presetHandle);
    });

    it("refuses to remove the active preset", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writePresets(deviceEp, [newPreset()]);
        const handle = storedPresets(deviceEp)[0].presetHandle!;
        await MockTime.resolve(deviceEp.set({ thermostat: { activePresetHandle: handle } }), { macrotasks: true });

        await expect(writePresets(deviceEp, [])).rejectedWith("while it is the active preset");

        expect(storedPresets(deviceEp).length).equals(1);
    });

    it("refuses to remove a preset the application marked built-in", async () => {
        const builtIn = newPreset({ presetHandle: new Uint8Array(16).fill(7), builtIn: true });
        await using ctx = await thermostat(5, [builtIn]);
        const { deviceEp } = ctx;

        await expect(writePresets(deviceEp, [])).rejectedWith("Cannot remove built-in preset");

        const stored = storedPresets(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].presetHandle).deep.equals(builtIn.presetHandle);
        expect(stored[0].builtIn).equals(true);
    });
});
