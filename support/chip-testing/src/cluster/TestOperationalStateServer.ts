/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OperationalStateServer } from "@matter/main/behaviors";
import { OperationalStateUtils } from "@matter/main/behaviors/operational-state";
import { OperationalState } from "@matter/main/clusters/operational-state";

export class TestOperationalStateServer extends OperationalStateServer.enable({
    events: { operationCompletion: true },
}) {
    declare state: TestOperationalStateServer.State;

    override pause(): OperationalState.OperationalCommandResponse {
        const result = OperationalStateUtils.assertPause(this.state.operationalState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            this.state.operationalState = OperationalState.OperationalStateEnum.Paused;
        }
        return result;
    }

    override resume(): OperationalState.OperationalCommandResponse {
        const result = OperationalStateUtils.assertResume(this.state.operationalState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            if (this.state.startBlocked) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.UnableToStartOrResume,
                    },
                };
            }
            this.state.operationalState = OperationalState.OperationalStateEnum.Running;
        }
        return result;
    }

    override start(): OperationalState.OperationalCommandResponse {
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

    override stop(): OperationalState.OperationalCommandResponse {
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

export namespace TestOperationalStateServer {
    export class State extends OperationalStateServer.State {
        startBlocked: boolean = false;
    }
}
