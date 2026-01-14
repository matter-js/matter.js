/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { RvcOperationalStateServer } from "@matter/main/behaviors";
import { OperationalStateUtils } from "@matter/main/behaviors/operational-state";
import { OperationalState } from "@matter/main/clusters/operational-state";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";

export class TestRvcOperationalStateServer extends RvcOperationalStateServer.enable({
    events: { operationCompletion: true },
}) {
    override pause(): OperationalState.OperationalCommandResponse {
        const result = OperationalStateUtils.assertRvcPause(this.state.operationalState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            this.state.operationalState = OperationalState.OperationalStateEnum.Paused;
        }
        return result;
    }

    override resume(): OperationalState.OperationalCommandResponse {
        const result = OperationalStateUtils.assertRvcResume(this.state.operationalState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            // Test expectation specific to RVC
            if (
                this.state.operationalState === RvcOperationalState.OperationalState.Charging ||
                this.state.operationalState === RvcOperationalState.OperationalState.Docked
            ) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                    },
                };
            }
            this.state.operationalState = OperationalState.OperationalStateEnum.Running;
        }
        return result;
    }

    override goHome(): OperationalState.OperationalCommandResponse {
        const result = OperationalStateUtils.assertRvcGoHome(this.state.operationalState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            if (this.state.operationalState === RvcOperationalState.OperationalState.Error) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                    },
                };
            }
            this.state.operationalState = RvcOperationalState.OperationalState.SeekingCharger;
        }
        return result;
    }
}
