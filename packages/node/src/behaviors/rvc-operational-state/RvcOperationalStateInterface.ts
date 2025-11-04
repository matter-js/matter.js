/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { RvcOperationalState } from "#clusters/rvc-operational-state";

export namespace RvcOperationalStateInterface {
    export interface Base {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.4.5
         */
        pause(): MaybePromise<RvcOperationalState.OperationalCommandResponse>;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 7.4.5
         */
        resume(): MaybePromise<RvcOperationalState.OperationalCommandResponse>;

        /**
         * On receipt of this command, the device shall start seeking the charging dock, if possible in the current
         * state of the device.
         *
         * If this command is received when already in the SeekingCharger state the device shall respond with an
         * OperationalCommandResponse command with an ErrorStateID of NoError but the command shall have no other
         * effect.
         *
         * A device that receives this command in any state which does not allow seeking the charger, such as Charging
         * or Docked, shall respond with an OperationalCommandResponse command with an ErrorStateID of
         * CommandInvalidInState and shall have no other effect.
         *
         * Otherwise, on success:
         *
         *   • The OperationalState attribute shall be set to SeekingCharger.
         *
         *   • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of NoError.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 7.4.5.1
         */
        goHome(): MaybePromise<RvcOperationalState.OperationalCommandResponse>;
    }
}

export type RvcOperationalStateInterface = { components: [{ flags: {}, methods: RvcOperationalStateInterface.Base }] };
