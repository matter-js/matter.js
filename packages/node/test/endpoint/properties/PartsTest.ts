/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { MockEndpointType } from "../../behavior/mock-behavior.js";
import { MockEndpoint } from "../mock-endpoint.js";

function createParent() {
    return new MockEndpoint(MockEndpointType, { number: 1 });
}

function createParentAndChild() {
    return new MockEndpoint(MockEndpointType, { number: 2, owner: undefined });
}

function createChild() {
    return new MockEndpoint(MockEndpointType, { number: 3, owner: undefined });
}

async function assembleIncrementally(
    assemble: (child: Endpoint, parent: Endpoint, grandparent: Endpoint) => Promise<void>,
) {
    const grandparent = new MockEndpoint(MockEndpointType);
    const parent = new MockEndpoint(MockEndpointType, { owner: undefined });
    const child = new MockEndpoint(MockEndpointType, { owner: undefined });

    await assemble(child, parent, grandparent);

    await child.construction;

    expect(grandparent.number).equals(1);
    expect(parent.number).equals(2);
    expect(child.number).equals(3);
}

describe("Parts", () => {
    it("adopts parts", async () => {
        const parent = createParent();
        await parent.construction;
        const child = createChild();

        const parts = parent.parts;
        parts.add(child);
        await child.construction;

        expect(parts.size).equals(1);
        expect(child.owner).equals(parent);
    });

    it("disowns destroyed parts", async () => {
        const parent = createParent();
        const child = createChild();

        const parts = parent.parts;
        parts.add(child);
        await child.construction;

        expect(parts.size).equals(1);

        await child.close();

        expect(parts.size).equals(0);
    });

    it("bubbles initialization", async () => {
        const parent = createParent();
        await parent.construction;

        const child = createParentAndChild();
        const grandchild = createChild();

        parent.parts.add(child);
        await child.construction;

        const bubbled = Array<EndpointLifecycle.Change>();
        parent.lifecycle.changed.on((type, endpoint) => {
            expect(endpoint).equals(grandchild);
            bubbled.push(type);
        });

        child.parts.add(grandchild);
        await grandchild.construction;

        expect(bubbled).deep.equals([
            EndpointLifecycle.Change.Installed,
            EndpointLifecycle.Change.IdAssigned,
            EndpointLifecycle.Change.Ready,
            EndpointLifecycle.Change.PartsReady,
        ]);
    });

    it("bubbles destruction", async () => {
        const parent = createParent();
        await parent.construction;

        const child = createParentAndChild();
        const grandchild = createChild();

        parent.parts.add(child);
        await child.construction;

        child.parts.add(grandchild);
        await grandchild.construction;

        let bubbled: Endpoint | undefined;
        parent.lifecycle.changed.on((type, endpoint) => {
            expect(type).equals(EndpointLifecycle.Change.Destroyed);
            bubbled = endpoint;
        });

        await grandchild.close();

        expect(bubbled).equals(grandchild);
    });

    it("supports incremental descendant-first tree assembly", async () => {
        await assembleIncrementally(async (child, parent, grandparent) => {
            parent.parts.add(child);
            grandparent.parts.add(parent);
        });
    });

    it("supports incremental descendant-first tree assembly", async () => {
        await assembleIncrementally(async (child, parent, grandparent) => {
            parent.parts.add(child);
            grandparent.parts.add(parent);
        });
    });

    it("supports incremental ancestor-first tree assembly with index", async () => {
        await assembleIncrementally(async (child, parent, grandparent) => {
            parent.behaviors.require(IndexBehavior);
            grandparent.parts.add(parent);
            parent.parts.add(child);
        });
    });

    it("supports incremental descendant-first tree assembly with index", async () => {
        await assembleIncrementally(async (child, parent, grandparent) => {
            parent.behaviors.require(IndexBehavior);
            parent.parts.add(child);
            grandparent.parts.add(parent);
        });
    });
});
