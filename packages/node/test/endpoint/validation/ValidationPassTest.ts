/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import { ImplementationError } from "@matter/general";
import {
    ClusterModel,
    ConditionModel,
    conditionScopeOf,
    DeviceTypeModel,
    DeviceTypeValidationPass,
    FeatureMap,
    FieldModel,
    Matter,
    MatterModel,
    RequirementModel,
} from "@matter/model";
import { createNode, serverPass, violationsOf } from "./validation-helpers.js";

function requireDeviceType(name: string) {
    const deviceType = Matter.deviceTypes(name);
    if (deviceType === undefined) {
        throw new ImplementationError(`Test fixture names unknown device type ${name}`);
    }
    return deviceType;
}

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
    it("resolves a device type's conditions once per model, shared by every pass resolved in it", () => {
        const deviceType = requireDeviceType("OnOffLight");

        // RequirementResolver.conditionsOf() allocates a fresh Map on every call, so identity here proves the second
        // pass reused the first pass's cache entry instead of resolving again.
        const first = conditionScopeOf(deviceType, serverPass(Matter));
        const second = conditionScopeOf(deviceType, serverPass(Matter));
        expect(second).equals(first);
    });

    it("does not leak a device type resolved in one model into a later pass resolved in another", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        // Both models declare OnOffLight under the same device type ID, so a leaked cache entry from the first model
        // would answer the second lookup too, with the first model's conformance.
        expect(violationsOf(light, lightingFeatureModel("OFFONLY")).map(v => [v.kind, v.requirement])).deep.equals([
            ["disallowed", "OnOff.LT"],
        ]);
        expect(violationsOf(light, lightingFeatureModel("Wanted | OFFONLY"))).deep.equals([]);

        await node.close();
    });
});

describe("DeviceTypeValidationPass.Memory", () => {
    it("weighs only the changes noted while it holds a value", async () => {
        const node = await createNode();
        const memory = new DeviceTypeValidationPass.Memory();

        memory.changed(node);
        memory.hold([]);
        memory.revise(() => true);
        expect(memory.generation).equals(0);

        memory.changed(node);
        memory.revise(() => true);
        expect(memory.generation).equals(1);

        await node.close();
    });

    it("weighs each noted change once", async () => {
        const node = await createNode();
        const memory = new DeviceTypeValidationPass.Memory();
        memory.hold([]);

        memory.changed(node);
        memory.revise(() => false);
        memory.revise(() => true);
        expect(memory.generation).equals(0);

        await node.close();
    });

    it("forgets what it noted and watched once it discards", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const memory = new DeviceTypeValidationPass.Memory();
        memory.hold([light]);
        memory.changed(light);
        memory.changed(node);
        memory.revise(() => true);
        expect(memory.generation).equals(1);

        memory.changed(node);
        memory.hold([]);
        memory.revise(() => true);
        memory.changed(light);
        memory.revise(() => false);
        expect(memory.generation).equals(1);

        await node.close();
    });

    it("discards what it holds on a change to a watched endpoint whatever the test says", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const memory = new DeviceTypeValidationPass.Memory();
        memory.hold([light]);

        memory.changed(node);
        memory.revise(() => false);
        expect(memory.generation).equals(0);

        memory.changed(light);
        memory.revise(() => false);
        expect(memory.generation).equals(1);

        await node.close();
    });
});
