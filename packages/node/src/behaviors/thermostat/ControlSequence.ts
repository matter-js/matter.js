/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Thermostat } from "@matter/types/clusters/thermostat";

const SEQUENCES_WITHOUT_HEATING = new Set([
    Thermostat.ControlSequenceOfOperation.CoolingOnly,
    Thermostat.ControlSequenceOfOperation.CoolingWithReheat,
]);

const SEQUENCES_WITHOUT_COOLING = new Set([
    Thermostat.ControlSequenceOfOperation.HeatingOnly,
    Thermostat.ControlSequenceOfOperation.HeatingWithReheat,
]);

const HEATING_SYSTEM_MODES = new Set([Thermostat.SystemMode.Heat, Thermostat.SystemMode.EmergencyHeat]);

const COOLING_SYSTEM_MODES = new Set([Thermostat.SystemMode.Cool, Thermostat.SystemMode.Precooling]);

/**
 * Which heating and cooling modes a Thermostat ControlSequenceOfOperation allows.  The Thermostat and the Thermostat
 * Mode behaviors both use these rules.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.3.10.16
 */
export namespace ControlSequence {
    /** Whether a thermostat with these features may heat in the sequence. */
    export function allowsHeating(features: { heating: boolean }, sequence: Thermostat.ControlSequenceOfOperation) {
        return features.heating && !SEQUENCES_WITHOUT_HEATING.has(sequence);
    }

    /** Whether a thermostat with these features may cool in the sequence. */
    export function allowsCooling(features: { cooling: boolean }, sequence: Thermostat.ControlSequenceOfOperation) {
        return features.cooling && !SEQUENCES_WITHOUT_COOLING.has(sequence);
    }

    /** Whether the sequence allows the SystemMode.  Heat and EmergencyHeat need heating, Cool and Precooling cooling. */
    export function allowsSystemMode(sequence: Thermostat.ControlSequenceOfOperation, mode: Thermostat.SystemMode) {
        return !(
            (HEATING_SYSTEM_MODES.has(mode) && SEQUENCES_WITHOUT_HEATING.has(sequence)) ||
            (COOLING_SYSTEM_MODES.has(mode) && SEQUENCES_WITHOUT_COOLING.has(sequence))
        );
    }

    /** Whether the sequence allows the ThermostatRunningMode. */
    export function allowsRunningMode(
        sequence: Thermostat.ControlSequenceOfOperation,
        mode: Thermostat.ThermostatRunningMode,
    ) {
        return !(
            (mode === Thermostat.ThermostatRunningMode.Heat && SEQUENCES_WITHOUT_HEATING.has(sequence)) ||
            (mode === Thermostat.ThermostatRunningMode.Cool && SEQUENCES_WITHOUT_COOLING.has(sequence))
        );
    }
}
