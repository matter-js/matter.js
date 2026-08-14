/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, FeatureSelectionErrors, Matter } from "#index.js";

function errorsFor(cluster: string, supported: string[]) {
    const model = Matter.get(ClusterModel, cluster)!.clone();
    model.supportedFeatures = supported;
    return FeatureSelectionErrors(model);
}

describe("FeatureSelectionErrors", () => {
    describe("choice groups", () => {
        it("requires a member of an exclusive group", () => {
            expect(errorsFor("PowerSource", [])).deep.equals(["select at least one of Wired or Battery"]);
        });

        it("rejects two members of an exclusive group", () => {
            expect(errorsFor("PowerSource", ["WIRED", "BAT"])).deep.equals([
                "features Wired and Battery cannot be selected together",
            ]);
        });

        it("accepts one member of an exclusive group", () => {
            expect(errorsFor("PowerSource", ["BAT"])).deep.equals([]);
        });

        it("requires a member of an inclusive group", () => {
            expect(errorsFor("Thermostat", [])).deep.equals(["select at least one of Heating or Cooling"]);
        });

        it("accepts several members of an inclusive group", () => {
            expect(errorsFor("Thermostat", ["HEAT", "COOL"])).deep.equals([]);
        });

        it("reports each group of a cluster with several", () => {
            expect(errorsFor("ElectricalEnergyMeasurement", [])).deep.equals([
                "select at least one of ImportedEnergy or ExportedEnergy",
                "select at least one of CumulativeEnergy or PeriodicEnergy",
            ]);
        });

        it("requires no member of a group the specification leaves provisional", () => {
            expect(errorsFor("Groupcast", [])).deep.equals([]);
            expect(errorsFor("AmbientContextSensing", [])).deep.equals([]);
        });

        it("requires a member of a group one settled member can satisfy", () => {
            expect(errorsFor("MicrowaveOvenControl", [])).deep.equals([
                "select at least one of PowerAsNumber or PowerInWatts",
            ]);
            expect(errorsFor("MicrowaveOvenControl", ["WATTS"])).deep.equals([]);
            expect(errorsFor("MicrowaveOvenControl", ["PWRNUM", "WATTS"])).deep.equals([
                "features PowerAsNumber and PowerInWatts cannot be selected together",
            ]);
        });

        it("accepts a selection that leaves a gated group without members", () => {
            expect(errorsFor("DeviceEnergyManagement", ["PA"])).deep.equals([]);
            expect(errorsFor("ClosureDimension", ["LT"])).deep.equals([]);
        });

        it("requires a member of a gated group once the gate is selected", () => {
            expect(errorsFor("ClosureDimension", ["PS"])).deep.equals([
                "select at least one of Translation, Rotation or Modulation when Positioning is selected",
            ]);
            expect(errorsFor("ClosureDimension", ["PS", "RO"])).deep.equals([]);
        });

        it("rejects a member of a gated group when the gate excludes it", () => {
            expect(errorsFor("DeviceEnergyManagement", ["PA", "SFR"])).deep.equals([
                "features StateForecastReporting and PowerAdjustment cannot be selected together",
            ]);
            expect(errorsFor("ClosureDimension", ["LT", "RO"])).deep.equals([
                "feature Positioning is mandatory when Rotation is selected",
            ]);
        });

        it("accepts a member the gate excludes when a later conformance entry admits it", () => {
            expect(errorsFor("DeviceEnergyManagement", ["PA", "PFR"])).deep.equals([]);
        });
    });

    describe("dependent features", () => {
        it("requires a feature another selected feature mandates", () => {
            expect(errorsFor("IcdManagement", ["LITS"])).deep.equals([
                "feature CheckInProtocolSupport is mandatory when LongIdleTimeSupport is selected",
                "feature UserActiveModeTrigger is mandatory when LongIdleTimeSupport is selected",
            ]);
        });

        it("accepts the mandated features when selected", () => {
            expect(errorsFor("IcdManagement", ["LITS", "CIP", "UAT"])).deep.equals([]);
        });

        it("requires a feature mandated by any of several alternatives", () => {
            expect(errorsFor("DoorLock", ["PIN"])).deep.equals([
                "feature User is mandatory when PinCredential is selected",
            ]);
            expect(errorsFor("DoorLock", ["PIN", "USR"])).deep.equals([]);
        });

        it("rejects a feature whose gating feature is absent", () => {
            expect(errorsFor("IcdManagement", ["CIP", "DSLS"])).deep.equals([
                "feature LongIdleTimeSupport is mandatory when DynamicSitLitSupport is selected",
            ]);
        });

        it("accepts a feature gated on any of several alternatives", () => {
            expect(errorsFor("CameraAvStreamManagement", ["VDO", "SNP", "ICTL"])).deep.equals([]);
            expect(errorsFor("CameraAvStreamManagement", ["SNP", "ICTL"])).deep.equals([]);
            expect(errorsFor("CameraAvSettingsUserLevelManagement", ["MZOOM", "MPRESETS"])).deep.equals([]);
        });

        it("rejects a feature when none of its gating alternatives is selected", () => {
            expect(errorsFor("CameraAvStreamManagement", ["ADO", "ICTL"])).deep.equals([
                "select at least one of Video or Snapshot when ImageControl is selected",
            ]);
            expect(errorsFor("CameraAvSettingsUserLevelManagement", ["DPTZ", "MPRESETS"])).deep.equals([
                "select at least one of MechanicalPan, MechanicalTilt or MechanicalZoom when MechanicalPresets is selected",
            ]);
        });

        it("rejects a deprecated feature", () => {
            expect(errorsFor("Thermostat", ["HEAT", "SB"])).deep.equals(["feature Setback is not allowed"]);
        });
    });

    describe("unconstrained clusters", () => {
        it("accepts an empty selection when every feature is independently optional", () => {
            expect(errorsFor("ColorControl", [])).deep.equals([]);
            expect(errorsFor("DoorLock", [])).deep.equals([]);
            expect(errorsFor("LevelControl", [])).deep.equals([]);
        });

        it("requires an unconditionally mandatory feature", () => {
            expect(errorsFor("EnergyEvse", [])).deep.equals(["feature ChargingPreferences is mandatory"]);
            expect(errorsFor("EnergyEvse", ["PREF"])).deep.equals([]);
        });
    });
});
