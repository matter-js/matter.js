/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncObservable } from "@matter/main";
import { OperationalStateUtils } from "@matter/main/behaviors/operational-state";
import { RvcOperationalStateServer } from "@matter/main/behaviors/rvc-operational-state";
import { OperationalState } from "@matter/main/clusters/operational-state";
import { RvcOperationalState } from "@matter/main/clusters/rvc-operational-state";

const RvcOperationalStateServerWithCompletionEvent = RvcOperationalStateServer.enable({
    events: { operationCompletion: true },
});

/**
 * This is a custom implementation of {@link RvcOperationalStateServer} that implements the needed methods goHome,
 * pause and resume, that are optional and so can not be implemented in the base class.
 * It also, adds custom events to the server that can be used by the device logic to more easily react on the needed
 * actions.
 */
export class CustomRvcOperationalStateServer extends RvcOperationalStateServerWithCompletionEvent {
    declare events: CustomRvcOperationalStateServer.Events;

    override async goHome(): Promise<RvcOperationalState.OperationalCommandResponse> {
        const result = OperationalStateUtils.assertRvcGoHome(this.state.operationalState);
        if (
            result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError &&
            this.state.operationalState !== RvcOperationalState.OperationalState.SeekingCharger
        ) {
            await this.events.goHomeTriggered.emit();
        }
        return result;
    }

    override async pause(): Promise<RvcOperationalState.OperationalCommandResponse> {
        const result = OperationalStateUtils.assertPause(this.state.operationalState);
        if (
            result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError &&
            this.state.operationalState !== RvcOperationalState.OperationalState.Paused
        ) {
            if (
                this.state.operationalState === RvcOperationalState.OperationalState.Charging ||
                this.state.operationalState === RvcOperationalState.OperationalState.Docked ||
                this.state.operationalState === RvcOperationalState.OperationalState.EmptyingDustBin ||
                this.state.operationalState === RvcOperationalState.OperationalState.CleaningMop ||
                this.state.operationalState === RvcOperationalState.OperationalState.FillingWaterTank ||
                this.state.operationalState === RvcOperationalState.OperationalState.UpdatingMaps
            ) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                    },
                };
            }
            await this.events.pauseTriggered.emit();
        }
        return result;
    }

    override async resume(): Promise<RvcOperationalState.OperationalCommandResponse> {
        const result = OperationalStateUtils.assertResume(this.state.operationalState);
        if (
            result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError &&
            this.state.operationalState !== RvcOperationalState.OperationalState.Paused
        ) {
            if (
                this.state.operationalState === RvcOperationalState.OperationalState.SeekingCharger ||
                this.state.operationalState === RvcOperationalState.OperationalState.EmptyingDustBin ||
                this.state.operationalState === RvcOperationalState.OperationalState.CleaningMop ||
                this.state.operationalState === RvcOperationalState.OperationalState.FillingWaterTank ||
                this.state.operationalState === RvcOperationalState.OperationalState.UpdatingMaps
            ) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                    },
                };
            }
        } else {
            await this.events.resumeTriggered.emit();
        }
        return result;
    }
}

export namespace CustomRvcOperationalStateServer {
    export class Events extends RvcOperationalStateServerWithCompletionEvent.Events {
        resumeTriggered = AsyncObservable();
        pauseTriggered = AsyncObservable();
        goHomeTriggered = AsyncObservable();
    }
}
