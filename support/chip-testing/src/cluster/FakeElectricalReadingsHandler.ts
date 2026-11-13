/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Seconds, Timer, Timestamp } from "@matter/general";
import { ElectricalEnergyMeasurementServer } from "@matter/main/behaviors/electrical-energy-measurement";
import { ElectricalPowerMeasurementServer } from "@matter/main/behaviors/electrical-power-measurement";
import { ElectricalEnergyMeasurement } from "@matter/main/clusters/electrical-energy-measurement";
import { TestEventTriggerHandler } from "./TestEventTriggerHandler.js";

/** The bits of a test event trigger that carry the endpoint.  Endpoint bits of 0 address every endpoint. */
const TRIGGER_ENDPOINT_MASK = 0x0000_ffff_0000_0000n;

// The energy reporting triggers of CHIP's TC_EnergyReporting_Utils.py
const STOP_FAKE_READINGS = 0x0091_0000_0000_0000n;
const START_FAKE_LOAD_1KW_2S = 0x0091_0000_0000_0001n;
const START_FAKE_GENERATOR_3KW_5S = 0x0091_0000_0000_0002n;

/** Readings step through this many values from base - randomness to base + randomness, as in CHIP's FakeReadings. */
const STEP_COUNT = 9;

interface FakeLoad {
    /** Positive for a load that imports energy, negative for a generator that exports it. */
    powerMw: number;
    powerRandomnessMw: number;
    voltageMv: number;
    voltageRandomnessMv: number;
    currentMa: number;
    currentRandomnessMa: number;
    interval: Duration;
}

const LOAD_1KW: FakeLoad = {
    powerMw: 1_000_000,
    powerRandomnessMw: 20_000,
    voltageMv: 230_000,
    voltageRandomnessMv: 1_000,
    currentMa: 4_348,
    currentRandomnessMa: 500,
    interval: Seconds(2),
};

const GENERATOR_3KW: FakeLoad = {
    powerMw: -3_000_000,
    powerRandomnessMw: 20_000,
    voltageMv: 230_000,
    voltageRandomnessMv: 1_000,
    currentMa: -13_043,
    currentRandomnessMa: 500,
    interval: Seconds(5),
};

/**
 * Fake readings of an electrical sensor, as CHIP's all-devices app produces them with its `FakeReadings` class for
 * the energy reporting test event triggers: a 1 kW load read every 2 seconds, a 3 kW generator read every 5 seconds,
 * and stop.  Each reading updates the ElectricalPowerMeasurement attributes and records a cumulative and a periodic
 * energy measurement in the ElectricalEnergyMeasurement cluster of the same endpoint.
 *
 * Instead of random values, each reading takes the next of {@link STEP_COUNT} values around the base value, so two
 * readings in a row always differ.
 */
export class FakeElectricalReadingsHandler extends TestEventTriggerHandler {
    declare protected internal: FakeElectricalReadingsHandler.Internal;

    override handleTestEventTrigger(eventTrigger: bigint) {
        const endpoint = Number((eventTrigger & TRIGGER_ENDPOINT_MASK) >> 32n);
        if (endpoint !== 0 && endpoint !== this.endpoint.number) {
            return false;
        }

        switch (eventTrigger & ~TRIGGER_ENDPOINT_MASK) {
            case STOP_FAKE_READINGS:
                this.#stop();
                return true;

            case START_FAKE_LOAD_1KW_2S:
                this.#start(LOAD_1KW);
                return true;

            case START_FAKE_GENERATOR_3KW_5S:
                this.#start(GENERATOR_3KW);
                return true;
        }
        return false;
    }

    #start(load: FakeLoad) {
        this.#stop();
        const { internal } = this;
        internal.load = load;
        internal.cumulativeImportedMwh = 0;
        internal.cumulativeExportedMwh = 0;
        internal.lastReadingTimestamp = undefined;
        this.#read();
        internal.timer = this.periodicReactorTimer("fake-electrical-readings", load.interval, this.#read, {
            lock: true,
        }).start();
    }

    #stop() {
        this.internal.timer?.stop();
        this.internal.timer = undefined;
    }

    #read() {
        const { internal } = this;
        const { load } = internal;
        if (load === undefined) {
            return;
        }

        const stepped = (base: number, randomness: number) =>
            base + Math.floor((internal.step * 2 * randomness) / (STEP_COUNT - 1)) - randomness;
        const powerMw = stepped(load.powerMw, load.powerRandomnessMw);
        const voltageMv = stepped(load.voltageMv, load.voltageRandomnessMv);
        const currentMa = stepped(load.currentMa, load.currentRandomnessMa);
        internal.step = (internal.step + 1) % STEP_COUNT;

        const periodMwh = Math.floor((Math.abs(powerMw) * Seconds.of(load.interval)) / 3600);
        const periodicImportedMwh = powerMw > 0 ? periodMwh : 0;
        const periodicExportedMwh = powerMw > 0 ? 0 : periodMwh;
        internal.cumulativeImportedMwh += periodicImportedMwh;
        internal.cumulativeExportedMwh += periodicExportedMwh;

        const power = this.agent.get(ElectricalPowerMeasurementServer).state;
        power.activePower = powerMw;
        power.voltage = voltageMv;
        power.activeCurrent = currentMa;

        const endTimestamp = Seconds.of(Timestamp.delta(Timestamp.zero));
        const startTimestamp = internal.lastReadingTimestamp;
        internal.lastReadingTimestamp = endTimestamp;
        const periodic = (energy: number): ElectricalEnergyMeasurement.EnergyMeasurement => ({
            energy,
            startTimestamp,
            endTimestamp,
        });
        this.agent.get(ElectricalEnergyMeasurementServer).setMeasurement({
            cumulativeEnergy: {
                imported: { energy: internal.cumulativeImportedMwh, endTimestamp },
                exported: { energy: internal.cumulativeExportedMwh, endTimestamp },
            },
            periodicEnergy: {
                imported: periodic(periodicImportedMwh),
                exported: periodic(periodicExportedMwh),
            },
        });
    }
}

export namespace FakeElectricalReadingsHandler {
    export class Internal {
        load?: FakeLoad;
        step = 0;
        cumulativeImportedMwh = 0;
        cumulativeExportedMwh = 0;

        /** The end of the previous periodic measurement, so the next one starts there. */
        lastReadingTimestamp?: number;

        timer?: Timer;
    }
}
