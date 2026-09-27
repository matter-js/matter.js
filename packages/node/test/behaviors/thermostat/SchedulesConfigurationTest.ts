/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Environment, MockStorageService, StorageService } from "@matter/general";
import { StatusResponse } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import { subscribedPeer } from "../../node/node-helpers.js";
import {
    newSchedule,
    SchedulesThermostat,
    SchedulesThermostatServer,
    thermostatConfig,
    unconfiguredSchedulesEndpoint,
} from "./schedule-helpers.js";

function writeSchedules(deviceEp: Endpoint<typeof SchedulesThermostat>, schedules: Thermostat.Schedule[]) {
    return MockTime.resolve(deviceEp.set({ thermostat: { schedules } }), { macrotasks: true });
}

describe("Schedules configuration", () => {
    before(() => MockTime.init());

    it("declines a remote write outside an atomic write when the application configured no schedules", async () => {
        await using site = new MockSite();
        const deviceEp = unconfiguredSchedulesEndpoint();
        const { controller } = await site.addCommissionedPair({
            device: { type: MockServerNode.RootEndpoint, device: deviceEp },
        });
        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;

        // Schedules carries quality T, so a client may only write it inside an atomic write
        const write = () =>
            MockTime.resolve(
                ep1.act(agent => {
                    agent.get(ThermostatClient).state.schedules = [newSchedule()];
                }),
            );

        await expect(write()).rejected;
        expect(deviceEp.state.thermostat.schedules).deep.equals([]);

        // The same write inside an atomic write is accepted, so the refusal above is the atomicity rule rather than
        // the endpoint failing to serve the attribute at all
        await MockTime.resolve(
            ep1.commandsOf(ThermostatClient).atomicRequest({
                requestType: Thermostat.RequestType.BeginWrite,
                attributeRequests: [Thermostat.attributes.schedules.id],
                timeout: 5000,
            }),
        );
        await write();
        await MockTime.resolve(
            ep1.commandsOf(ThermostatClient).atomicRequest({
                requestType: Thermostat.RequestType.CommitWrite,
                attributeRequests: [Thermostat.attributes.schedules.id],
            }),
        );
        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        expect(deviceEp.state.thermostat.schedules.length).equals(1);
        expect(deviceEp.state.thermostat.schedules[0].scheduleHandle?.byteLength).equals(16);
    });

    it("validates a local write when the application configured no schedules", async () => {
        const deviceEp = unconfiguredSchedulesEndpoint();
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
        expect(node.lifecycle.isOnline).true;

        await expect(
            writeSchedules(deviceEp, [newSchedule({ scheduleHandle: new Uint8Array([1, 2, 3, 4]) })]),
        ).rejectedWith(StatusResponse.NotFoundError, "does not exist in old Schedules");

        await writeSchedules(deviceEp, [newSchedule()]);
        expect(deviceEp.state.thermostat.schedules[0].scheduleHandle?.byteLength).equals(16);
    });

    it("serves schedules a behavior type supplies as its own default", async () => {
        const schedule = newSchedule({ scheduleHandle: new Uint8Array(16).fill(9) });
        const Configured = SchedulesThermostatServer.set({ ...thermostatConfig(), schedules: [schedule] });
        const deviceEp = new Endpoint(ThermostatDevice.with(Configured), { id: "thermostat", number: 1 });

        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
        expect(node.lifecycle.isOnline).true;

        const schedules = deviceEp.state.thermostat.schedules;
        expect(schedules.length).equals(1);
        expect(schedules[0].scheduleHandle).deep.equals(schedule.scheduleHandle);
    });

    it("leaves the schedules a behavior type supplies untouched", async () => {
        const schedule = newSchedule();
        const Configured = SchedulesThermostatServer.set({ ...thermostatConfig(), schedules: [schedule] });

        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
            device: new Endpoint(ThermostatDevice.with(Configured), { id: "thermostat", number: 1 }),
        });
        expect(node.lifecycle.isOnline).true;

        // Every endpoint of a type shares that type's defaults, and validation issues handles into the schedules it
        // is given
        expect(schedule.scheduleHandle).equals(null);
        expect((Configured.defaults.schedules as Thermostat.Schedule[])[0].scheduleHandle).equals(null);
    });

    it("seeds from configuration, not from schedules a device stored before the accessor existed", async () => {
        const environment = new Environment("test");
        const storage = new MockStorageService(environment);
        environment.set(StorageService, storage);
        const context = `root.parts.${unconfiguredSchedulesEndpoint().id}.${SchedulesThermostatServer.id}`;

        {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device: unconfiguredSchedulesEndpoint(),
                environment,
            });
            await node.close();
        }

        // What a device left behind while the attribute was an ordinary stored value: written with no validation,
        // so it carries no handle and no client can address it
        const values = storage.store("node0").data;
        expect(values[context], "the thermostat's stored values").not.undefined;
        values[context].schedules = [newSchedule()] as never;

        // Without this the seed never runs, so the stale value could not have been consulted either way
        delete values[context].persistedSchedules;

        {
            const deviceEp = unconfiguredSchedulesEndpoint();
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device: deviceEp,
                environment,
            });

            expect(deviceEp.state.thermostat.schedules).deep.equals([]);

            await node.close();
        }
    });
});
