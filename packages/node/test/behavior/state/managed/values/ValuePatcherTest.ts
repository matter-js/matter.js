/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ThermostatServer } from "#behaviors/thermostat";
import { ClusterModel, DataModelPath, FeatureMap, FeatureSet } from "@matter/model";
import { Val } from "@matter/protocol";
import { Thermostat } from "@matter/types/clusters/thermostat";

/**
 * A cluster with a list of structs whose members are gated by a feature.  "Extra" carries a schema fallback and is
 * optional whenever the feature is active; "Required" carries one and is mandatory whenever the feature is active.
 */
const Widgets = new ClusterModel({
    id: 0xfff1fc01,
    name: "Widgets",

    children: [
        FeatureMap.extend({ children: [{ tag: "field", name: "EXT", description: "Extras", constraint: "0" }] }),

        {
            tag: "attribute",
            id: 0x0,
            name: "Widgets",
            type: "list",
            conformance: "M",

            children: [
                {
                    tag: "field",
                    name: "entry",
                    type: "WidgetStruct",
                },
            ],
        },

        {
            tag: "datatype",
            name: "WidgetStruct",
            type: "struct",

            children: [
                { tag: "field", id: 0x0, name: "Id", type: "uint16", conformance: "M" },
                { tag: "field", id: 0x1, name: "Extra", type: "uint16", conformance: "[EXT]", default: 4 },
                { tag: "field", id: 0x2, name: "Required", type: "uint16", conformance: "EXT", default: 7 },
            ],
        },
    ],
});

function patchWidget(features: string[], widget: Val.Struct) {
    const schema = Widgets.clone();
    schema.supportedFeatures = new FeatureSet(features);

    const supervisor = RootSupervisor.for(schema);

    return (
        supervisor.patch({ widgets: [widget] }, {}, new DataModelPath("Widgets")) as {
            widgets: Val.Struct[];
        }
    ).widgets[0];
}

function patchPreset(...features: Thermostat.Feature[]) {
    const type = ThermostatServer.with(Thermostat.Feature.Presets, ...features);

    const state = RootSupervisor.for(type.schema!).patch(
        { presets: [{ presetHandle: null, presetScenario: Thermostat.PresetScenario.Occupied }] },
        {},
        new DataModelPath("Thermostat"),
    ) as { presets: Val.Struct[] };

    return state.presets[0];
}

describe("ValuePatcher", () => {
    it("omits the fallback of a field the active features disallow", () => {
        expect(patchWidget([], { id: 1 })).deep.equals({ id: 1 });
    });

    it("omits the fallback of a field the active features leave optional", () => {
        expect(patchWidget(["EXT"], { id: 1 }).extra).equals(undefined);
    });

    it("applies the fallback of a field the active features make mandatory", () => {
        expect(patchWidget(["EXT"], { id: 1 }).required).equals(7);
    });

    it("applies a fallback in the units the datatype encodes", () => {
        // The schema states 26°C; state carries the wire units of the temperature datatype
        expect(patchPreset(Thermostat.Feature.Cooling).coolingSetpoint).equals(2600);
    });

    it("applies defaults per feature set rather than per schema", () => {
        // Thermostat variants share the identity of the nested PresetStruct schema, so defaults cached against the
        // schema alone serve the first variant's fallbacks to the second
        expect(patchPreset(Thermostat.Feature.Cooling).coolingSetpoint).equals(2600);
        expect(patchPreset(Thermostat.Feature.Heating).coolingSetpoint).equals(undefined);
    });
});
