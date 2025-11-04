/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { DeviceEnergyManagement } from "#clusters/device-energy-management";

export namespace DeviceEnergyManagementInterface {
    export interface PowerAdjustment {
        /**
         * Allows a client to request an adjustment in the power consumption of an ESA for a specified duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.1
         */
        powerAdjustRequest(request: DeviceEnergyManagement.PowerAdjustRequest): MaybePromise;

        /**
         * Allows a client to cancel an ongoing PowerAdjustmentRequest operation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.2
         */
        cancelPowerAdjustRequest(): MaybePromise;
    }

    export interface Pausable {
        /**
         * Allows a client to temporarily pause an operation and reduce the ESAs energy demand.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.4
         */
        pauseRequest(request: DeviceEnergyManagement.PauseRequest): MaybePromise;

        /**
         * Allows a client to cancel the PauseRequest command and enable earlier resumption of operation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.5
         */
        resumeRequest(): MaybePromise;
    }

    export interface StartTimeAdjustment {
        /**
         * Allows a client to adjust the start time of a Forecast sequence that has not yet started operation (i.e.
         * where the current Forecast StartTime is in the future).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.3
         */
        startTimeAdjustRequest(request: DeviceEnergyManagement.StartTimeAdjustRequest): MaybePromise;
    }

    export interface ForecastAdjustment {
        /**
         * Allows a client to modify a Forecast within the limits allowed by the ESA.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.6
         */
        modifyForecastRequest(request: DeviceEnergyManagement.ModifyForecastRequest): MaybePromise;
    }

    export interface ConstraintBasedAdjustment {
        /**
         * Allows a client to ask the ESA to recompute its Forecast based on power and time constraints.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.7
         */
        requestConstraintBasedForecast(request: DeviceEnergyManagement.RequestConstraintBasedForecastRequest): MaybePromise;
    }

    export interface StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustment {
        /**
         * Allows a client to request cancellation of a previous adjustment request in a StartTimeAdjustRequest,
         * ModifyForecastRequest or RequestConstraintBasedForecast command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.2.9.8
         */
        cancelRequest(): MaybePromise;
    }
}

export type DeviceEnergyManagementInterface = {
    components: [
        { flags: { powerAdjustment: true }, methods: DeviceEnergyManagementInterface.PowerAdjustment },
        { flags: { pausable: true }, methods: DeviceEnergyManagementInterface.Pausable },
        { flags: { startTimeAdjustment: true }, methods: DeviceEnergyManagementInterface.StartTimeAdjustment },
        { flags: { forecastAdjustment: true }, methods: DeviceEnergyManagementInterface.ForecastAdjustment },
        {
            flags: { constraintBasedAdjustment: true },
            methods: DeviceEnergyManagementInterface.ConstraintBasedAdjustment
        },
        {
            flags: { startTimeAdjustment: true },
            methods: DeviceEnergyManagementInterface.StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustment
        },
        {
            flags: { forecastAdjustment: true },
            methods: DeviceEnergyManagementInterface.StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustment
        },
        {
            flags: { constraintBasedAdjustment: true },
            methods: DeviceEnergyManagementInterface.StartTimeAdjustmentOrForecastAdjustmentOrConstraintBasedAdjustment
        }
    ]
};
