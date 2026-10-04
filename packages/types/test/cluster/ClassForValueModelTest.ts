/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassForValueModel } from "#cluster/ClassForValueModel.js";
import { Groups } from "#clusters/groups.js";
import { Thermostat } from "#clusters/thermostat.js";
import { ImplementationError } from "@matter/general";
import {
    ClusterModel,
    DatatypeElement,
    DatatypeModel,
    FieldElement,
    FieldElement as Field,
    Matter,
    MatterModel,
    map64,
} from "@matter/model";

describe("ClassForValueModel bitmap classes", () => {
    it("apply the defaults the bitmap's members state", () => {
        expect({ ...new Groups.NameSupportAttribute() }).deep.equal({ groupNames: true });
    });

    it("set every member from a numeric value, a multi-bit member at its full width", () => {
        expect({ ...new Thermostat.HvacSystemType(0b100111) }).deep.equal({
            coolingStage: 3,
            heatingStage: 1,
            heatingIsHeatPump: false,
            heatingUsesFuel: true,
        });
    });

    it("set a member above bit 31 from a numeric value", () => {
        const WideBitmap = classFor(
            Field({ name: "Low", constraint: "0" }),
            Field({ name: "High", constraint: "32 to 33" }),
        );
        expect({ ...new WideBitmap(2 ** 33 + 1) }).deep.equal({ low: true, high: 2 });
    });

    it("name every member when the members' defaults are all clear", () => {
        const Bitmap = classFor(
            Field({ name: "Flag", constraint: "0", default: 0 }),
            Field({ name: "Stages", constraint: "1 to 2", default: 0 }),
        );
        expect({ ...new Bitmap() }).deep.equal({ flag: false, stages: 0 });
    });

    it("leave out a member the bitmap's conformance excludes, even when its bit is set", () => {
        const Bitmap = classFor(
            Field({ name: "Kept", constraint: "0" }),
            Field({ name: "Dropped", constraint: "1", conformance: "X" }),
        );
        expect({ ...new Bitmap(0b11) }).deep.equal({ kept: true });
    });

    it("clear a member with no upper bound whose default is set when constructed from 0", () => {
        const Bitmap = classFor(Field({ name: "Rest", constraint: "min 4", default: 3 }));
        expect({ ...new Bitmap() }).deep.equal({ rest: 3 });
        expect({ ...new Bitmap(0) }).deep.equal({ rest: 0 });
    });

    it("construct empty when the bitmap's default is null", () => {
        const Bitmap = classFor(Field({ name: "Flag", constraint: "0" }));
        expect({ ...new Bitmap() }).deep.equal({});

        const Nullable = classForDatatype({ name: "TestBitmap", type: "map64", quality: "X", default: null }, [
            Field({ name: "Flag", constraint: "0" }),
        ]);
        expect({ ...new Nullable() }).deep.equal({});
    });

    it("key a FeatureMap feature by its title whether set or clear", () => {
        const FeatureMap = ClassForValueModel(Matter.clusters.require("Groups").attributes.require("FeatureMap"));
        expect({ ...new FeatureMap(0) }).deep.equal({ groupNames: false });
        expect({ ...new FeatureMap(1) }).deep.equal({ groupNames: true });
    });
});

function classFor(...members: FieldElement[]) {
    return classForDatatype({ name: "TestBitmap", type: "map64" }, members);
}

function classForDatatype(definition: DatatypeElement.Properties, members: FieldElement[]) {
    const model = new MatterModel(
        {},
        map64.clone(),
        new ClusterModel({ name: "Test", id: 0xfff1 }, new DatatypeModel(definition, ...members)),
    );
    model.finalize();
    return ClassForValueModel(model.get(ClusterModel, "Test")!.datatypes(definition.name)!);
}

describe("ClassForValueModel", () => {
    it("refuses a model that is neither struct nor bitmap", () => {
        expect(() => ClassForValueModel(Matter.clusters.require("OnOff").attributes.require("OnOff"))).throw(
            ImplementationError,
            /only supports struct and bitmap/,
        );
    });
});
