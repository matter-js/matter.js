/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import {
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    FeatureMap,
    FieldModel,
    MatterModel,
    RequirementModel,
} from "@matter/model";
import { createNode, violationsOf } from "./validation-helpers.js";

/**
 * A model whose OnOffLight requires OnOff with its Lighting feature under {@link conformance}, sharing
 * {@link OnOffLightDevice.deviceType}'s ID with the real device type so a real endpoint resolves against it.
 */
function lightingFeatureModel(conformance: string) {
    const featureMap = FeatureMap.clone();
    featureMap.children = [
        new FieldModel({ name: "LT", title: "Lighting", constraint: "0" }),
        new FieldModel({ name: "OFFONLY", title: "OffOnly", constraint: "2" }),
    ];

    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel(
            { name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" },
            new ConditionModel({ name: "Wanted" }),
            new RequirementModel(
                { name: "OnOff", id: 6, element: "serverCluster", conformance: "M" },
                new RequirementModel({ name: "LT", element: "feature", conformance }),
            ),
        ),
        new ClusterModel({ name: "OnOff", id: 6, children: [featureMap] }),
    );
    model.finalize();
    return model;
}

describe("model-scoped lookups", () => {
    it("does not leak a device type resolved in one model into a later pass resolved in another", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        // Both models declare OnOffLight under the same device type ID, so a leaked cache entry from the first model
        // would answer the second lookup too, with the first model's conformance
        expect(violationsOf(light, lightingFeatureModel("OFFONLY")).map(v => [v.kind, v.requirement])).deep.equals([
            ["disallowed", "OnOff.LT"],
        ]);
        expect(violationsOf(light, lightingFeatureModel("Wanted | OFFONLY"))).deep.equals([]);

        await node.close();
    });
});
