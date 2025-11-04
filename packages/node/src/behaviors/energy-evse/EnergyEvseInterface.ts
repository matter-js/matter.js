/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { EnergyEvse } from "#clusters/energy-evse";

export namespace EnergyEvseInterface {
    export interface Base {
        /**
         * Allows a client to disable the EVSE from charging and discharging.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.1
         */
        disable(): MaybePromise;

        /**
         * This command allows a client to enable the EVSE to charge an EV, and to provide or update the maximum and
         * minimum charge current.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2
         */
        enableCharging(request: EnergyEvse.EnableChargingRequest): MaybePromise;

        /**
         * Allows a client to put the EVSE into a self-diagnostics mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.4
         */
        startDiagnostics(): MaybePromise;
    }

    export interface V2X {
        /**
         * Upon receipt, this shall allow a client to enable the discharge of an EV, and to provide or update the
         * maximum discharge current.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3
         */
        enableDischarging(request: EnergyEvse.EnableDischargingRequest): MaybePromise;
    }

    export interface ChargingPreferences {
        /**
         * Allows a client to set the user specified charging targets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5
         */
        setTargets(request: EnergyEvse.SetTargetsRequest): MaybePromise;

        /**
         * Allows a client to retrieve the current set of charging targets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.6
         */
        getTargets(): MaybePromise<EnergyEvse.GetTargetsResponse>;

        /**
         * Allows a client to clear all stored charging targets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.8
         */
        clearTargets(): MaybePromise;
    }
}

export type EnergyEvseInterface = {
    components: [
        { flags: {}, methods: EnergyEvseInterface.Base },
        { flags: { v2X: true }, methods: EnergyEvseInterface.V2X },
        { flags: { chargingPreferences: true }, methods: EnergyEvseInterface.ChargingPreferences }
    ]
};
