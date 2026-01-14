/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { OperationalState } from "#clusters/operational-state";
import { RvcOperationalState } from "#clusters/rvc-operational-state";

export namespace OperationalStateUtils {
    export function assertPause(currentState: number): OperationalState.OperationalCommandResponse {
        if (
            currentState === OperationalState.OperationalStateEnum.Stopped ||
            currentState === OperationalState.OperationalStateEnum.Error
        ) {
            return {
                commandResponseState: {
                    errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                },
            };
        }
        return {
            commandResponseState: {
                errorStateId: OperationalState.ErrorState.NoError,
            },
        };
    }

    export function assertRvcPause(currentState: number): OperationalState.OperationalCommandResponse {
        const result = assertPause(currentState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            if (
                currentState === RvcOperationalState.OperationalState.Charging ||
                currentState === RvcOperationalState.OperationalState.Docked
            ) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                    },
                };
            }
        }
        return result;
    }

    export function assertResume(currentState: number): OperationalState.OperationalCommandResponse {
        if (
            currentState === OperationalState.OperationalStateEnum.Stopped ||
            currentState === OperationalState.OperationalStateEnum.Error
        ) {
            return {
                commandResponseState: {
                    errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                },
            };
        }
        return {
            commandResponseState: {
                errorStateId: OperationalState.ErrorState.NoError,
            },
        };
    }

    export function assertRvcResume(currentState: number): OperationalState.OperationalCommandResponse {
        const result = assertResume(currentState);
        if (result.commandResponseState.errorStateId === OperationalState.ErrorState.NoError) {
            if (currentState === RvcOperationalState.OperationalState.SeekingCharger) {
                return {
                    commandResponseState: {
                        errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                    },
                };
            }
        }
        return result;
    }

    export function assertRvcGoHome(currentState: number): OperationalState.OperationalCommandResponse {
        if (
            currentState === RvcOperationalState.OperationalState.Docked ||
            currentState === RvcOperationalState.OperationalState.Charging
        ) {
            return {
                commandResponseState: {
                    errorStateId: OperationalState.ErrorState.CommandInvalidInState,
                },
            };
        }
        return {
            commandResponseState: {
                errorStateId: OperationalState.ErrorState.NoError,
            },
        };
    }
}
