/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement as Attribute, uint8, ValidateModel } from "#index.js";
import { ClusterModel, MatterModel } from "#models/index.js";

function bindableErrorsOf(cluster: ClusterModel) {
    const Matter = new MatterModel({}, uint8.clone(), cluster);
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => e.source?.endsWith("Test") && e.message.includes("bindable"));
}

function testCluster(bindable?: boolean) {
    return new ClusterModel({ name: "Test", id: 0xfff1, bindable }, Attribute({ name: "Value", id: 1, type: "uint8" }));
}

describe("ClusterValidator", () => {
    // Characterization: passes without the bindable check too; the rejection test below covers the check
    it("accepts a boolean bindable", () => {
        expect(bindableErrorsOf(testCluster(false))).deep.equals([]);
    });

    it("rejects a bindable that is not a boolean", () => {
        // An override is plain data, so its value may be of any type
        const cluster = Object.assign(testCluster(), { bindable: "false" });

        expect(bindableErrorsOf(cluster).map(e => e.code)).deep.equals(["NON_STRING_PROPERTY"]);
    });
});
