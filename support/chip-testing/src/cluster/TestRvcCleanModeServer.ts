/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeUtils } from "@matter/main/behaviors/mode-base";
import { RvcCleanModeServer } from "@matter/main/behaviors/rvc-clean-mode";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { TestRvcRunModeServer } from "./TestRvcRunModeServer.js";

export class TestRvcCleanModeServer extends RvcCleanModeServer {
    override async changeToMode({ newMode }: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
        const result = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode);
        if (result.status !== ModeBase.ModeChangeStatus.Success) {
            return result;
        }
        if (this.endpoint.stateOf(TestRvcRunModeServer).currentMode !== 0) {
            return {
                status: ModeBase.ModeChangeStatus.InvalidInMode,
                statusText: "Can not switch operative modes while device is operating.",
            };
        }

        this.state.currentMode = newMode; // Update the new mode, needed because we do not use super.changeToMode()
        return result; // Is Success
    }
}
