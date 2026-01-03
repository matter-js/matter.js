/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeUtils } from "@matter/main/behaviors/mode-base";
import { RvcRunModeServer } from "@matter/main/behaviors/rvc-run-mode";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { RvcDeviceRunModes } from "../RvcDeviceLogic.js";

/**
 * This is a custom implementation of {@link RvcRunModeServer} that makes sure that the Run Mode can not be changed
 * when the device is not in the Idle mode. SO a change from Mapping to Cleaning or such is not allowed without being
 * Idle in between which mainly means that the current operation was stopped.
 * Additionally, the run mode is set to Idle on start of the device to make sure potentially old states sre reset.
 */
export class CustomRvcRunModeServer extends RvcRunModeServer {
    override initialize() {
        super.initialize();
        this.state.currentMode = RvcDeviceRunModes.Idle; // Always start in Idle mode
    }

    /** Change more implementation. We do not call super.changeToMode() here because we want to add own validations. */
    override changeToMode({ newMode }: ModeBase.ChangeToModeRequest): ModeBase.ChangeToModeResponse {
        const result = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode);
        if (result.status !== ModeBase.ModeChangeStatus.Success) {
            return result;
        }
        if (newMode !== RvcDeviceRunModes.Idle && this.state.currentMode !== RvcDeviceRunModes.Idle) {
            return {
                status: ModeBase.ModeChangeStatus.InvalidInMode,
                statusText: `Can not switch operative modes while in a non-idle state (${this.state.currentMode})`,
            };
        }
        this.state.currentMode = newMode; // Update the new mode, needed because we do not use super.changeToMode()
        return result; // Is Success
    }
}
