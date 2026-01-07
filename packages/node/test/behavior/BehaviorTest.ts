/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { Agent } from "#endpoint/Agent.js";
import { BasicObservable, EventEmitter, Observable } from "#general";
import { MockEndpoint } from "../endpoint/mock-endpoint.js";

class TestBehavior extends Behavior {
    static override readonly id = "test";
    declare readonly events: TestBehavior.Events;
    declare readonly state: TestBehavior.State;

    constructor(agent: Agent, backing: BehaviorBacking) {
        super(agent, backing);
    }
}

namespace TestBehavior {
    export class State {
        valueOne = 1;
        valueTwo = 2;
    }

    export class Events extends EventEmitter {
        endpointValue$Changed = Observable();
    }
}

function test(what: string, fn: (behavior: TestBehavior) => void) {
    it(what, async () => {
        await using endpoint = await MockEndpoint.createWith(TestBehavior);
        await endpoint.act(agent => {
            const behavior = agent.test;
            fn(behavior);
        });
    });
}

describe("Behavior", () => {
    type IsObject<T> = T extends undefined ? false : T extends object ? true : false;

    test("instantiates with correct properties", behavior => {
        expect(behavior.agent.get(TestBehavior)).equals(behavior);
        expect(behavior.state.valueOne).equals(1);
        expect(behavior.state.valueTwo).equals(2);
        expect(behavior.events.endpointValue$Changed).instanceOf(BasicObservable);
    });

    test("instantiates with correct properties", behavior => {
        expect(behavior.agent.get(TestBehavior)).equals(behavior);
        expect(behavior.state.valueOne).equals(1);
        expect(behavior.state.valueTwo).equals(2);
        expect(behavior.events.endpointValue$Changed).instanceOf(BasicObservable);
    });

    test("unifies state", behavior => {
        const state = behavior.state;

        ({}) as IsObject<typeof state> satisfies true;

        expect(state.valueOne).equals(1);
        expect(state.valueTwo).equals(2);
    });

    it("set creates new type with proper ID and defaults", async () => {
        const NewBehavior = TestBehavior.set({ valueOne: 3 });
        TestBehavior.id satisfies "test";
        NewBehavior.id satisfies "test";

        const endpoint = await MockEndpoint.createWith(NewBehavior);
        await endpoint.act(agent => {
            const behavior = agent.test;

            const state = behavior.state;

            ({}) as IsObject<typeof state> satisfies true;

            expect(state.valueOne).equals(3);
            expect(state.valueTwo).equals(2);
        });
    });

    describe("observer", () => {
        it("triggers on endpoint, emit on endpoint", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            endpoint.events.test.endpointValue$Changed.on(() => {
                emitted = true;
            });
            endpoint.events.test.endpointValue$Changed.emit();
            expect(emitted).true;
        });

        it("triggers on endpoint, emit on behavior", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            endpoint.events.test.endpointValue$Changed.on(() => {
                emitted = true;
            });
            await endpoint.act(agent => agent.test.events.endpointValue$Changed.emit());
            expect(emitted).true;
        });

        it("triggers on behavior, emit on endpoint", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            await endpoint.act(agent =>
                agent.test.events.endpointValue$Changed.on(() => {
                    emitted = true;
                }),
            );
            endpoint.events.test.endpointValue$Changed.emit();
            expect(emitted).true;
        });

        it("triggers on behavior, emit on behavior", async () => {
            await using endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            await endpoint.act(agent =>
                agent.test.events.endpointValue$Changed.on(() => {
                    emitted = true;
                }),
            );
            await endpoint.act(agent => agent.test.events.endpointValue$Changed.emit());
            expect(emitted).true;
        });

        it("does not trigger on behavior after close", async () => {
            const endpoint = await MockEndpoint.createWith(TestBehavior);
            let emitted = false;
            await endpoint.act(agent =>
                agent.test.events.endpointValue$Changed.on(() => {
                    emitted = true;
                }),
            );
            await endpoint.close();
            endpoint.events.test.endpointValue$Changed.emit();
            expect(emitted).false;
        });
    });
});
