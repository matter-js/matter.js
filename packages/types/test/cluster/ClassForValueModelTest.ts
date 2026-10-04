/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassForValueModel } from "#cluster/ClassForValueModel.js";
import { Groups } from "#clusters/groups.js";
import { Thermostat } from "#clusters/thermostat.js";
import { ImplementationError } from "@matter/general";
import { ClusterModel, DatatypeModel, FieldElement as Field, Matter, MatterModel, map64 } from "@matter/model";

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
        const model = new MatterModel(
            {},
            map64.clone(),
            new ClusterModel(
                { name: "Wide", id: 0xfff1 },
                new DatatypeModel(
                    { name: "WideBitmap", type: "map64" },
                    Field({ name: "Low", constraint: "0" }),
                    Field({ name: "High", constraint: "32 to 33" }),
                ),
            ),
        );
        model.finalize();
        const WideBitmap = ClassForValueModel(model.get(ClusterModel, "Wide")!.datatypes("WideBitmap")!);

        expect({ ...new WideBitmap(2 ** 33 + 1) }).deep.equal({ low: true, high: 2 });
    });
});

describe("ClassForValueModel", () => {
    it("refuses a model that is neither struct nor bitmap", () => {
        expect(() => ClassForValueModel(Matter.clusters.require("OnOff").attributes.require("OnOff"))).throw(
            ImplementationError,
            /only supports struct and bitmap/,
        );
    });
});
