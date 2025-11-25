/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Reactor } from "#behavior/Reactor.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { Contextual } from "#behavior/context/Contextual.js";
import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { Reactors } from "#behavior/internal/Reactors.js";
import { Environment, MaybePromise, Observable } from "#general";
import { hasLocalActor, Subject } from "#protocol";
import { NodeId } from "#types";

class MockAgent {
    behavior: Behavior;

    constructor(_endpoint: any, context: ActionContext) {
        this.behavior = { context } as Behavior;
    }

    get() {
        return this.behavior;
    }
}

function MockContext(offline = true) {
    const context = {
        get [Contextual.context]() {
            return this;
        },

        get context() {
            return this;
        },
    } as Record<string, unknown>;

    if (!offline) {
        context.subject = Subject.Node({ id: NodeId(1) });
    }

    return context as unknown as ActionContext;
}

class MockEndpoint {
    agent: MockAgent | undefined;
    event = Observable<[value: string, context?: ActionContext], MaybePromise<string>>();
    env = new Environment("reactor-test");
    activity = new NodeActivity();
    backing = {
        type: {} as Behavior.Type,
        endpoint: this,
        datasource: {},
        createBehavior(agent: MockAgent) {
            return agent.behavior;
        },
    } as unknown as BehaviorBacking;
    reactors: Reactors;
    results = new Array<string>();
    promise?: Promise<void>;

    get agentType() {
        return MockAgent;
    }

    agentFor(context: ActionContext) {
        if (this.agent === undefined) {
            this.agent = new MockAgent(undefined, context);
        }
        return this.agent;
    }

    constructor(isAsync = false) {
        this.event.isAsync = isAsync;
        this.env.set(NodeActivity, this.activity);
        this.reactors = new Reactors(this.backing);
    }

    reactTo(observable: Observable<any, any> = this.event, reactor: Reactor = this.reactor, options?: Reactor.Options) {
        this.reactors.add(observable, reactor, options);
    }

    reactAsync(options?: Reactor.Options) {
        this.reactTo(
            this.event,
            async (text: string) => {
                this.promise = Promise.resolve().then(() => this.reactor(text));
                await this.promise;
            },
            options,
        );
    }

    emit(text: string, context?: ActionContext) {
        return this.event.emit(text, context);
    }

    reactor = (text: string) => {
        this.results.push(text);
    };

    expectActivity(active = 1) {
        expect(this.activity.inactive.value).equals(!active);
        expect(this.activity.actors.length).equals(active);
    }
}

describe("Reactors", () => {
    it("reacts synchronously", () => {
        const endpoint = new MockEndpoint();

        endpoint.reactTo();

        void endpoint.emit("foo");
        void endpoint.emit("bar");

        endpoint.expectActivity(0);

        expect(endpoint.results).deep.equals(["foo", "bar"]);
    });

    it("reacts synchronously once", () => {
        const endpoint = new MockEndpoint();
        endpoint.reactTo(endpoint.event, endpoint.reactor, { once: true });

        void endpoint.emit("foo");
        void endpoint.emit("bar");

        endpoint.expectActivity(0);

        expect(endpoint.results).deep.equals(["foo"]);
    });

    it("reacts asynchronously", async () => {
        const endpoint = new MockEndpoint(true);
        endpoint.reactAsync();

        const promise1 = endpoint.emit("foo") as PromiseLike<string>;
        endpoint.expectActivity();
        expect(typeof promise1?.then).equals("function");

        const promise2 = endpoint.emit("bar") as PromiseLike<string>;
        endpoint.expectActivity();
        expect(typeof promise2?.then).equals("function");

        await promise1;
        endpoint.expectActivity();

        await promise2;
        endpoint.expectActivity();

        // Node activity should only stop once all reaction stops
        await MockTime.yield();
        endpoint.expectActivity(0);

        expect(endpoint.results).deep.equals(["foo", "bar"]);
    });

    it("reacts asynchronously once", async () => {
        const endpoint = new MockEndpoint(true);
        endpoint.reactAsync({ once: true });

        const promise1 = endpoint.emit("foo") as PromiseLike<string>;
        endpoint.expectActivity();
        expect(typeof promise1?.then).equals("function");

        const promise2 = endpoint.emit("bar") as PromiseLike<string>;
        endpoint.expectActivity();
        expect(promise2).undefined;

        await promise1;
        endpoint.expectActivity(0);

        await promise2;

        expect(endpoint.results).deep.equals(["foo"]);
    });

    it("reacts asynchronously with synchronous emitter", async () => {
        const endpoint = new MockEndpoint();
        endpoint.reactAsync();

        const result1 = endpoint.emit("foo") as PromiseLike<string>;
        expect(result1).equals(undefined);
        const promise1 = endpoint.promise;
        endpoint.expectActivity();
        expect(typeof promise1?.then).equals("function");

        const result2 = endpoint.emit("bar") as PromiseLike<string>;
        expect(result2).equals(undefined);
        const promise2 = endpoint.promise;
        endpoint.expectActivity();
        expect(typeof promise2?.then).equals("function");

        await promise1;
        endpoint.expectActivity();

        await promise2;

        // Since the promises come from the emitter function rather than the reactor we must wait for activity to stop
        // to ensure state is updated
        await endpoint.activity.inactive;

        endpoint.expectActivity(0);

        expect(endpoint.results).deep.equals(["foo", "bar"]);
    });

    it("waits for reaction on close", async () => {
        const endpoint = new MockEndpoint();
        endpoint.reactAsync();

        void endpoint.emit("foo");
        void endpoint.emit("bar");

        endpoint.expectActivity();
        expect(endpoint.results).deep.equals([]);

        await endpoint.reactors.close();

        endpoint.expectActivity(0);

        expect(endpoint.results).deep.equals(["foo", "bar"]);
    });

    it("waits for once reaction on close", async () => {
        const endpoint = new MockEndpoint();
        endpoint.reactAsync({ once: true });

        void endpoint.emit("foo");
        void endpoint.emit("bar");

        endpoint.expectActivity();
        expect(endpoint.results).deep.equals([]);

        await endpoint.reactors.close();

        endpoint.expectActivity(0);

        expect(endpoint.results).deep.equals(["foo"]);
    });

    it("reacts with online agent", async () => {
        const endpoint = new MockEndpoint();
        const context = MockContext(false);

        let reacted = 0;

        let reactionText: string | undefined;
        let localActor: boolean | undefined;
        let reactionContext: ActionContext | undefined;
        let reactionThis: Behavior | undefined;

        endpoint.reactTo(endpoint.event, function (this: Behavior, text: string) {
            reacted++;

            reactionText = text;
            localActor = hasLocalActor(this.context);
            reactionContext = this.context;
            reactionThis = this;
        });

        void endpoint.emit("foo", context);

        expect(reactionText).equals("foo");
        expect(localActor).false;
        expect(reactionContext).equals(context);
        expect(reactionThis).equals(endpoint.agentFor(context).get());

        expect(reacted).equals(1);
    });

    it("reacts with offline agent when agent is unavailable", async () => {
        const endpoint = new MockEndpoint();

        let reacted = 0;

        let reactionText: string | undefined;
        let localActor: boolean | undefined;

        endpoint.reactTo(endpoint.event, function (this: Behavior, text: string) {
            reacted++;

            reactionText = text;
            localActor = hasLocalActor(this.context);
        });

        void endpoint.emit("foo");

        expect(reactionText).equals("foo");
        expect(localActor).equals(true);

        expect(reacted).equals(1);
    });

    it("reacts with offline agent in offline mode", async () => {
        const endpoint = new MockEndpoint();
        const context = MockContext(false);

        let reacted = 0;

        let reactionText: string | undefined;
        let localActor: boolean | undefined;
        let reactionContext: ActionContext | undefined;

        endpoint.reactTo(
            endpoint.event,
            function (this: Behavior, text: string) {
                reacted++;

                reactionText = text;
                localActor = hasLocalActor(this.context);
                reactionContext = this.context;
            },
            { offline: true },
        );

        void endpoint.emit("foo", context);

        expect(reactionText).equals("foo");
        expect(localActor).equals(true);
        expect(reactionContext).not.undefined;
        expect(reactionContext).not.equals(context);

        expect(reacted).equals(1);
    });
});
