/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeElement as Attribute,
    bool,
    EnergyEvseMode,
    enum16,
    FieldElement as Field,
    map32,
    ModeBase,
    FeatureMap as RealFeatureMap,
    struct as realStruct,
    Scope,
    uint16,
    uint32,
    uint8,
} from "#index.js";
import { AttributeModel, ClusterModel, DatatypeModel, FieldModel, MatterModel, Model } from "#models/index.js";

const struct = realStruct.clone();
const FeatureMap = RealFeatureMap.clone();

const ThingType = new DatatypeModel({
    name: "Type",
    type: "enum16",
});

const Thing = new ClusterModel(
    {
        name: "Thing",
    },

    ThingType,

    Attribute({
        name: "Type",
        id: 1,
        type: "Type",
    }),
);

const PhysicalThingFeatureMap = FeatureMap.extend(
    {},
    Field({
        name: "XL",
        constraint: 0,
    }),
    Field({
        name: "XS",
        constraint: 1,
    }),
);

const PhysicalThingType = new DatatypeModel(
    {
        name: "Type",
        type: "enum16",
    },

    Field({ name: "Large", id: 0x0001 }),
    Field({ name: "Small", id: 0x0002 }),
    Field({ name: "ExtraLarge", id: 0x0003, conformance: "[XL]" }),
    Field({ name: "ExtraSmall", id: 0x0004, conformance: "[XS]" }),
);

const PhysicalThing = new ClusterModel(
    {
        name: "PhysicalThing",
        type: "Thing",
    },

    PhysicalThingFeatureMap,
    PhysicalThingType,
);

const BuildingType = new DatatypeModel(
    {
        name: "Type",
        type: "enum16",
    },

    Field({ name: "Tower", id: 0x1001 }),
    Field({ name: "House", id: 0x1002 }),
);

const XsBuildingHeight = new AttributeModel({
    name: "Height",
    id: 2,
    type: "uint8",
    conformance: "XS",
});

const NormalBuildingHeight = new AttributeModel({
    name: "Height",
    id: 2,
    type: "uint16",
    conformance: "!XS & !XL",
});

const XlBuildingHeight = new AttributeModel({
    name: "Height",
    id: 2,
    type: "uint32",
    conformance: "XL",
});

const ZoningViolation = new AttributeModel({
    name: "ZoningViolation",
    id: 3,
    type: "bool",
    conformance: "XL",
});

const Building = new ClusterModel(
    {
        name: "Building",
        type: "PhysicalThing",
    },

    BuildingType,
    NormalBuildingHeight,
    XsBuildingHeight,
    XlBuildingHeight,
    ZoningViolation,
);

const Matter = new MatterModel(
    {},

    map32.clone(),
    enum16.clone(),
    uint8.clone(),
    uint16.clone(),
    uint32.clone(),
    bool.clone(),
    FeatureMap,
    struct,
    Thing,
    PhysicalThing,
    Building,
);

Building.supportedFeatures = ["XS"];

Matter.finalize();

const scope = Building.scope;

function expectNames(model: Model, names: string[], options?: Scope.MemberOptions) {
    expect(scope.membersOf(model, options).map(child => child.name)).deep.equals(names);
}

describe("Scope", () => {
    it("finds shadows", () => {
        expect(scope.isShadow(BuildingType)).false;
        expect(scope.isShadow(PhysicalThingType)).true;
        expect(scope.isShadow(ThingType)).true;
    });

    it("identifies extension", () => {
        expect(scope.extensionOf(BuildingType)).undefined;
        expect(scope.extensionOf(PhysicalThingType)).equals(BuildingType);
        expect(scope.extensionOf(ThingType)).equals(BuildingType);
    });

    it("finds all members of root", () => {
        const names = ["Height", "Height", "Height", "ZoningViolation", "FeatureMap", "Type"];
        expectNames(Building, names);
    });

    it("finds all members of child", () => {
        const names = ["Tower", "House", "Large", "Small", "ExtraLarge", "ExtraSmall"];
        expectNames(BuildingType, names);
        expectNames(PhysicalThingType, names);
        expectNames(ThingType, names);
    });

    it("finds deconflicted members of root", () => {
        const options = { conformance: "deconflicted" } as const;
        const names = ["Height", "ZoningViolation", "FeatureMap", "Type"];
        expectNames(Building, names, options);
    });

    it("finds conformant members of root", () => {
        const options = { conformance: "conformant" } as const;
        const names = ["Height", "FeatureMap", "Type"];
        expectNames(Building, names, options);
    });

    it("finds conformant members of child", () => {
        const options = { conformance: "conformant" } as const;
        const names = ["Tower", "House", "Large", "Small", "ExtraSmall"];
        expectNames(BuildingType, names, options);
        expectNames(PhysicalThingType, names, options);
        expectNames(ThingType, names, options);
    });

    it("finds members of extended base", () => {
        const ModeTag = ModeBase.get(DatatypeModel, "ModeTag");
        expect(ModeTag).not.undefined;

        const baseModeTagCount = ModeBase.scope.membersOf(ModeTag!).length;
        const modeTagCount = EnergyEvseMode.scope.membersOf(ModeTag!).length;

        expect(modeTagCount).greaterThan(baseModeTagCount);

        const ModeTagStruct = ModeBase.get(DatatypeModel, "ModeTagStruct");
        expect(ModeTagStruct).not.undefined;
        const Value = ModeTagStruct!.get(FieldModel, "Value");
        expect(Value).not.undefined;

        const valueTagCount = EnergyEvseMode.scope.membersOf(Value!).length;
        expect(modeTagCount).equals(valueTagCount);
    });
});
