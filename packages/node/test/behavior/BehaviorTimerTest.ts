/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Reactor } from "#behavior/Reactor.js";
import { Millis, Timer } from "@matter/general";
import { MockEndpoint } from "../endpoint/mock-endpoint.js";

const reactions = new Array<number>();

class TimerBehavior extends Behavior {
    static override readonly id = "timerTest";
    declare state: TimerBehavior.State;

    createTimer(reactor: Reactor<[], unknown>, options?: Behavior.TimerOptions) {
        return this.timer("test", Millis(1000), reactor, options);
    }

    createPeriodicTimer(reactor: Reactor<[], unknown>) {
        return this.periodicTimer("test periodic", Millis(1000), reactor);
    }

    react() {
        expect(this).instanceOf(TimerBehavior);
        reactions.push(reactions.length + 1);
    }
}

namespace TimerBehavior {
    export class State {
        value = 0;
    }
}

function createEndpoint() {
    return MockEndpoint.createWith(TimerBehavior);
}

type TimerEndpoint = Awaited<ReturnType<typeof createEndpoint>>;

function timerOf(endpoint: TimerEndpoint, reactor: Reactor<[], unknown> = TimerBehavior.prototype.react) {
    return endpoint.act(agent => agent.timerTest.createTimer(reactor));
}

function periodicTimerOf(endpoint: TimerEndpoint, reactor: Reactor<[], unknown> = TimerBehavior.prototype.react) {
    return endpoint.act(agent => agent.timerTest.createPeriodicTimer(reactor));
}

function gate() {
    let release!: () => void;
    const promise = new Promise<void>(resolve => (release = resolve));
    return { promise, release };
}

describe("Behavior timers", () => {
    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        reactions.length = 0;
    });

    it("are created stopped and react bound to the behavior when they expire", async () => {
        await using endpoint = await createEndpoint();
        const timer = await timerOf(endpoint);

        expect(timer.isRunning).false;
        timer.start();
        await MockTime.advance(999);
        expect(reactions).deep.equals([]);

        await MockTime.advance(1);
        expect(reactions).deep.equals([1]);
        expect(timer.isRunning).false;

        await MockTime.advance(5000);
        expect(reactions).deep.equals([1]);
    });

    it("do not react once stopped", async () => {
        await using endpoint = await createEndpoint();
        const timer = await timerOf(endpoint);

        timer.start();
        await MockTime.advance(500);
        timer.stop();
        await MockTime.advance(5000);

        expect(reactions).deep.equals([]);
    });

    it("react once per run when restarted", async () => {
        await using endpoint = await createEndpoint();
        const timer = await timerOf(endpoint);

        timer.start();
        await MockTime.advance(500);
        timer.start();
        await MockTime.advance(600);
        expect(reactions).deep.equals([]);

        await MockTime.advance(400);
        expect(reactions).deep.equals([1]);

        timer.start();
        await MockTime.advance(1000);
        expect(reactions).deep.equals([1, 2]);
    });

    it("react at each interval while periodic", async () => {
        await using endpoint = await createEndpoint();
        const timer = await periodicTimerOf(endpoint);

        timer.start();
        await MockTime.advance(3000);
        expect(reactions).deep.equals([1, 2, 3]);

        timer.stop();
        await MockTime.advance(3000);
        expect(reactions).deep.equals([1, 2, 3]);
    });

    it("do not start a reaction that waited for an earlier one once stopped", async () => {
        await using endpoint = await createEndpoint();
        let release!: () => void;
        const gate = new Promise<void>(resolve => (release = resolve));
        async function slowReact(this: TimerBehavior) {
            reactions.push(reactions.length + 1);
            await gate;
        }
        const timer = await periodicTimerOf(endpoint, slowReact);

        timer.start();
        await MockTime.advance(2000);
        expect(reactions).deep.equals([1]);

        timer.stop();
        release();
        await MockTime.yield3();
        await MockTime.advance(1);

        expect(reactions).deep.equals([1]);
    });

    it("do not start a reaction that waits for the behavior lock once stopped", async () => {
        await using endpoint = await createEndpoint();
        const timer = await endpoint.act(agent =>
            agent.timerTest.createTimer(TimerBehavior.prototype.react, { lock: true }),
        );
        const holder = gate();
        const holding = endpoint.act(async agent => {
            agent.timerTest.state.value = 1;
            await holder.promise;
        });

        timer.start();
        await MockTime.advance(1000);
        timer.stop();
        holder.release();
        await holding;
        await MockTime.yield3();
        await MockTime.advance(1);

        expect(reactions).deep.equals([]);
    });

    it("stop when the behavior closes", async () => {
        const endpoint = await createEndpoint();
        const timer = await periodicTimerOf(endpoint);

        timer.start();
        await endpoint.close();

        expect(timer.isRunning).false;
        await MockTime.advance(3000);
        expect(reactions).deep.equals([]);
    });

    it("do not start a reaction that waits for the behavior lock once the behavior closes", async () => {
        await using endpoint = await createEndpoint();
        const timer = await endpoint.act(agent =>
            agent.timerTest.createTimer(TimerBehavior.prototype.react, { lock: true }),
        );
        const holder = gate();
        const holding = endpoint.act(async agent => {
            agent.timerTest.state.value = 1;
            await holder.promise;
        });

        timer.start();
        await MockTime.advance(1000);
        const closed = endpoint.behaviors.backingFor(TimerBehavior).close();
        holder.release();
        await holding;
        await MockTime.resolve(closed);

        expect(reactions).deep.equals([]);
    });

    it("do not start while the behavior closes", async () => {
        await using endpoint = await createEndpoint();
        const reaction = gate();
        let startedDuringClose: Timer | undefined;
        async function restartLater(this: TimerBehavior) {
            await reaction.promise;
            startedDuringClose = this.createTimer(TimerBehavior.prototype.react).start();
        }
        const timer = await timerOf(endpoint, restartLater);

        timer.start();
        await MockTime.advance(1000);
        // The backing waits for the running reaction before it completes the close
        const closed = endpoint.behaviors.backingFor(TimerBehavior).close();
        reaction.release();
        await MockTime.resolve(closed);

        expect(startedDuringClose?.isRunning).false;
        await MockTime.advance(5000);
        expect(reactions).deep.equals([]);
    });
});
