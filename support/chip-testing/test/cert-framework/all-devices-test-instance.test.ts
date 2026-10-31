/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ValveConfigurationAndControl } from "@matter/main/clusters/valve-configuration-and-control";
import { ValidationError } from "@matter/main/types";
import { AllDevicesTestInstance } from "../../src/AllDevicesTestInstance.js";
import { TestValveConfigurationAndControlServer } from "../../src/cluster/TestValveConfigurationAndControlServer.js";
import { listDeviceTypes } from "../../src/devices/DeviceTypeRegistry.js";

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

    it("adds every device type for * on a node with groupcast", async () => {
        const node = await setupWith("--device", "*", "--groupcast");
        try {
            expect([...node.parts].length).equals(listDeviceTypes().length);

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

    it("refuses an endpoint number or options for *", async () => {
        await expect(setupWith("--device", "*:3")).rejectedWith(ValidationError, '"*" takes no endpoint number');
        await expect(setupWith("--device", "*,parent=1,bridged")).rejectedWith(ValidationError, '"*" takes no');
    });

    it("refuses an endpoint number given twice", async () => {
        await expect(setupWith("--device", "on-off-light:3", "--device", "dimmable-light:3")).rejectedWith(
            ValidationError,
            "Endpoint 3 declared twice in --device flags",
        );
    });
});

/** Advance mock time in small steps, letting each timer reaction take the behavior lock and finish. */
async function elapse(ms: number) {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
        await MockTime.advance(100);
        await MockTime.yield3();
    }
}

describe("AllDevicesTestInstance water-valve", () => {
    const { ValveState } = ValveConfigurationAndControl;
    const Valve = TestValveConfigurationAndControlServer;

    before(() => MockTime.enable());
    after(() => MockTime.disable());

    let node: ServerNode;
    let valve: Endpoint;

    beforeEach(async () => {
        MockTime.reset();
        node = await setupWith("--device", "water-valve:1");
        [valve] = node.parts;
    });

    afterEach(() => node.close());

    it("reaches the target level after the movement", async () => {
        await valve.act(agent => agent.get(Valve).open({ targetLevel: 40 }));
        expect(valve.stateOf(Valve)).deep.include({
            currentState: ValveState.Transitioning,
            targetState: ValveState.Open,
            targetLevel: 40,
            currentLevel: 0,
            openDuration: null,
            remainingDuration: null,
        });

        await elapse(200);
        expect(valve.stateOf(Valve)).deep.include({
            currentState: ValveState.Open,
            targetState: null,
            targetLevel: null,
            currentLevel: 40,
        });

        await valve.act(agent => agent.get(Valve).close());
        expect(valve.stateOf(Valve)).deep.include({
            currentState: ValveState.Transitioning,
            targetState: ValveState.Closed,
            targetLevel: 0,
        });

        await elapse(200);
        expect(valve.stateOf(Valve)).deep.include({
            currentState: ValveState.Closed,
            targetState: null,
            targetLevel: null,
            currentLevel: 0,
        });
    });

    it("counts RemainingDuration down and closes when it runs out", async () => {
        await valve.act(agent => agent.get(Valve).open({ openDuration: 3 }));
        expect(valve.stateOf(Valve)).deep.include({ openDuration: 3, remainingDuration: 3 });

        await elapse(1000);
        expect(valve.stateOf(Valve)).deep.include({ currentState: ValveState.Open, remainingDuration: 2 });

        await elapse(2000);
        expect(valve.stateOf(Valve)).deep.include({
            openDuration: null,
            remainingDuration: 0,
            targetState: ValveState.Closed,
        });

        await elapse(200);
        expect(valve.stateOf(Valve)).deep.include({
            currentState: ValveState.Closed,
            currentLevel: 0,
            remainingDuration: null,
        });
    });

    it("uses DefaultOpenDuration when Open has no duration and stops the countdown on Close", async () => {
        await valve.setStateOf(Valve, { defaultOpenDuration: 60 });
        await valve.act(agent => agent.get(Valve).open({}));
        expect(valve.stateOf(Valve)).deep.include({ openDuration: 60, remainingDuration: 60 });

        await elapse(5000);
        expect(valve.stateOf(Valve).remainingDuration).equals(55);

        await valve.act(agent => agent.get(Valve).close());
        await elapse(5000);
        expect(valve.stateOf(Valve)).deep.include({
            openDuration: null,
            remainingDuration: null,
            currentState: ValveState.Closed,
        });
    });

    it("keeps the valve open without countdown when Open has a null duration", async () => {
        await valve.setStateOf(Valve, { defaultOpenDuration: 60 });
        await valve.act(agent => agent.get(Valve).open({ openDuration: null }));
        await elapse(2000);
        expect(valve.stateOf(Valve)).deep.include({
            openDuration: null,
            remainingDuration: null,
            currentState: ValveState.Open,
        });
    });

    it("reports RemainingDuration only when it leaves or returns to null or changes other than by the countdown", async () => {
        const reported = new Array<number | null>();
        valve.eventsOf(Valve).remainingDuration$Changed.quiet.on(value => {
            reported.push(value);
        });

        await valve.act(agent => agent.get(Valve).open({ openDuration: 10 }));
        await elapse(3000);
        await valve.act(agent => agent.get(Valve).open({ openDuration: 20 }));
        await elapse(2000);
        await valve.act(agent => agent.get(Valve).close());

        expect(reported).deep.equals([10, 20, null]);
    });

    it("reports a RemainingDuration that a command lowers by one second, and 0 when the countdown ends", async () => {
        const reported = new Array<number | null>();
        valve.eventsOf(Valve).remainingDuration$Changed.quiet.on(value => {
            reported.push(value);
        });

        await valve.act(agent => agent.get(Valve).open({ openDuration: 3 }));
        await valve.act(agent => agent.get(Valve).open({ openDuration: 2 }));
        await elapse(2200);

        expect(reported).deep.equals([3, 2, 0, null]);
    });

    it("completes a Close of a closed valve at once", async () => {
        const states = new Array<ValveConfigurationAndControl.ValveState>();
        valve.eventsOf(Valve).currentState$Changed.on(value => {
            if (value !== null) {
                states.push(value);
            }
        });

        await valve.act(agent => agent.get(Valve).close());

        expect(states).deep.equals([]);
        expect(valve.stateOf(Valve)).deep.include({
            currentState: ValveState.Closed,
            targetState: null,
            targetLevel: null,
            currentLevel: 0,
        });
    });
});
