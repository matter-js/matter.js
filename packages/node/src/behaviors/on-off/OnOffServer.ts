/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsBehavior } from "#behaviors/general-diagnostics";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { OnOff } from "#clusters/on-off";
import { MaybePromise, Time, Timer } from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { OnOffBehavior } from "./OnOffBehavior.js";

const OnOffLogicBase = OnOffBehavior.with(OnOff.Feature.Lighting);

/**
 * This is the default server implementation of {@link OnOffBehavior}.
 *
 * This implementation includes all features of {@link OnOff.Cluster}. You should use {@link OnOffServer.with} to
 * specialize the class for the features your implementation supports. Alternatively you can extend this class and
 * override the methods you need to change or add mandatory commands.
 *
 * The "OffOnly" and "Lighting" features are automatically supported because the commands are disabled by conformance.
 * The default implementation do not contain any logic for the DeadFrontBehavior feature because this is very use case
 * specific, so this needs to be implemented by the device implementor as needed.
 */
export class OnOffBaseServer extends OnOffLogicBase {
    declare protected internal: OnOffBaseServer.Internal;

    override initialize(): MaybePromise {
        if (this.features.lighting && this.#getBootReason() !== GeneralDiagnostics.BootReason.SoftwareUpdateCompleted) {
            const startUpOnOffValue = this.state.startUpOnOff ?? null;
            const currentOnOffStatus = this.state.onOff;
            if (startUpOnOffValue !== null) {
                const targetOnOffValue =
                    startUpOnOffValue === OnOff.StartUpOnOff.Toggle
                        ? !currentOnOffStatus
                        : startUpOnOffValue === OnOff.StartUpOnOff.On;
                if (targetOnOffValue !== currentOnOffStatus) {
                    this.state.onOff = targetOnOffValue;
                }
            }
        }
    }

    override async [Symbol.asyncDispose]() {
        this.internal.timedOnTimer?.stop();
        this.internal.delayedOffTimer?.stop();
        await super[Symbol.asyncDispose]?.();
    }

    override on(): MaybePromise {
        this.state.onOff = true;
        if (this.features.lighting) {
            this.state.globalSceneControl = true;
            if (!this.timedOnTimer.isRunning) {
                if (this.delayedOffTimer.isRunning) {
                    this.delayedOffTimer.stop();
                }
                this.state.offWaitTime = 0;
            }
        }
    }

    override off(): MaybePromise {
        this.state.onOff = false;
        if (this.features.lighting) {
            if (this.timedOnTimer.isRunning) {
                this.timedOnTimer.stop();
                if ((this.state.offWaitTime ?? 0) > 0) {
                    this.delayedOffTimer.start();
                }
            }
            this.state.onTime = 0;
        }
    }

    /**
     * Default implementation notes:
     * This method uses the on/off methods when timed actions should occur. This means that it is enough to override
     * on() and off() with custom control logic.
     */
    override toggle(): MaybePromise {
        if (this.state.onOff) {
            return this.off();
        } else {
            return this.on();
        }
    }

    /**
     * Default implementation notes:
     * * This implementation ignores the effect and just calls off().
     * * Global Scene Control is not supported yet.
     */
    override offWithEffect(): MaybePromise {
        if (this.state.globalSceneControl) {
            // TODO Store state in global scene
            this.state.globalSceneControl = false;
        }
        return this.off();
    }

    /**
     * Default implementation notes:
     * * Global Scene Control is not supported yet, so the device is just turned on.
     */
    override onWithRecallGlobalScene(): MaybePromise {
        if (this.state.globalSceneControl) {
            return;
        }
        // TODO Recall global scene to set onOff accordingly
        this.state.globalSceneControl = true;
        if (this.state.onTime === 0) {
            this.state.offWaitTime = 0;
        }
        return this.on();
    }

    /**
     * Default implementation notes:
     * * This method uses the on/off methods when timed actions should occur. This means that it is enough to override
     * on() and off() with custom control logic.
     */
    override onWithTimedOff({ onOffControl, offWaitTime, onTime }: OnOff.OnWithTimedOffRequest): MaybePromise {
        if (onOffControl.acceptOnlyWhenOn && !this.state.onOff) {
            return;
        }

        if (this.delayedOffTimer.isRunning && !this.state.onOff) {
            // We are already in "delayed off state".  This means offWaitTime > 0 and the device is off now
            this.state.offWaitTime = Math.min(offWaitTime ?? 0, this.state.offWaitTime ?? 0);
            return;
        }

        this.state.onTime = Math.max(onTime ?? 0, this.state.onTime ?? 0);
        this.state.offWaitTime = offWaitTime;
        if (this.state.onTime !== 0 && this.state.offWaitTime !== 0) {
            // Specs talk about 0xffff aka "uint16 overflow", we set to 0 if negative
            this.timedOnTimer.start();
        }
        return this.on();
    }

    protected get timedOnTimer() {
        let timer = this.internal.timedOnTimer;
        if (timer === undefined) {
            timer = this.internal.timedOnTimer = Time.getPeriodicTimer(
                "Timed on",
                100,
                this.callback(this.#timedOnTick, { lock: true }),
            );
        }
        return timer;
    }

    async #timedOnTick() {
        let time = (this.state.onTime ?? 0) - 1;
        if (time <= 0) {
            time = 0;
            this.internal.timedOnTimer?.stop();
            this.state.offWaitTime = 0;
            await this.off();
        }
        this.state.onTime = time;
    }

    protected get delayedOffTimer() {
        let timer = this.internal.delayedOffTimer;
        if (timer === undefined) {
            timer = this.internal.delayedOffTimer = Time.getPeriodicTimer(
                "Delayed off",
                100,
                this.callback(this.#delayedOffTick, { lock: true }),
            );
        }
        return timer;
    }

    #delayedOffTick() {
        let time = (this.state.offWaitTime ?? 0) - 1;
        if (time <= 0) {
            time = 0;
            this.internal.delayedOffTimer?.stop(); // Delayed off ended
        }
        this.state.offWaitTime = time;
    }

    #getBootReason() {
        const rootEndpoint = this.env.get(ServerNode);
        if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
            return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
        }
    }
}

export namespace OnOffBaseServer {
    export class Internal {
        timedOnTimer?: Timer;
        delayedOffTimer?: Timer;
    }
}

// We had turned on some more features to provide a default implementation, but export the cluster with default
// Features again.
export class OnOffServer extends OnOffBaseServer.with() {}
