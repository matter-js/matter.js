/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsBehavior } from "#behaviors/general-diagnostics";
import { ScenesManagementServer } from "#behaviors/scenes-management";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { OnOff } from "#clusters/on-off";
import { MaybePromise, Millis, Time, Timer } from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { hasRemoteActor, Val } from "#protocol";
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

        if (this.agent.has(ScenesManagementServer)) {
            this.agent.get(ScenesManagementServer).implementScenes(this, this.#applySceneValues);
            this.reactTo(this.events.onOff$Changed, this.#clearDelayedSceneApplyData);
        }
    }

    override async [Symbol.asyncDispose]() {
        this.internal.timedOnTimer?.stop();
        this.internal.delayedOffTimer?.stop();
        await super[Symbol.asyncDispose]?.();
    }

    override on(): MaybePromise {
        if (!this.state.onOff) {
            this.#invalidateScenes();
        }
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

    /** Invalidate all stored scenes manually for this endpoint in the Scenesmanagement cluster because SDK behavior. */
    #invalidateScenes() {
        this.agent.maybeGet(ScenesManagementServer)?.makeAllFabricSceneInfoEntriesInvalid();
    }

    override off(): MaybePromise {
        if (this.state.onOff) {
            this.#invalidateScenes();
        }
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
     */
    override offWithEffect(): MaybePromise {
        if (this.state.globalSceneControl) {
            if (hasRemoteActor(this.context) && this.context.session.fabric !== undefined) {
                this.endpoint
                    .agentFor(this.context)
                    .maybeGet(ScenesManagementServer)
                    ?.storeGlobalScene(this.context.session.fabric.fabricIndex);
            }
            this.state.globalSceneControl = false;
        }
        return this.off();
    }

    override async onWithRecallGlobalScene() {
        if (this.state.globalSceneControl) {
            return;
        }
        if (
            hasRemoteActor(this.context) &&
            this.context.session.fabric !== undefined &&
            this.agent.has(ScenesManagementServer)
        ) {
            await this.endpoint
                .agentFor(this.context)
                .maybeGet(ScenesManagementServer)
                ?.recallGlobalScene(this.context.session.fabric.fabricIndex);
        }

        this.state.globalSceneControl = true;
        if (this.state.onTime === 0) {
            this.state.offWaitTime = 0;
        }
        await this.on();
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
                Millis(100),
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
                Millis(100),
                this.callback(this.#delayedOffTick, { lock: true }),
            );
        }
        return timer;
    }

    /** Apply Scene values when requested from ScenesManagement cluster */
    #applySceneValues(values: Val.Struct, transitionTime: number): MaybePromise {
        this.#clearDelayedSceneApplyData();

        const onOff = values.onOff;
        // If no number (including null) or outside our range, ignore
        if (typeof onOff !== "boolean" || this.state.onOff === onOff) {
            return;
        }

        if (transitionTime === 0) {
            if (onOff) {
                return this.on();
            }
            return this.off();
        }
        this.internal.applyScenePendingOnOff = onOff;
        this.internal.applySceneDelayTimer = Time.getTimer(
            "delayed scene apply",
            Millis(transitionTime),
            this.callback(this.#applyDelayedSceneOnOffValue),
        ).start();
    }

    #clearDelayedSceneApplyData() {
        if (this.internal.applySceneDelayTimer?.isRunning) {
            this.internal.applySceneDelayTimer.stop();
        }
        this.internal.applySceneDelayTimer = undefined;
        this.internal.applyScenePendingOnOff = undefined;
    }

    async #applyDelayedSceneOnOffValue() {
        const onOff = this.internal.applyScenePendingOnOff;
        this.#clearDelayedSceneApplyData();
        if (onOff === undefined) {
            return;
        }
        if (onOff) {
            return this.on();
        }
        return this.off();
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
        applySceneDelayTimer?: Timer;
        applyScenePendingOnOff?: boolean;
    }
}

// We had turned on some more features to provide a default implementation, but export the cluster with default
// Features again.
export class OnOffServer extends OnOffBaseServer.with() {}
