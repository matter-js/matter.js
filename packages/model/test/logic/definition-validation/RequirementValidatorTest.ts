/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidateModel } from "#index.js";
import { DeviceTypeModel, MatterModel, RequirementModel } from "#models/index.js";

/** A device type requiring the same component twice, as Battery Storage requires two electrical sensors */
function withComponents(...instances: (number | undefined)[]) {
    const Matter = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Composite", id: 0xff01, classification: "simple" },
            ...instances.map(
                instance => new RequirementModel({ name: "PowerSource", id: 0x11, element: "deviceType", instance }),
            ),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.map(error => error.code);
}

/** A requirement that is not a component, so an instance number means nothing on it */
function withNumberedAttributes(...instances: (number | undefined)[]) {
    const Matter = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Numbered", id: 0xff02, classification: "simple" },
            new RequirementModel(
                { name: "OnOff", id: 0x6, element: "serverCluster" },
                ...instances.map(instance => new RequirementModel({ name: "OnTime", element: "attribute", instance })),
            ),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.map(error => error.code);
}

describe("RequirementValidator", () => {
    describe("a component required in several instances", () => {
        it("accepts one requirement per instance", () => {
            expect(withComponents(1, 2)).deep.equals([]);
        });

        it("reports two requirements for one instance", () => {
            expect(withComponents(1, 1)).deep.equals(["DUPLICATE_CHILD", "DUPLICATE_CHILD"]);
        });

        it("reports two requirements stating no instance", () => {
            expect(withComponents(undefined, undefined)).deep.equals(["DUPLICATE_CHILD", "DUPLICATE_CHILD"]);
        });
    });

    describe("an instance number where the specification states none", () => {
        it("reports it, and still reports the duplicate it would otherwise hide", () => {
            expect(withNumberedAttributes(1, 2)).deep.equals([
                "DUPLICATE_CHILD",
                "INSTANCE_NOT_APPLICABLE",
                "INSTANCE_NOT_APPLICABLE",
            ]);
        });

        it("accepts an attribute requirement stating no instance", () => {
            expect(withNumberedAttributes(undefined)).deep.equals([]);
        });
    });
});
