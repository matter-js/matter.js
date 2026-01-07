/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterElement, ClusterModel, Matter, MatterElement, MatterModel } from "#index.js";
import { MergedModel } from "#logic/index.js";

// Utility function to perform merge.  Type resolution works differently
// without the global types in MatterModel so we fake that up even though we're
// only actuall merge the input models
function merge({ spec, chip }: { spec: MatterElement.Child; chip: MatterElement.Child }) {
    const specMatter = new MatterModel({ name: "Spec" }, ...Matter.seedGlobals, spec);
    const chipMatter = new MatterModel({ name: "Chip" }, ...Matter.seedGlobals, chip);

    return MergedModel("1.1", {
        spec: specMatter.children[specMatter.children.length - 1],
        chip: chipMatter.children[chipMatter.children.length - 1],
    });
}

describe("MergedModels", () => {
    it("merges children by ID", () => {
        expect(merge(Fixtures.OccupancySensing).children.length).equal(1);
    });

    it("prefers spec name", () => {
        expect(merge(Fixtures.OccupancySensing).name).equal("OccupancySensing");
    });

    it("adds mismatched children", () => {
        expect(merge(Fixtures.OccupancySensing).children[0].children.length).equal(1);
    });

    it("merges with missing datatype", () => {
        expect(merge(Fixtures.ModeSelect).children.length).equal(2);
    });

    it("merges datatypes", () => {
        expect(merge(Fixtures.BasicInformation).children.length).equal(2);
    });

    it("merges datatypes with different names", () => {
        const variants = {
            spec: Fixtures.BasicInformation.spec,
            chip: new ClusterModel(Fixtures.BasicInformation.chip),
        };
        variants.chip.datatypes[0].name = "CapabilityMaximaStruct";
        variants.chip.attributes[0].type = "CapabilityMaximaStruct";
        const merged = merge(variants) as ClusterModel;
        expect(merged.children.length).equal(2);
        expect(merged.datatypes[0].name).equal("CapabilityMinimaStruct");
    });

    it("merges referenced bitmap into direct bitmap", () => {
        const merged = merge(Fixtures.WindowCovering);
        expect(merged.children.length).equal(1);
        expect(merged.children[0].type).equal("map8");
        expect(merged.children[0].children.length).equal(4);
    });
});

namespace Fixtures {
    export const OccupancySensing = {
        spec: ClusterElement({
            id: 0x0406,
            name: "OccupancySensing",
            children: [
                {
                    tag: "datatype",
                    name: "OccupancyBitmap",
                    type: "bitmap8",
                },
            ],
        }),

        chip: ClusterElement({
            id: 0x0406,
            name: "OccupancyShmensing",
            children: [
                {
                    tag: "datatype",
                    name: "OccupancyBitmap",
                    children: [{ tag: "field", id: 0x0001, name: "Occupied" }],
                },
            ],
        }),
    };

    export const ModeSelect = {
        spec: ClusterElement({
            tag: "cluster",
            id: 0x0050,
            name: "ModeSelect",
            classification: "application",
            description: "Mode Select",
            children: [
                {
                    tag: "attribute",
                    id: 0x0002,
                    name: "SupportedModes",
                    access: "R V",
                    conformance: "M",
                    constraint: "max 255",
                    default: "MS",
                    quality: "F",
                    type: "list",
                    children: [
                        {
                            tag: "datatype",
                            name: "entry",
                            type: "ModeOptionStruct",
                        },
                    ],
                },
            ],
        }),

        chip: ClusterElement({
            tag: "cluster",
            id: 0x0050,
            name: "ModeSelect",
            classification: "application",
            description: "Mode Select",
            children: [
                {
                    tag: "attribute",
                    id: 0x0002,
                    name: "SupportedModes",
                    conformance: "M",
                    type: "list",
                    children: [
                        {
                            tag: "datatype",
                            name: "entry",
                            type: "ModeOptionStruct",
                        },
                    ],
                },

                {
                    tag: "datatype",
                    name: "ModeOptionStruct",
                    conformance: "M",
                    type: "struct",
                    children: [
                        {
                            tag: "field",
                            name: "Label",
                            conformance: "M",
                            type: "string",
                        },

                        {
                            tag: "field",
                            name: "Mode",
                            conformance: "M",
                            type: "uint8",
                        },

                        {
                            tag: "field",
                            name: "SemanticTags",
                            conformance: "M",
                            type: "SemanticTagStruct",
                        },
                    ],
                },
            ],
        }),
    };

    export const BasicInformation = {
        spec: ClusterElement({
            name: "BasicInformation",
            id: 0x39,
            classification: "endpoint",
            children: [
                {
                    tag: "attribute",
                    name: "CapabilityMinima",
                    id: 0x13,
                    type: "CapabilityMinimaStruct",
                    access: "R V",
                    conformance: "M",
                    quality: "F",
                },
                {
                    tag: "datatype",
                    name: "CapabilityMinimaStruct",
                    type: "struct",
                    children: [
                        {
                            tag: "field",
                            name: "CaseSessionsPerFabric",
                            id: 0x0,
                            type: "uint16",
                            conformance: "M",
                            constraint: "min 3",
                            default: 3,
                        },
                        {
                            tag: "field",
                            name: "SubscriptionsPerFabric",
                            id: 0x1,
                            type: "uint16",
                            conformance: "M",
                            constraint: "min 3",
                            default: 3,
                        },
                    ],
                },
            ],
        }),

        chip: ClusterElement({
            name: "BasicInformation",
            id: 0x28,
            description: "Basic Information",
            children: [
                {
                    tag: "attribute",
                    name: "CapabilityMinima",
                    id: 0x13,
                    type: "CapabilityMinimaStruct",
                    conformance: "M",
                },
                {
                    tag: "datatype",
                    name: "CapabilityMinimaStruct",
                    type: "struct",
                    conformance: "M",
                    children: [
                        { tag: "field", name: "CaseSessionsPerFabric", type: "uint16", conformance: "M" },
                        { tag: "field", name: "SubscriptionsPerFabric", type: "uint16", conformance: "M" },
                    ],
                },
            ],
        }),
    };

    export const WindowCovering = {
        spec: ClusterElement({
            tag: "cluster",
            name: "WindowCovering",
            id: 0x102,

            children: [
                {
                    tag: "attribute",
                    name: "Mode",
                    id: 0x17,
                    type: "map8",
                    access: "RW VM",
                    conformance: "M",
                    default: 0,
                    quality: "N",
                    xref: { document: "cluster", section: "5.3.5.21" },
                },
            ],
        }),

        chip: ClusterElement({
            tag: "cluster",
            name: "WindowCovering",
            id: 0x102,
            description: "Window Covering",

            children: [
                {
                    tag: "attribute",
                    name: "WcMode",
                    id: 0x17,
                    type: "Mode",
                    access: "RW VM",
                    conformance: "M",
                    default: 0,
                },

                {
                    tag: "datatype",
                    name: "Mode",
                    type: "map8",
                    conformance: "M",
                    children: [
                        {
                            tag: "field",
                            name: "MotorDirectionReversed",
                            constraint: "1",
                            conformance: "M",
                        },

                        {
                            tag: "field",
                            name: "CalibrationMode",
                            constraint: "2",
                            conformance: "M",
                        },

                        {
                            tag: "field",
                            name: "MaintenanceMode",
                            constraint: "3",
                            conformance: "M",
                        },

                        {
                            tag: "field",
                            name: "LedFeedback",
                            constraint: "4",
                            conformance: "M",
                        },
                    ],
                },
            ],
        }),
    };
}
