/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SwitchServer } from "#behaviors/switch";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { Instant, MaybePromise, Millis } from "@matter/general";
import { Switch } from "@matter/types/clusters/switch";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

function createEventCatcher(device: MockEndpoint<EndpointType>) {
    return device.captureEvents(
        SwitchServer.for(Switch).with(
            Switch.Feature.LatchingSwitch,
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
            Switch.Feature.MomentarySwitchLongPress,
            Switch.Feature.MomentarySwitchMultiPress,
        ),
        {
            names: [
                "currentPosition$Changed",
                "rawPosition$Changed",
                "switchLatched",
                "initialPress",
                "shortRelease",
                "longRelease",
                "multiPressOngoing",
                "longPress",
                "multiPressComplete",
            ],
        },
    );
}

async function createLatchingSwitch() {
    return MockEndpoint.createWith(SwitchServer.with(Switch.Feature.LatchingSwitch));
}

async function createMsSwitch() {
    return MockEndpoint.createWith(SwitchServer.with(Switch.Feature.MomentarySwitch));
}

async function createMsMsrSwitch() {
    return MockEndpoint.createWith(
        SwitchServer.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease),
    );
}

async function createMsMsrMslSwitch() {
    return MockEndpoint.createWith(
        SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
            Switch.Feature.MomentarySwitchLongPress,
        ),
    );
}

async function createMsMsrMslMsmSwitch() {
    return MockEndpoint.createWith(
        SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
            Switch.Feature.MomentarySwitchLongPress,
            Switch.Feature.MomentarySwitchMultiPress,
        ),
    );
}

async function createMsMsrMsmSwitch() {
    return MockEndpoint.createWith(
        SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
            Switch.Feature.MomentarySwitchMultiPress,
        ),
    );
}

async function createMsAsMslMsmSwitch() {
    return MockEndpoint.createWith(
        SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.ActionSwitch,
            Switch.Feature.MomentarySwitchLongPress,
            Switch.Feature.MomentarySwitchMultiPress,
        ),
    );
}

/**
 * Runs {@link actor} in a transaction that holds the switch state lock, so the locked reaction to any input that occurs
 * meanwhile runs only after the transaction commits.
 */
async function holdingSwitchLock(device: MockEndpoint<EndpointType>, actor: (behavior: SwitchServer) => Promise<void>) {
    await device.act(async agent => {
        const behavior = agent.get(SwitchServer);
        await agent.context.transaction.addResources(behavior);
        await agent.context.transaction.begin();
        await actor(behavior);
    });
}

/** Advances mock time while holding the switch state lock, so every timer due meanwhile expires before any reaction. */
async function advanceHoldingSwitchLock(device: MockEndpoint<EndpointType>, ms: number) {
    await holdingSwitchLock(device, () => MockTime.advance(ms));
    await MockTime.macrotask;
}

/**
 * Presses briefly, then presses again right after the release and holds the switch past longPressDelay before the
 * final release. Each hold and the idle phase advance mock time while holding the switch state lock, so all timers due
 * in a phase expire before any reaction to them runs.
 */
async function shortThenLongPress(device: MockEndpoint<EndpointType>, holdMs: number, idleMs: number) {
    await device.set({ switch: { currentPosition: 1 } });
    await MockTime.advance(50);
    await device.set({ switch: { currentPosition: 0 } });
    await device.set({ switch: { currentPosition: 1 } });
    await advanceHoldingSwitchLock(device, holdMs);
    await device.set({ switch: { currentPosition: 0 } });
    await advanceHoldingSwitchLock(device, idleMs);
}

async function doTestPress(
    device: MockEndpoint<EndpointType>,
    delay: number,
    expectedEvents: any[],
    pressSequence: number[] = [1, 0],
) {
    await device.set({
        switch: {
            numberOfPositions: pressSequence.reduce((acc, val) => Math.max(acc, val), 0) + 1,
        },
    });

    const events = createEventCatcher(device);

    for (let i = 0; i < pressSequence.length; i++) {
        if (i !== 0 && delay !== 0) {
            await MockTime.advance(delay);
        }
        await device.set({
            switch: {
                currentPosition: pressSequence[i],
            },
        });
    }

    expect(events).deep.equals(expectedEvents);
}

/**
 * The tests are mainly based on examples described in the @see {@link MatterSpecification.v161.Cluster} § 1.13.7/8/9
 */
describe("SwitchServer", () => {
    before(MockTime.enable);

    describe("test custom validators", () => {
        it("Accept valid currentPosition", async () => {
            await using device = await createLatchingSwitch();
            await expect(device.set({ switch: { currentPosition: 1 } })).to.not.be.rejected;
        });

        it("Reject invalid currentPosition", async () => {
            await using device = await createLatchingSwitch();
            await expect(device.set({ switch: { currentPosition: 2 } })).to.be.rejectedWith(
                'Validating node0.part0.switch.state: Constraint "max numberOfPositions - 1": Value 2 is not within bounds defined by constraint (135)',
            );
        });

        it("Accept valid rawPosition", async () => {
            await using device = await createLatchingSwitch();
            await expect(device.set({ switch: { rawPosition: 1 } })).to.not.be.rejected;
        });

        it("Reject invalid rawPosition", async () => {
            await using device = await createLatchingSwitch();
            await expect(device.set({ switch: { rawPosition: 2 } })).to.be.rejectedWith(
                "Error in reactor<node0.part0.switch.#assertPositionInRange>: Position 2 invalid",
            );
        });
    });

    describe("Test Debounce", () => {
        let device: Awaited<ReturnType<typeof createLatchingSwitch>>;

        beforeEach(async () => {
            device = await createLatchingSwitch();
            await device.set({ switch: { debounceDelay: Millis(50) } });
        });

        afterEach(async () => {
            await device.close();
        });

        it("set currentState is immediately", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
            ]);
        });

        it("set rawPosition with debounceDelay=0 is immediately", async () => {
            await device.set({ switch: { debounceDelay: Instant } });

            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    rawPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
            ]);
        });

        it("set stable rawPosition with debounceDelay is respecting debounceDelay", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    rawPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(30);

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(30);

            // We need to trick the event loop a bit - but we do not advance time any further so anything is still "not timer based"
            await new Promise<void>(resolve => device.events.switch.currentPosition$Changed.on(() => resolve()));

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
            ]);
        });

        it("set unstable rawPosition with debounceDelay is respecting debounceDelay", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    rawPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(10);

            // After 10ms set back to 0
            await device.set({
                switch: {
                    rawPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(10);

            // After another 10ms set back to 1
            await device.set({
                switch: {
                    rawPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(30);

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(30);

            // We need to trick the event loop a bit - but we do not advance time any further so anything is still "not timer based"
            await new Promise<void>(resolve => device.events.switch.currentPosition$Changed.on(() => resolve()));

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
            ]);
        });

        it("set unstable rawPosition with debounceDelay ending on source value is respecting debounceDelay", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    rawPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(10);

            // After 10ms set back to 0
            await device.set({
                switch: {
                    rawPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(10);

            // After another 10ms set back to 1
            await device.set({
                switch: {
                    rawPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(10);

            // After another 10ms set back to 1
            await device.set({
                switch: {
                    rawPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
            await MockTime.advance(30);

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(30);

            // Make sure nothing is left somewhere in event loop
            for (let i = 0; i < 20; i++) {
                await MockTime.macrotask;
            }

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
        });

        it("reports a stable position even when the raw position changes before the reaction to its expiry runs", async () => {
            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });

            // Forces the raw position to change after the debounce expired but before the reaction to the expiry runs
            await holdingSwitchLock(device, async ({ state }) => {
                await MockTime.advance(50);
                state.rawPosition = 0;
            });
            await MockTime.advance(50);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 0 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("reports a debounced position before a later direct write without overwriting it", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });

            // Forces the debounce to expire, then currentPosition to be written, before the reaction to the expiry runs
            await holdingSwitchLock(device, async ({ state }) => {
                await MockTime.advance(50);
                state.currentPosition = 2;
            });
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 0,
                },
            ]);
            expect(device.stateOf(SwitchServer).currentPosition).equals(2);
        });

        it("drops a pending debounce when the raw position is set while debouncing is off", async () => {
            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });
            await device.set({ switch: { debounceDelay: Millis(0), rawPosition: 0 } });
            await MockTime.advance(100);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
            expect(device.stateOf(SwitchServer).currentPosition).equals(0);
        });

        it("applies a raw position set while debouncing is off after a debounced position still to be written", async () => {
            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });

            // Forces the debounce to expire, then debouncing off and the raw position back to the current position,
            // before the debounced position is written
            await holdingSwitchLock(device, async ({ state }) => {
                await MockTime.advance(50);
                state.debounceDelay = Instant;
                state.rawPosition = 0;
            });
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 0 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
            expect(device.stateOf(SwitchServer).currentPosition).equals(0);
        });
    });

    describe("Test LS", () => {
        it("Test Single Press with 2 positions", async () => {
            await using device = await createLatchingSwitch();

            await doTestPress(device, 0, [
                {
                    name: "switchLatched",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "switchLatched",
                    value: { newPosition: 0 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("reports a move to the position the switch had before a reset", async () => {
            await using device = await createLatchingSwitch();

            await device.set({ switch: { currentPosition: 1 } });
            await device.act(agent => agent.get(SwitchServer).resetState());

            const events = createEventCatcher(device);
            await device.set({ switch: { currentPosition: 0 } });

            expect(events).deep.equals([
                {
                    name: "switchLatched",
                    value: { newPosition: 0 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test Single Press with 3 positions", async () => {
            await using device = await createLatchingSwitch();

            await doTestPress(
                device,
                0,
                [
                    {
                        name: "switchLatched",
                        value: { newPosition: 1 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 0,
                        newValue: 1,
                    },
                    {
                        name: "switchLatched",
                        value: { newPosition: 2 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 1,
                        newValue: 2,
                    },
                    {
                        name: "switchLatched",
                        value: { newPosition: 0 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 2,
                        newValue: 0,
                    },
                ],
                [1, 2, 0],
            );
        });
    });

    describe("Test MS & MSR & MSL", () => {
        let device: Awaited<ReturnType<typeof createMsMsrMslSwitch>>;

        beforeEach(async () => {
            device = await createMsMsrMslSwitch();
            await device.set({ switch: { longPressDelay: Millis(100) } });
        });

        afterEach(async () => {
            await device.close();
        });

        it("Test short Press with 2 positions", async () => {
            await doTestPress(device, 50, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test long Press with 2 positions", async () => {
            await doTestPress(device, 110, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test even longer Press with 2 positions", async () => {
            await doTestPress(device, 300, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test release processed before the reaction to the expired long press timer", async () => {
            const events = createEventCatcher(device);

            await device.set({ switch: { currentPosition: 1 } });

            // Forces the release to be written after the long press timer expired but before the reaction to it runs
            await holdingSwitchLock(device, async ({ state }) => {
                await MockTime.advance(100);
                state.currentPosition = 0;
            });
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "longPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "longRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test release debounced before the long press timer expires, both before their reactions run", async () => {
            await device.set({ switch: { debounceDelay: Millis(50) } });
            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });
            await MockTime.advance(50);
            await MockTime.macrotask;
            await device.set({ switch: { rawPosition: 0 } });

            // Forces the debounced release and then the long press timer to expire before either reaction runs
            await advanceHoldingSwitchLock(device, 150);

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
        });

        it("Test long press followed by a move releases long without a further InitialPress", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(150);
            await MockTime.macrotask;
            await device.set({ switch: { currentPosition: 2 } });
            await device.set({ switch: { currentPosition: 0 } });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "longRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
            ]);
        });
    });

    describe("Test MS & MSR & !MSL", () => {
        let device: Awaited<ReturnType<typeof createMsMsrSwitch>>;

        beforeEach(async () => {
            device = await createMsMsrSwitch();
        });

        afterEach(async () => {
            await device.close();
        });

        it("Test short Press with 2 positions", async () => {
            await doTestPress(device, 50, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test short Presses with 3 positions", async () => {
            await doTestPress(
                device,
                50,
                [
                    {
                        name: "initialPress",
                        value: { newPosition: 1 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 0,
                        newValue: 1,
                    },
                    {
                        name: "shortRelease",
                        value: {
                            previousPosition: 1,
                        },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 1,
                        newValue: 0,
                    },
                    {
                        name: "initialPress",
                        value: { newPosition: 2 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 0,
                        newValue: 2,
                    },
                    {
                        name: "shortRelease",
                        value: {
                            previousPosition: 2,
                        },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 2,
                        newValue: 0,
                    },
                ],
                [1, 0, 2, 0],
            );
        });

        it("Test short Presses joystick-like", async () => {
            await doTestPress(
                device,
                50,
                [
                    {
                        name: "initialPress",
                        value: { newPosition: 6 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 0,
                        newValue: 6,
                    },
                    {
                        name: "initialPress",
                        value: { newPosition: 5 },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 6,
                        newValue: 5,
                    },
                    {
                        name: "shortRelease",
                        value: {
                            previousPosition: 5,
                        },
                    },
                    {
                        name: "currentPosition$Changed",
                        oldValue: 5,
                        newValue: 0,
                    },
                ],
                [6, 5, 0],
            );
        });

        it("Test long Press with 2 positions", async () => {
            await doTestPress(device, 110, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test even longer Press with 2 positions", async () => {
            await doTestPress(device, 300, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });
    });

    describe("Test MS & !MSR & !MSL", () => {
        let device: Awaited<ReturnType<typeof createMsSwitch>>;

        beforeEach(async () => {
            device = await createMsSwitch();
        });

        afterEach(async () => {
            await device.close();
        });

        it("Test short Press with 2 positions", async () => {
            await doTestPress(device, 50, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test long Press with 2 positions", async () => {
            await doTestPress(device, 110, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test even longer Press with 2 positions", async () => {
            await doTestPress(device, 300, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });
    });

    describe("Test MS & MSR & MSL & MSM", () => {
        let device: Awaited<ReturnType<typeof createMsMsrMslMsmSwitch>>;

        beforeEach(async () => {
            device = await createMsMsrMslMsmSwitch();
            await device.set({
                switch: { longPressDelay: Millis(100), multiPressDelay: Millis(150), multiPressMax: 3 },
            });
        });

        afterEach(async () => {
            await device.close();
        });

        it("Test long Press with 2 positions", async () => {
            await doTestPress(device, 110, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test one short Press with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 1,
                    },
                },
            ]);
        });

        it("Test two short Presses with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "multiPressOngoing",
                    value: {
                        newPosition: 1,
                        currentNumberOfPressesCounted: 2,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 2,
                    },
                },
            ]);
        });

        it("Test three short Presses with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "multiPressOngoing",
                    value: {
                        newPosition: 1,
                        currentNumberOfPressesCounted: 2,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "multiPressOngoing",
                    value: {
                        newPosition: 1,
                        currentNumberOfPressesCounted: 3,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 3,
                    },
                },
            ]);
        });

        it("Test a press after an aborted sequence reports neither InitialPress nor ShortRelease", async () => {
            const events = createEventCatcher(device);
            await device.set({ switch: { multiPressMax: 2 } });

            for (let press = 0; press < 4; press++) {
                await device.set({ switch: { currentPosition: 1 } });
                await MockTime.advance(50);
                await device.set({ switch: { currentPosition: 0 } });
                await MockTime.advance(50);
            }
            await MockTime.advance(160);
            await MockTime.macrotask;

            // The fourth press got no InitialPress, so its release reports nothing either
            expect(events.filter(({ name }) => name !== "currentPosition$Changed")).deep.equals([
                { name: "initialPress", value: { newPosition: 1 } },
                { name: "shortRelease", value: { previousPosition: 1 } },
                { name: "initialPress", value: { newPosition: 1 } },
                { name: "multiPressOngoing", value: { newPosition: 1, currentNumberOfPressesCounted: 2 } },
                { name: "shortRelease", value: { previousPosition: 1 } },
                { name: "initialPress", value: { newPosition: 1 } },
                { name: "shortRelease", value: { previousPosition: 1 } },
                { name: "multiPressComplete", value: { previousPosition: 1, totalNumberOfPressesCounted: 0 } },
            ]);
        });

        it("Test three short Presses with max 2 abort the sequence with 2 positions", async () => {
            const events = createEventCatcher(device);
            await device.set({
                switch: {
                    multiPressMax: 2,
                },
            });

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "multiPressOngoing",
                    value: {
                        newPosition: 1,
                        currentNumberOfPressesCounted: 2,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                // MultiPressOngoing.CurrentNumberOfPressesCounted is constrained to 2 to MultiPressMax
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 0,
                    },
                },
            ]);
        });

        it("Test moves between pressed positions without release count as one press", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            // Multi-press detection counts "press-release cycles"; a move between pressed positions has no release
            for (const position of [1, 2, 1, 2, 0]) {
                await device.set({ switch: { currentPosition: position } });
                await MockTime.advance(20);
            }
            await MockTime.advance(140);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 2,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 2, totalNumberOfPressesCounted: 1 },
                },
            ]);
        });

        it("Test two short presses on different positions", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            for (const position of [1, 0, 2, 0]) {
                await device.set({ switch: { currentPosition: position } });
                await MockTime.advance(50);
            }
            await MockTime.advance(110);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 2 },
                },
                {
                    name: "multiPressOngoing",
                    value: { newPosition: 2, currentNumberOfPressesCounted: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 2, totalNumberOfPressesCounted: 2 },
                },
            ]);
        });

        it("Test move restarts the long press delay", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            // The move generates an InitialPress, and LongPress refers to the previous InitialPress
            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(60);
            await device.set({ switch: { currentPosition: 2 } });
            await MockTime.advance(60);
            await MockTime.macrotask;
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 2, totalNumberOfPressesCounted: 1 },
                },
            ]);
        });

        it("Test long press followed by a move to another position", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(150);
            await MockTime.macrotask;
            // A press reported as long stays one press until its release, so the move generates no InitialPress
            await device.set({ switch: { currentPosition: 2 } });
            await MockTime.advance(50);
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "longRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
            ]);
        });

        it("Test one long and one short press with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                    longPressDelay: Millis(300),
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(500);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(10);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(10);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
        });

        it("Test one short press and a long press with 2 positions", async () => {
            const events = createEventCatcher(device);

            // Forces the long press timer of the second press to expire before the reaction to it runs
            await shortThenLongPress(device, 400, 400);

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "multiPressOngoing",
                    value: { newPosition: 1, currentNumberOfPressesCounted: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 1, totalNumberOfPressesCounted: 2 },
                },
            ]);
        });

        it("Test long press is not followed by a multi press complete", async () => {
            const events = createEventCatcher(device);

            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(400);
            await MockTime.macrotask;
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(400);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "longRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
        });

        it("Test debounced further press stops the multi press timer when it occurs", async () => {
            await device.set({ switch: { debounceDelay: Millis(50) } });
            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });
            await MockTime.advance(50);
            await MockTime.macrotask;
            await device.set({ switch: { rawPosition: 0 } });
            await MockTime.advance(50);
            await MockTime.macrotask;
            await device.set({ switch: { rawPosition: 1 } });

            // Forces the further press to be debounced, then the multi press delay counted from the release to end,
            // before the reaction to either runs
            await advanceHoldingSwitchLock(device, 200);
            await device.set({ switch: { rawPosition: 0 } });
            await MockTime.advance(50);
            await MockTime.macrotask;
            await MockTime.advance(150);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "multiPressOngoing",
                    value: { newPosition: 1, currentNumberOfPressesCounted: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 1, totalNumberOfPressesCounted: 2 },
                },
            ]);
        });
    });

    describe("Test MS & AS & MSL & MSM", () => {
        let device: Awaited<ReturnType<typeof createMsAsMslMsmSwitch>>;

        beforeEach(async () => {
            device = await createMsAsMslMsmSwitch();
            await device.set({
                switch: { longPressDelay: Millis(100), multiPressDelay: Millis(150), multiPressMax: 3 },
            });
        });

        afterEach(async () => {
            await device.close();
        });

        it("Test long Press with 2 positions", async () => {
            await doTestPress(device, 110, [
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
            ]);
        });

        it("Test one short Press with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 1,
                    },
                },
            ]);
        });

        it("Test two short Presses with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 2,
                    },
                },
            ]);
        });

        it("Test three short Presses with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },

                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },

                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },

                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 3,
                    },
                },
            ]);
        });

        it("Test three short Presses with max 2 abort the sequence with 2 positions", async () => {
            const events = createEventCatcher(device);
            await device.set({
                switch: {
                    multiPressMax: 2,
                },
            });

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                // The aborted sequence completes when no further press follows
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 0,
                    },
                },
            ]);
        });

        it("Test moves between pressed positions without release count as one press", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            // Multi-press detection counts "press-release cycles"; a move between pressed positions has no release
            for (const position of [1, 2, 1, 2, 0]) {
                await device.set({ switch: { currentPosition: position } });
                await MockTime.advance(20);
            }
            await MockTime.advance(140);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 2,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 2, totalNumberOfPressesCounted: 1 },
                },
            ]);
        });

        it("Test two short presses on different positions", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            for (const position of [1, 0, 2, 0]) {
                await device.set({ switch: { currentPosition: position } });
                await MockTime.advance(50);
            }
            await MockTime.advance(110);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 2, totalNumberOfPressesCounted: 2 },
                },
            ]);
        });

        it("Test press held across a move reaches the long press delay from its start", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            // An action switch generates no InitialPress for the move, so the press keeps its long press timing
            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(60);
            await device.set({ switch: { currentPosition: 2 } });
            await MockTime.advance(60);
            await MockTime.macrotask;
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "longPress",
                    value: { newPosition: 2 },
                },
                {
                    name: "longRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
            ]);
        });

        it("Test long press followed by a move to another position", async () => {
            await device.set({ switch: { numberOfPositions: 3 } });
            const events = createEventCatcher(device);

            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(150);
            await MockTime.macrotask;
            // An action switch generates no InitialPress for the move, so LongRelease refers to the InitialPress of the press
            await device.set({ switch: { currentPosition: 2 } });
            await MockTime.advance(50);
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 2,
                    oldValue: 1,
                },
                {
                    name: "longRelease",
                    value: { previousPosition: 2 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 2,
                },
            ]);
        });

        it("Test one long and one short press with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                    longPressDelay: Millis(300),
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(500);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await MockTime.advance(10);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            await MockTime.advance(10);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "longPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "longRelease",
                    value: {
                        previousPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
        });

        it("Test one short press and a long press with 2 positions", async () => {
            const events = createEventCatcher(device);

            await device.set({
                switch: {
                    currentPosition: 1,
                    longPressDelay: Millis(300),
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);

            await MockTime.advance(50);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);

            await device.set({
                switch: {
                    currentPosition: 1,
                },
            });

            // Forces every timer due during the long press to expire before any reaction to them runs
            await advanceHoldingSwitchLock(device, 400);

            await device.set({
                switch: {
                    currentPosition: 0,
                },
            });

            // Forces every timer due while the switch is released to expire before any reaction to them runs
            await advanceHoldingSwitchLock(device, 400);

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: {
                        newPosition: 1,
                    },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: {
                        previousPosition: 1,
                        totalNumberOfPressesCounted: 2,
                    },
                },
            ]);
        });

        it("Test one short press and a long press with equal long press and multi press delays", async () => {
            await device.set({ switch: { longPressDelay: Millis(150), multiPressDelay: Millis(150) } });
            const events = createEventCatcher(device);

            // Forces the long press timer of the second press to expire before the reaction to it runs
            await shortThenLongPress(device, 400, 400);

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 1, totalNumberOfPressesCounted: 2 },
                },
            ]);
        });
    });

    describe("Test MS & MSR & !MSL & MSM", () => {
        let device: Awaited<ReturnType<typeof createMsMsrMsmSwitch>>;

        beforeEach(async () => {
            device = await createMsMsrMsmSwitch();
            await device.set({ switch: { multiPressDelay: Millis(150) } });
        });

        afterEach(async () => {
            await device.close();
        });

        it("Test a press that exceeds the maximum keeps its ShortRelease across a move", async () => {
            const events = createEventCatcher(device);
            await device.set({ switch: { numberOfPositions: 3, multiPressMax: 2 } });

            for (const position of [1, 0, 1, 0, 1, 2, 0]) {
                await device.set({ switch: { currentPosition: position } });
                await MockTime.advance(50);
            }
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events.filter(({ name }) => name === "shortRelease").length).equals(3);
        });

        it("Test a press after an aborted sequence reports no ShortRelease", async () => {
            const events = createEventCatcher(device);
            await device.set({ switch: { multiPressMax: 2 } });

            for (let press = 0; press < 4; press++) {
                await device.set({ switch: { currentPosition: 1 } });
                await MockTime.advance(50);
                await device.set({ switch: { currentPosition: 0 } });
                await MockTime.advance(50);
            }
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events.filter(({ name }) => name === "initialPress" || name === "shortRelease").length).equals(6);
        });

        it("Test press held longer than the multi press delay", async () => {
            const events = createEventCatcher(device);

            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(400);
            await MockTime.macrotask;
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(400);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 1, totalNumberOfPressesCounted: 1 },
                },
            ]);
        });
    });
    describe("Test resetState", () => {
        let device: Awaited<ReturnType<typeof createMsMsrMslMsmSwitch>>;

        beforeEach(async () => {
            device = await createMsMsrMslMsmSwitch();
            await device.set({
                switch: { longPressDelay: Millis(100), multiPressDelay: Millis(150), multiPressMax: 3 },
            });
        });

        afterEach(async () => {
            await device.close();
        });

        async function press() {
            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(50);
            await device.set({ switch: { currentPosition: 0 } });
        }

        it("starts no debounce for the raw position it resynchronizes", async () => {
            await device.set({ switch: { debounceDelay: Millis(50) } });
            await device.set({ switch: { currentPosition: 1 } });
            await device.act(agent => agent.get(SwitchServer).resetState());
            await device.set({ switch: { currentPosition: 0 } });
            await MockTime.advance(100);
            await MockTime.macrotask;

            expect(device.state.switch.currentPosition).equals(0);
        });

        it("drops a multi-press cycle in progress, so the next press counts from one", async () => {
            // Two presses, so the reset has a press count above one to drop
            await press();
            await MockTime.advance(50);
            await press();

            await device.act(agent => agent.get(SwitchServer).resetState());

            const events = createEventCatcher(device);

            await press();
            await MockTime.advance(160);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 0,
                    newValue: 1,
                },
                {
                    name: "shortRelease",
                    value: { previousPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    oldValue: 1,
                    newValue: 0,
                },
                {
                    name: "multiPressComplete",
                    value: { previousPosition: 1, totalNumberOfPressesCounted: 1 },
                },
            ]);
        });

        it("drops a press still being timed, so no long press is reported after the reset", async () => {
            // Held, but not yet long enough to have been reported as a long press
            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(50);

            await device.act(agent => agent.get(SwitchServer).resetState());

            const events = createEventCatcher(device);

            await MockTime.advance(200);
            await MockTime.macrotask;

            expect(events).deep.equals([]);
        });

        it("reports the long press this one would have suppressed, when no reset intervenes", async () => {
            await device.set({ switch: { currentPosition: 1 } });
            await MockTime.advance(50);

            const events = createEventCatcher(device);

            await MockTime.advance(200);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "longPress",
                    value: { newPosition: 1 },
                },
            ]);
        });

        it("drops a debounced release pending at the reset without reporting a new press", async () => {
            await device.set({ switch: { debounceDelay: Millis(50), rawPosition: 1 } });
            await MockTime.advance(50);
            await MockTime.macrotask;
            await device.set({ switch: { rawPosition: 0 } });

            const events = createEventCatcher(device);
            await device.act(agent => agent.get(SwitchServer).resetState());
            await MockTime.advance(200);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);
        });

        it("waits for the switch state lock held by another transaction", async () => {
            await device.set({ switch: { debounceDelay: Millis(50), rawPosition: 1 } });

            let reset: MaybePromise<void> | undefined;
            await holdingSwitchLock(device, async () => {
                reset = device.act(agent => agent.get(SwitchServer).resetState());
                await MockTime.macrotask;
            });
            await reset;

            expect(device.stateOf(SwitchServer).rawPosition).equals(0);
        });

        it("drops long press timing of a press committed while the reset waits for the lock", async () => {
            const events = createEventCatcher(device);

            // Forces the reset to be called while another transaction holds the lock with a press it then commits
            let reset: MaybePromise<void> | undefined;
            await holdingSwitchLock(device, async ({ state }) => {
                state.currentPosition = 1;
                reset = device.act(agent => agent.get(SwitchServer).resetState());
                await MockTime.macrotask;
            });
            await reset;
            await MockTime.advance(200);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);
        });

        it("drops a position still being debounced", async () => {
            await device.set({ switch: { debounceDelay: Millis(50), rawPosition: 1 } });

            await device.act(agent => agent.get(SwitchServer).resetState());

            const events = createEventCatcher(device);

            await MockTime.advance(100);
            await MockTime.macrotask;

            expect(events).deep.equals([]);
        });

        it("drops a debounced position whose reaction still waits for the lock at the reset", async () => {
            await device.set({ switch: { debounceDelay: Millis(50), rawPosition: 1 } });
            const events = createEventCatcher(device);

            // Forces the debounce to expire, then the reset, before the reaction to the expiry runs
            await holdingSwitchLock(device, async behavior => {
                await MockTime.advance(50);
                behavior.resetState();
            });
            await MockTime.advance(100);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 0,
                    oldValue: 1,
                },
            ]);
            expect(device.stateOf(SwitchServer).currentPosition).equals(0);
        });

        it("debounces a raw position again that was still being debounced at the reset", async () => {
            await device.set({ switch: { debounceDelay: Millis(50), rawPosition: 1 } });
            await device.act(agent => agent.get(SwitchServer).resetState());

            const events = createEventCatcher(device);

            await device.set({ switch: { rawPosition: 1 } });
            await MockTime.advance(50);
            await MockTime.macrotask;

            expect(events).deep.equals([
                {
                    name: "rawPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
                {
                    name: "initialPress",
                    value: { newPosition: 1 },
                },
                {
                    name: "currentPosition$Changed",
                    newValue: 1,
                    oldValue: 0,
                },
            ]);
        });
    });
});
