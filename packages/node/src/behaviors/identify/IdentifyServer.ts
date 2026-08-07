/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { MaybePromise, Observable, Seconds, Time, Timer } from "@matter/general";
import { hasRemoteActor } from "@matter/protocol";
import { Identify } from "@matter/types/clusters/identify";
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
 *
 * The following protected methods are available for override:
 * * `suppressTriggerEffect` - Decides whether the TriggerEffect command is supported by this endpoint.
 */
export class IdentifyServer extends IdentifyBehavior {
    declare protected internal: IdentifyServer.Internal;
    declare readonly state: IdentifyServer.State;
    declare readonly events: IdentifyServer.Events;

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

        this.suppressTriggerEffect();
    }

    /**
     * Withdraw support for the optional TriggerEffect command.
     *
     * Support is retained when {@link triggerEffect} is implemented rather than inherited, or when the schema
     * declares the command supported.  The latter covers device types that require the command, such as lights and
     * plug-in units, as well as `IdentifyServer.alter({ commands: { triggerEffect: { optional: false } } })` and
     * `IdentifyServer.enable({ commands: { triggerEffect: true } })`.
     *
     * Override with an empty implementation to offer the command in any other case.  Note that an override on a
     * type derived via `alter()`, `enable()` or `with()` must be public, as {@link IdentifyServer.ExtensionInterface}
     * exposes this method publicly to such types.
     *
     * Withdrawal applies to the Matter view of the endpoint.  Local invocation via the agent still runs
     * {@link triggerEffect}.
     */
    protected suppressTriggerEffect() {
        if (this.triggerEffect !== IdentifyServer.prototype.triggerEffect) {
            return;
        }

        const schema = this.type.schema;
        const command = schema.commands("triggerEffect");
        if (command === undefined || schema.scope.hasOperationalSupport(command)) {
            return;
        }

        this.triggerEffect = Behavior.unimplemented;
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

    export declare const ExtensionInterface: {
        suppressTriggerEffect(): void;
    };
}
