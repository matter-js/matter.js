/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeElement as Attribute,
    bool,
    enum8,
    int8,
    map8,
    string,
    uint32,
    uint64,
    uint8,
    ValidateModel,
} from "#index.js";
import { ClusterModel, MatterModel } from "#models/index.js";

function validateScene(type: string) {
    const Matter = new MatterModel(
        {},
        bool.clone(),
        uint8.clone(),
        uint32.clone(),
        uint64.clone(),
        int8.clone(),
        enum8.clone(),
        map8.clone(),
        string.clone(),
        new ClusterModel({ name: "Test", id: 0xfff1 }, Attribute({ name: "Scenable", id: 1, type, quality: "S" })),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => e.code === "INVALID_SCENE_TYPE");
}

describe("AttributeValidator", () => {
    describe("scene quality datatype restriction (§7.7.9)", () => {
        for (const type of ["bool", "uint8", "uint32", "enum8", "map8"]) {
            it(`accepts ${type}`, () => {
                expect(validateScene(type)).deep.equals([]);
            });
        }

        for (const type of ["uint64", "int8", "string"]) {
            it(`rejects ${type}`, () => {
                expect(validateScene(type).length).equals(1);
            });
        }
    });
});
