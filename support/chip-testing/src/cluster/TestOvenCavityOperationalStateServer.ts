/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OvenCavityOperationalStateServer } from "@matter/main/behaviors";
import { OperationalState } from "@matter/main/clusters/operational-state";
import { OvenCavityOperationalState } from "@matter/main/clusters/oven-cavity-operational-state";

export class TestOvenCavityOperationalStateServer extends OvenCavityOperationalStateServer.enable({
    events: { operationCompletion: true },
}) {
    declare state: TestOvenCavityOperationalStateServer.State;

    override start(): OvenCavityOperationalState.OperationalCommandResponse {
        if (this.state.startBlocked) {
            return {
                commandResponseState: {
                    errorStateId: OperationalState.ErrorState.UnableToStartOrResume,
                },
            };
        }

        this.state.operationalState = OperationalState.OperationalStateEnum.Running;
        return {
            commandResponseState: {
                errorStateId: OperationalState.ErrorState.NoError,
            },
        };
    }

    override stop(): OvenCavityOperationalState.OperationalCommandResponse {
        this.state.operationalState = OperationalState.OperationalStateEnum.Stopped;
        this.events.operationCompletion.emit(
            {
                completionErrorCode: OperationalState.ErrorState.NoError,
            },
            this.context,
        );
        return {
            commandResponseState: {
                errorStateId: OperationalState.ErrorState.NoError,
            },
        };
    }
}

export namespace TestOvenCavityOperationalStateServer {
    export class State extends OvenCavityOperationalStateServer.State {
        startBlocked: boolean = false;
    }
}
