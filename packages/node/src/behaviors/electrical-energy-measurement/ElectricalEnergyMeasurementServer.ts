/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElectricalEnergyMeasurement } from "#clusters/electrical-energy-measurement";
import { ClusterType } from "#types";
import { ElectricalEnergyMeasurementBehavior } from "./ElectricalEnergyMeasurementBehavior.js";

const ElectricalEnergyMeasurementBase = ElectricalEnergyMeasurementBehavior.for(
    ElectricalEnergyMeasurement.Complete,
).with(
    ElectricalEnergyMeasurement.Feature.CumulativeEnergy,
    ElectricalEnergyMeasurement.Feature.PeriodicEnergy,
    ElectricalEnergyMeasurement.Feature.ImportedEnergy,
    ElectricalEnergyMeasurement.Feature.ExportedEnergy,
);

/**
 * Helper Type for setMeasurement method to be used to set the measurement values together and handle as an atomic set
 * to also trigger single events for imported and exported energy values.
 */
type AtomicElectricalEnergyMeasurement = {
    cumulativeEnergy?: {
        imported?: ElectricalEnergyMeasurement.EnergyMeasurement;
        exported?: ElectricalEnergyMeasurement.EnergyMeasurement;
    };
    periodicEnergy?: {
        imported?: ElectricalEnergyMeasurement.EnergyMeasurement;
        exported?: ElectricalEnergyMeasurement.EnergyMeasurement;
    };
};

/**
 * This is the default server implementation of {@link ElectricalEnergyMeasurementBehavior}.
 *
 * The Matter specification requires the ElectricalEnergyMeasurement cluster to support features we do not enable by
 * default. You should use {@link ElectricalEnergyMeasurementServer.with} to specialize the class for the features your
 * implementation supports.
 */
export class ElectricalEnergyMeasurementBaseServer extends ElectricalEnergyMeasurementBase {
    /**
     * Convenience method to set the measurement values for the cluster in an atomic way. This method updates the
     * attributes with the provided data and also sends the events for the imported and exported energy values.
     */
    setMeasurement(measurement: AtomicElectricalEnergyMeasurement) {
        if (this.features.cumulativeEnergy) {
            const useImported = measurement.cumulativeEnergy?.imported !== undefined && this.features.importedEnergy;
            const useExported = measurement.cumulativeEnergy?.exported !== undefined && this.features.exportedEnergy;
            if (useImported) {
                this.state.cumulativeEnergyImported = measurement.cumulativeEnergy!.imported;
            }
            if (useExported) {
                this.state.cumulativeEnergyExported = measurement.cumulativeEnergy!.exported;
            }
            if (useImported || useExported) {
                this.events.cumulativeEnergyMeasured?.emit(
                    {
                        energyImported: measurement.cumulativeEnergy?.imported,
                        energyExported: measurement.cumulativeEnergy?.exported,
                    },
                    this.context,
                );
            }
        }
        if (this.features.periodicEnergy) {
            const useImported = measurement.periodicEnergy?.imported !== undefined && this.features.importedEnergy;
            const useExported = measurement.periodicEnergy?.exported !== undefined && this.features.exportedEnergy;
            if (useImported) {
                this.state.periodicEnergyImported = measurement.periodicEnergy!.imported;
            }
            if (useExported) {
                this.state.periodicEnergyExported = measurement.periodicEnergy!.exported;
            }
            if (useImported || useExported) {
                this.events.periodicEnergyMeasured?.emit(
                    {
                        energyImported: measurement.periodicEnergy?.imported,
                        energyExported: measurement.periodicEnergy?.exported,
                    },
                    this.context,
                );
            }
        }
    }
}

export namespace ElectricalEnergyMeasurementBaseServer {
    export declare const ExtensionInterface: {
        setMeasurement(measurement: AtomicElectricalEnergyMeasurement): void;
    };
}

// Reset all Features
export class ElectricalEnergyMeasurementServer extends ElectricalEnergyMeasurementBaseServer.for(
    ClusterType(ElectricalEnergyMeasurement.Base),
) {}
