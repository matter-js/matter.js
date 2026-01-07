/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeUtils } from "@matter/main/behaviors/mode-base";
import { RvcRunModeServer } from "@matter/main/behaviors/rvc-run-mode";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";
import { TestRvcOperationalStateServer } from "./TestRvcOperationalStateServer.js";

export class TestRvcRunModeServer extends RvcRunModeServer {
    override async changeToMode({ newMode }: ModeBase.ChangeToModeRequest): Promise<ModeBase.ChangeToModeResponse> {
        const result = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode);
        if (result.status !== ModeBase.ModeChangeStatus.Success) {
            return result;
        }
        if (newMode === 0) {
            if (this.state.currentMode === 1) {
                await this.endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.SeekingCharger,
                });
            }
        } else if (newMode === 1) {
            if (this.state.currentMode === 0) {
                await this.endpoint.setStateOf(TestRvcOperationalStateServer, {
                    operationalState: RvcOperationalState.OperationalState.Running,
                });
            }
        } else if (newMode === 2) {
            if (this.state.currentMode === 1) {
                return {
                    status: ModeBase.ModeChangeStatus.InvalidInMode,
                    statusText: "Can not switch operative modes while device is operating.",
                };
            }
        }
        this.state.currentMode = newMode; // Update the new mode, needed because we do not use super.changeToMode()
        return result; // Is Success
    }
}
