/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { ImplementationError, Lifecycle } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { EndpointNumber } from "@matter/types";
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
    await using grandparent = new MockEndpoint(MockEndpointType);
    const parent = new MockEndpoint(MockEndpointType, { owner: undefined });
    const child = new MockEndpoint(MockEndpointType, { owner: undefined });

    await assemble(child, parent, grandparent);

    await child.construction;

    expect(grandparent.number).equals(1);
    expect(parent.number).equals(2);
    expect(child.number).equals(3);
}

function failDeactivationOf(endpoint: Endpoint) {
    const initializer = endpoint.env.get(EndpointInitializer);
    const deactivate = initializer.deactivateDescendant.bind(initializer);
    initializer.deactivateDescendant = async descendant => {
        if (descendant === endpoint) {
            throw new ImplementationError(`Cannot deactivate ${endpoint}`);
        }
        await deactivate(descendant);
    };
}

describe("Parts", () => {
    it("adopts parts", async () => {
        await using parent = createParent();
        await parent.construction;
        const child = createChild();

        const parts = parent.parts;
        parts.add(child);
        await child.construction;

        expect(parts.size).equals(1);
        expect(child.owner).equals(parent);
    });

    it("disowns destroyed parts", async () => {
        await using parent = createParent();
        const child = createChild();

        const parts = parent.parts;
        parts.add(child);
        await child.construction;

        expect(parts.size).equals(1);

        await child.close();

        expect(parts.size).equals(0);
    });

    it("closes every part when one fails to close", async () => {
        await using parent = createParent();
        await parent.construction;

        const failing = createParentAndChild();
        const child = createChild();
        parent.parts.add(failing);
        parent.parts.add(child);
        await child.construction;
        failDeactivationOf(failing);

        await expect(parent.parts.close()).rejected;

        expect(failing.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(child.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(parent.parts.size).equals(0);
    });

    it("destroys an endpoint whose part fails to close", async () => {
        let behaviorClosed = false;
        class TrackedServer extends DescriptorServer {
            override async [Symbol.asyncDispose]() {
                behaviorClosed = true;
            }
        }

        await using grandparent = createParent();
        await grandparent.construction;

        const parent = new MockEndpoint(MockEndpointType.with(TrackedServer), { number: 2, owner: undefined });
        grandparent.parts.add(parent);
        const child = createChild();
        parent.parts.add(child);
        await child.construction;
        failDeactivationOf(child);

        await parent.close();

        expect(behaviorClosed).equals(true);
        expect(parent.owner).equals(undefined);
        expect(child.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(grandparent.parts.size).equals(0);
    });

    it("bubbles initialization", async () => {
        await using parent = createParent();
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
        await using parent = createParent();
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
    describe("parts.add", () => {
        it("refuses adding an ancestor under its own descendant", () => {
            const parent = new Endpoint(OnOffLightDevice, {
                id: "parent",
                parts: [{ type: OnOffLightDevice, id: "child" }],
            });
            const child = parent.parts.require("child");

            expect(() => child.parts.add(parent)).throws(ImplementationError, /ancestor/);

            expect(parent.parts.has(child)).true;
            expect(child.owner).equals(parent);
            expect(parent.owner).undefined;
        });

        it("refuses adding a numbered ancestor under its own descendant", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const parent = await node.add(AggregatorEndpoint, {
                id: "parent",
                number: 2,
                parts: [{ type: OnOffLightDevice, id: "child", number: EndpointNumber(3) }],
            });
            const child = parent.parts.require("child");

            expect(() => child.parts.add(parent)).throws(ImplementationError, /ancestor/);

            expect(child.owner).equals(parent);
            expect(parent.owner).equals(node);

            await node.close();
        });

        it("refuses adding an endpoint to itself", () => {
            const endpoint = new Endpoint(AggregatorEndpoint, { id: "self" });

            expect(() => endpoint.parts.add(endpoint)).throws(ImplementationError, /itself/);

            expect(endpoint.parts.size).equals(0);
            expect(endpoint.owner).undefined;
        });
    });

    describe("removal", () => {
        // Characterization
        it("stops forwarding lifecycle changes of a closed part", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const part = await node.add(OnOffLightDevice, { id: "part", number: 5 });

            await part.close();

            expect(part.lifecycle.changed.isObserved).false;
        });

        it("refuses removing a part with parts.delete()", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const part = await node.add(OnOffLightDevice, { id: "part", number: 5 });

            expect(() => node.parts.delete(part)).throws(ImplementationError, /close\(\) or delete\(\)/);

            expect(node.parts.has(part)).true;
            expect(node.behaviors.internalsOf(IndexBehavior).partsByNumber[5]).equals(part);
        });

        it("refuses removing all parts with parts.clear()", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const part = await node.add(OnOffLightDevice, { id: "part", number: 5 });

            expect(() => node.parts.clear()).throws(ImplementationError, /close\(\) or delete\(\)/);

            expect(node.parts.has(part)).true;
        });
    });
});
