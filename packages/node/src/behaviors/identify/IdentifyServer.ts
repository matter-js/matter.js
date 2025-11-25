/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Identify } from "#clusters/identify";
import { MaybePromise, Observable, Seconds, Time, Timer } from "#general";
import { hasRemoteActor } from "@matter/protocol";
import { IdentifyBehavior } from "./IdentifyBehavior.js";

/**
 * This is the default server implementation of {@link IdentifyBehavior}.
 *
 * This implementation includes all features of {@link Identify.Cluster} and implements all mandatory commands. You should use
 * {@link IdentifyServer.with} to specialize the class for the features your implementation supports. Alternatively
 * you can extend this class and override the methods you need to change or add mandatory commands.
 *
 * Beside the standard state values the following additional state values are available:
 * * `isIdentifying` - Indicates if the device is currently identifying.
 *
 * Beside the standard events the following additional events are available:
 * * `startIdentifying` - Emitted when the device starts identifying. Use it to start your own identifying logic. This is mandatory.
 * * `stopIdentifying` - Emitted when the device stops identifying. This is mandatory.
 * * `effectTriggered` - Emitted when an effect should be triggered. Use it to trigger the effect. Depending on the device type this is mandatory!
 */
export class IdentifyServer extends IdentifyBehavior {
    declare protected internal: IdentifyServer.Internal;
    declare state: IdentifyServer.State;
    declare events: IdentifyServer.Events;

    override initialize(): MaybePromise {
        if (this.state.identifyType === undefined) {
            this.state.identifyType = Identify.IdentifyType.None;
        }

        this.events.identifyTime$Changed.quiet.config = {
            shouldEmit: (newValue, oldValue, context) =>
                hasRemoteActor(context) || ((oldValue === 0 || newValue === 0) && newValue !== oldValue)
                    ? "now"
                    : false,
            suppressionEnabled: false,
        };

        // TODO - identifyTime should become virtual attribute with timer to update isIdentifying
        // Enable I/2.4 once this is done
        this.internal.identifyTimer = Time.getPeriodicTimer(
            "Identify time update",
            Seconds.one,
            this.callback(this.#identifyTick, { lock: true }),
        );

        // So whenever the attribute OR the identify command was invoked we react to it.
        this.reactTo(this.events.identifyTime$Changed, this.#identifyTimeChangedHandler);
    }

    #startIdentifying() {
        if (!this.internal.identifyTimer?.isRunning) {
            this.internal.identifyTimer?.start();
            this.state.isIdentifying = true;
            this.events.startIdentifying.emit();
        }
    }

    #stopIdentifying() {
        if (this.internal.identifyTimer?.isRunning) {
            this.internal.identifyTimer?.stop();
            this.state.isIdentifying = false;
            this.events.stopIdentifying.emit();
        }
    }

    #identifyTimeChangedHandler() {
        if (this.state.identifyTime === 0) {
            this.#stopIdentifying();
        } else {
            this.#startIdentifying();
        }
    }

    override async [Symbol.asyncDispose]() {
        this.#stopIdentifying();
        await super[Symbol.asyncDispose]?.();
    }

    #identifyTick() {
        let time = (this.state.identifyTime ?? 0) - 1;
        if (time <= 0) {
            time = 0;
        }
        this.state.identifyTime = time;
    }

    override identify({ identifyTime }: Identify.IdentifyRequest): MaybePromise {
        this.state.identifyTime = identifyTime;
    }

    override triggerEffect(effect: Identify.TriggerEffectRequest): MaybePromise {
        this.events.effectTriggered.emit(effect);
    }
}

export namespace IdentifyServer {
    export class Internal {
        identifyTimer?: Timer;
    }

    export class State extends IdentifyBehavior.State {
        isIdentifying: boolean = false;
    }

    export class Events extends IdentifyBehavior.Events {
        startIdentifying = Observable();
        stopIdentifying = Observable();
        effectTriggered = Observable<[effect: Identify.TriggerEffectRequest]>();
    }
}
