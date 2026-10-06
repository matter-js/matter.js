/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Duration, MaybePromise, Observable, Time, Timer } from "@matter/general";
import type { Behavior } from "../Behavior.js";
import type { Reactor } from "../Reactor.js";
import type { BehaviorBacking } from "./BehaviorBacking.js";

/**
 * A {@link Timer} owned by a behavior; see {@link Behavior.timer}.
 *
 * Each start installs a reactor for that run only.  Stopping releases it, as does the end of the reaction to the expiry
 * of a one-shot timer, so restarting or replacing the timer does not accumulate reactors.  A timer does not start once
 * its behavior closes.
 */
export class BehaviorTimer implements Timer {
    readonly #backing: BehaviorBacking;
    readonly #timer: Timer;
    readonly #reactor: Reactor<[], unknown>;
    readonly #options?: Behavior.TimerOptions;
    #run?: Observable<[], unknown>;

    constructor(
        backing: BehaviorBacking,
        name: string,
        interval: Duration,
        periodic: boolean,
        reactor: Reactor<[], unknown>,
        options?: Behavior.TimerOptions,
    ) {
        this.#backing = backing;
        this.#reactor = reactor;
        this.#options = options;

        const expire = () => this.#run?.emit();
        this.#timer = periodic ? Time.getPeriodicTimer(name, interval, expire) : Time.getTimer(name, interval, expire);
    }

    get name() {
        return this.#timer.name;
    }

    get utility() {
        return this.#timer.utility;
    }

    set utility(utility: boolean) {
        this.#timer.utility = utility;
    }

    get systemId() {
        return this.#timer.systemId;
    }

    get interval() {
        return this.#timer.interval;
    }

    set interval(interval: Duration) {
        this.#timer.interval = interval;
    }

    get isPeriodic() {
        return this.#timer.isPeriodic;
    }

    get elapsed(): Diagnostic.Elapsed | undefined {
        return this.#timer.elapsed;
    }

    get isRunning() {
        return this.#timer.isRunning;
    }

    start() {
        this.stop();
        if (!this.#backing.addRunningTimer(this)) {
            return this;
        }

        const run = Observable<[], unknown>();
        const reactor = this.#reactor;
        const backing = this.#backing;
        const timer = this;

        // A reaction still waiting for its lock or for an earlier reaction when the timer stops, restarts or closes must
        // not run, so an expired one-shot timer stays tracked until its reaction ends
        function react(this: Behavior) {
            if (timer.#run !== run) {
                return;
            }
            if (timer.isPeriodic) {
                return reactor.call(this);
            }
            return MaybePromise.finally(
                () => reactor.call(this),
                () => {
                    if (timer.#run === run) {
                        backing.deleteRunningTimer(timer);
                    }
                },
            );
        }
        Object.defineProperty(react, "name", { value: reactor.name });

        this.#backing.reactTo(run, react, this.#timer.isPeriodic ? this.#options : { ...this.#options, once: true });
        this.#run = run;
        this.#timer.start();
        return this;
    }

    stop() {
        this.#timer.stop();
        this.#backing.deleteRunningTimer(this);
        if (this.#run) {
            this.#backing.detachReactors(this.#run);
            this.#run = undefined;
        }
        return this;
    }
}
