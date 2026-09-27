/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient } from "#behaviors/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import { subscribedPeer } from "../../node/node-helpers.js";
import { newSchedule, recordThermostatChanges, SCHEDULES_ATTRIBUTE, schedulesEndpoint } from "./schedule-helpers.js";

async function commissionedThermostat() {
    const site = new MockSite();
    const deviceEp = schedulesEndpoint();
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
            attributeRequests: [SCHEDULES_ATTRIBUTE],
            timeout: 5000,
        }),
    );
}

function commitWrite(ep1: Endpoint) {
    return MockTime.resolve(
        ep1.commandsOf(ThermostatClient).atomicRequest({
            requestType: Thermostat.RequestType.CommitWrite,
            attributeRequests: [SCHEDULES_ATTRIBUTE],
        }),
    );
}

function cachedSchedules(ep1: Endpoint) {
    return ep1.stateOf(ThermostatClient).schedules ?? [];
}

function writeSchedules(ep1: Endpoint, schedules: Thermostat.Schedule[]) {
    return MockTime.resolve(
        ep1.act(agent => {
            agent.get(ThermostatClient).state.schedules = schedules;
        }),
    );
}

describe("Schedules atomic write", () => {
    before(() => {
        MockTime.init();
    });

    it("encodes a whole-list assignment as replace-all followed by ADD", () => {
        const write = Write(
            Write.Attribute({
                endpoint: EndpointNumber(1),
                cluster: Thermostat,
                attributes: "schedules",
                value: [newSchedule()],
            }),
        );

        expect(write.writeRequests.map(({ path }) => path.listIndex)).deep.equals([undefined, null]);
    });

    it("applies schedules through BeginWrite, write and CommitWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { device, deviceEp, ep1 } = ctx;

        const deviceAnnouncements = recordThermostatChanges(device);
        const clientReports = new Array<Thermostat.Schedule[]>();
        ep1.eventsOf(ThermostatClient).schedules$Changed.on(value => void clientReports.push([...value]));

        expect(await beginWrite(ep1)).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: 0 }],
            timeout: 5000,
        });

        await writeSchedules(ep1, [newSchedule()]);

        // The write is staged only; the device's stored value stays empty until commit
        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);

        expect(await commitWrite(ep1)).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: 0 }],
        });

        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        const persisted = deviceEp.state.thermostat.persistedSchedules!;
        expect(persisted.length).equals(1);
        expect(persisted[0].scheduleHandle?.byteLength).equals(16);
        expect(persisted[0].systemMode).equals(Thermostat.SystemMode.Auto);
        expect(persisted[0].builtIn).equals(false);

        expect(deviceAnnouncements.filter(attrs => attrs.includes(SCHEDULES_ATTRIBUTE))).length(1);

        // The controller learns the handle the device generated, so it can address the schedule in a later write
        const cached = cachedSchedules(ep1);
        expect(cached.length).equals(1);
        expect(cached[0].scheduleHandle?.byteLength).equals(16);
        expect(clientReports[clientReports.length - 1][0].scheduleHandle?.byteLength).equals(16);
    });

    it("declines a write outside an atomic write", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await expect(writeSchedules(ep1, [newSchedule()])).rejectedWith("Multiple writes failed");

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
        expect(cachedSchedules(ep1).length).equals(0);
    });

    it("declines a schedule carrying a handle the device does not know", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writeSchedules(ep1, [newSchedule({ scheduleHandle: new Uint8Array([1, 2, 3, 4]) })])).rejectedWith(
            "Not found",
        );

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
        expect(cachedSchedules(ep1).length).equals(0);
    });

    it("declines a schedule for an unsupported systemMode", async () => {
        await using ctx = await commissionedThermostat();
        const { ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writeSchedules(ep1, [newSchedule({ systemMode: Thermostat.SystemMode.Cool })])).rejectedWith(
            "Constraint error",
        );
    });

    it("refuses a commit whose settled schedules an observer stripped the handle from", async () => {
        await using ctx = await commissionedThermostat();
        const { device, deviceEp, ep1 } = ctx;

        deviceEp.events.thermostat.persistedSchedules$Changing.on((schedules: Thermostat.Schedule[]) => {
            for (const schedule of schedules) {
                schedule.scheduleHandle = null;
            }
        });

        const deviceAnnouncements = recordThermostatChanges(device);

        await beginWrite(ep1);
        await writeSchedules(ep1, [newSchedule()]);

        // The command reports a generic failure; the reason travels in the attribute's status
        expect(await commitWrite(ep1)).deep.equals({
            statusCode: Status.Failure,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.ConstraintError }],
        });

        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
        expect(deviceAnnouncements.filter(attrs => attrs.includes(SCHEDULES_ATTRIBUTE))).length(0);
    });

    it("discards a staged write on RollbackWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);
        await writeSchedules(ep1, [newSchedule()]);

        expect(
            await MockTime.resolve(
                ep1.commandsOf(ThermostatClient).atomicRequest({
                    requestType: Thermostat.RequestType.RollbackWrite,
                    attributeRequests: [SCHEDULES_ATTRIBUTE],
                }),
            ),
        ).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: 0 }],
        });

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
    });
});
