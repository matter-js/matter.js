/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsBehavior } from "#behaviors/general-diagnostics";
import { ModeUtils } from "#behaviors/mode-base";
import { OnOffServer } from "#behaviors/on-off";
import { ServerNode } from "#node/ServerNode.js";
import { Logger, MaybePromise } from "@matter/general";
import { Status, StatusResponseError } from "@matter/types";
import { GeneralDiagnostics } from "@matter/types/clusters/general-diagnostics";
import { ModeSelect } from "@matter/types/clusters/mode-select";
import { OnOff } from "@matter/types/clusters/on-off";
import { ModeSelectBehavior } from "./ModeSelectBehavior.js";

const logger = Logger.get("ModeSelectServer");

const ModeSelectBase = ModeSelectBehavior.with(ModeSelect.Feature.OnOff);

/**
 * This is the default server implementation of {@link ModeSelectBehavior}.
 *
 * This implementation supports StartupMode and OnMode handling, when the OnOff feature is activated. You should use
 * {@link ModeSelectServer.with} to specialize the class for the features your implementation supports. Alternatively
 * you can extend this class and override the methods you need.
 *
 * It should be sufficient to use the class without changes and just react on the currentMode changed events.
 *
 * At startup, a stored currentMode outside supportedModes is replaced by the first supported mode, and a stored
 * startUpMode or onMode outside supportedModes is set to null, each with a warning.
 */
export class ModeSelectBaseServer extends ModeSelectBase {
    override initialize(): MaybePromise {
        this.#replaceUnsupportedModes();
        this.reactTo(this.events.currentMode$Changing, this.#assertCurrentMode);
        if (this.events.startUpMode$Changing !== undefined) {
            this.reactTo(this.events.startUpMode$Changing, this.#assertWrittenMode);
        }
        this.reactTo(this.events.onMode$Changing, this.#assertWrittenMode);

        let currentModeOverridden = false;
        // When OnOff feature is active handle the OnOff dependency and potentially setting OnMode
        if (this.features.onOff && this.state.onMode !== undefined && this.state.onMode !== null) {
            const onOffServer = this.agent.get(OnOffServer);
            if (onOffServer !== undefined) {
                if (
                    onOffServer.features.lighting &&
                    "startUpOnOff" in onOffServer.state &&
                    onOffServer.state.startUpOnOff === OnOff.StartUpOnOff.On
                ) {
                    this.state.currentMode = this.state.onMode;
                    currentModeOverridden = true;
                }
                this.reactTo(onOffServer.events.onOff$Changed, this.#handleOnOffDependency);
            } else {
                logger.warn("OnOffServer not found on endpoint, but OnMode is set.");
            }
        }

        // If the currentMode is not overridden by OnMode, handle StartUpMode definition if not OTA boot
        if (
            !currentModeOverridden &&
            this.state.startUpMode !== undefined &&
            this.state.startUpMode !== null &&
            this.#getBootReason() !== GeneralDiagnostics.BootReason.SoftwareUpdateCompleted
        ) {
            this.state.currentMode = this.state.startUpMode;
        }
    }

    override changeToMode({ newMode }: ModeSelect.ChangeToModeRequest): MaybePromise {
        this.#assertModeValue("NewMode", newMode); // Generates INVALID_COMMAND on error

        this.state.currentMode = newMode;
    }

    /** Replaces a mode outside the fixed SupportedModes list, for example one stored before a firmware update. */
    #replaceUnsupportedModes() {
        const { supportedModes } = this.state;
        this.state.currentMode = ModeUtils.supportedModeOrFirst(supportedModes, this.state.currentMode, this.#owner);
        for (const attribute of ["startUpMode", "onMode"] as const) {
            const mode = this.state[attribute];
            if (mode !== undefined) {
                this.state[attribute] = ModeUtils.supportedModeOrNull(supportedModes, mode, this.#owner, attribute);
            }
        }
    }

    #assertCurrentMode(mode: number) {
        ModeUtils.assertMode(this.state.supportedModes, mode);
    }

    #assertWrittenMode(mode: number | null | undefined) {
        if (mode === undefined || mode === null) {
            return;
        }
        if (!ModeUtils.isSupported(this.state.supportedModes, mode)) {
            throw new StatusResponseError(`Mode ${mode} is not in supportedModes`, Status.ConstraintError);
        }
    }

    get #owner() {
        return `${this.endpoint}.${this.type.id}`;
    }

    #assertModeValue(fieldName: string, mode: number): void {
        if (!ModeUtils.isSupported(this.state.supportedModes, mode)) {
            throw new StatusResponseError(
                `Mode ${mode} provided in ${fieldName} is not supported`,
                Status.InvalidCommand,
            );
        }
    }

    #handleOnOffDependency(newValue: boolean, oldValue: boolean): void {
        if (newValue && !oldValue && this.state.onMode !== undefined && this.state.onMode !== null) {
            this.state.currentMode = this.state.onMode;
        }
    }

    #getBootReason() {
        const rootEndpoint = this.env.get(ServerNode);
        if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
            return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
        }
    }
}

// Drop the features the base implementation enables internally so consumers select their own
export class ModeSelectServer extends ModeSelectBaseServer.with() {}
