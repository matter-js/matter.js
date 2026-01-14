/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeUtils } from "@matter/main/behaviors/mode-base";
import { RvcCleanModeServer } from "@matter/main/behaviors/rvc-clean-mode";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";
import { CustomRvcOperationalStateServer } from "./CustomRvcOperationalStateServer.js";

/**
 * Custom implementation of the RvcCleanModeServer behavior.
 * This special class only prevents changing the clean mode when the device is in the running state.
 * That demonstrates how to handle such cases and is completely fiktional.
 */
export class CustomRvcCleanModeServer extends RvcCleanModeServer {
    override initialize() {
        super.initialize();
    }

    /** Change more implementation. We do not call super.changeToMode() here because we want to add own validations. */
    override changeToMode({ newMode }: ModeBase.ChangeToModeRequest): ModeBase.ChangeToModeResponse {
        const result = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode);
        if (result.status !== ModeBase.ModeChangeStatus.Success) {
            return result;
        }
        const state = this.endpoint.stateOf(CustomRvcOperationalStateServer).operationalState;
        if (state === RvcOperationalState.OperationalState.Running) {
            return {
                status: ModeBase.ModeChangeStatus.InvalidInMode,
                statusText: "Can not switch operative modes while device is operating.",
            };
        }
        this.state.currentMode = newMode; // Update the new mode, needed because we do not use super.changeToMode()
        return result;
    }
}
