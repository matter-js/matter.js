/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalState } from "#clusters/operational-state";
import { RvcOperationalState } from "#clusters/rvc-operational-state";
import { ImplementationError, MaybePromise } from "#general";
import { RvcOperationalStateBehavior } from "./RvcOperationalStateBehavior.js";

/**
 * This is the default server implementation of {@link RvcOperationalStateBehavior}.
 *
 * The default implementation is currently not handling all Q-Requirements of the optional CountdownTime attribute,
 * so this needs to be adjusted and implemented device specific if the attribute is used.
 *
 * To execute the basic validation for pause and resume commands the utility methods
 * `OperationalStateUtils.assertPause(this.state.operationalState)` and
 * `OperationalStateUtils.assertResume(this.state.operationalState)` can be used.
 *
 * The default implementation will send the error event and sets the device into the error state when the operational
 * error attribute is set to a value other than NoError. The error state will be cleared when the operational state
 * is set to a value other than Error.
 */
export class RvcOperationalStateServer extends RvcOperationalStateBehavior {
    override initialize(): MaybePromise {
        this.#assertOperationalStateList();
        this.#syncCurrentPhaseWithPhaseList();

        this.reactTo(this.events.operationalState$Changing, this.#assertOperationalState);

        this.reactTo(this.events.phaseList$Changed, this.#syncCurrentPhaseWithPhaseList);
        this.reactTo(this.events.currentPhase$Changing, this.#assertCurrentPhase);

        this.reactTo(this.events.operationalError$Changed, this.#handleOperationalError);
    }

    #assertOperationalStateList() {
        if (
            !this.state.operationalStateList.some(
                ({ operationalStateId }) => operationalStateId === OperationalState.OperationalStateEnum.Error,
            )
        ) {
            throw new ImplementationError(`Operational state list must at least contain an error entry.`);
        }
    }

    #syncCurrentPhaseWithPhaseList() {
        if (this.state.phaseList === null || this.state.phaseList.length === 0) {
            this.state.currentPhase = null;
        }
    }

    #assertCurrentPhase(currentPhase: number | null) {
        if (this.state.phaseList === null || this.state.phaseList.length === 0) {
            if (currentPhase === null) {
                return;
            }
            throw new ImplementationError(
                "Cannot set current phase to an other value than null when phase list is empty",
            );
        }

        if (currentPhase === null || currentPhase < 0 || currentPhase >= this.state.phaseList.length) {
            throw new ImplementationError(
                `Current phase ${currentPhase} is out of bounds for phase list of length ${this.state.phaseList.length}`,
            );
        }
    }

    #assertOperationalState(newState: number, oldState: number) {
        if (!this.state.operationalStateList.some(({ operationalStateId }) => operationalStateId === newState)) {
            throw new ImplementationError(
                `Cannot set operational state id ${newState} as it is not in the operational state list`,
            );
        }
        if (
            oldState === OperationalState.OperationalStateEnum.Error &&
            this.state.operationalError.errorStateId !== OperationalState.ErrorState.NoError &&
            newState !== OperationalState.OperationalStateEnum.Error
        ) {
            this.state.operationalError = { errorStateId: OperationalState.ErrorState.NoError };
        }
    }

    #handleOperationalError(operationalError: RvcOperationalState.ErrorStateStruct) {
        if (operationalError.errorStateId === OperationalState.ErrorState.NoError) {
            return;
        }

        if (this.state.operationalState !== RvcOperationalState.OperationalState.Error) {
            this.state.operationalState = RvcOperationalState.OperationalState.Error;
        }

        this.events.operationalError.emit({ errorState: operationalError }, this.context);
    }
}
