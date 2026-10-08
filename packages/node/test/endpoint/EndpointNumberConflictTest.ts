/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { IdentityConflictError } from "#endpoint/errors.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ImplementationError, Lifecycle } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { EndpointNumber } from "@matter/types";

class FailingOnOffServer extends OnOffServer {
    override initialize() {
        throw new ImplementationError("Initialization refused for test");
    }
}

function partsListOf(node: MockServerNode) {
    return [...node.stateOf(DescriptorServer).partsList].sort((a, b) => a - b);
}

function holderOf(node: MockServerNode, number: number) {
    return node.behaviors.internalsOf(IndexBehavior).partsByNumber[number];
}

describe("EndpointNumberConflict", () => {
    describe("refusing a claimant of a live endpoint's number", () => {
        async function refuseClaimant(node: MockServerNode) {
            const live = await node.add(OnOffLightDevice, { id: "live", number: 2 });
            await MockTime.yield3();

            const deleted = new Array<number | undefined>();
            node.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "delete") {
                    deleted.push(change.endpoint.maybeNumber);
                }
            });

            await expect(node.add(OnOffLightDevice, { id: "claimant", number: 2 })).rejectedWith(IdentityConflictError);
            await MockTime.yield3();

            return { live, deleted };
        }

        it("keeps the live endpoint in the node's index", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const { live } = await refuseClaimant(node);
            expect(holderOf(node, 2)).equals(live);
        });

        // Characterization
        it("keeps the live endpoint's number in the node's PartsList", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            await refuseClaimant(node);
            expect(partsListOf(node)).deep.equals([2]);
        });

        // Characterization
        it("keeps refusing further claimants", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            await refuseClaimant(node);
            await expect(node.add(OnOffLightDevice, { id: "another", number: 2 })).rejectedWith(IdentityConflictError);
        });

        it("reports no deletion of the live endpoint's number", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const { deleted } = await refuseClaimant(node);
            expect(deleted).deep.equals([]);
        });
    });

    it("refuses a duplicate preset number in a tree built before start", async () => {
        await using node = new MockServerNode();
        const first = new Endpoint(OnOffLightDevice, { id: "first", number: EndpointNumber(4) });
        const second = new Endpoint(OnOffLightDevice, { id: "second", number: EndpointNumber(4), isEssential: false });
        node.parts.add(first);
        node.parts.add(second);

        await node.start();
        await MockTime.yield3();

        expect(holderOf(node, 4)).equals(first);
        expect(second.construction.status).equals(Lifecycle.Status.Crashed);
        expect(second.construction.error).instanceOf(IdentityConflictError);
        expect(partsListOf(node)).deep.equals([4]);
    });

    it("refuses a nested preset number another endpoint holds", async () => {
        await using node = new MockServerNode();
        const holder = new Endpoint(OnOffLightDevice, { id: "holder", number: EndpointNumber(5) });
        const aggregator = new Endpoint(AggregatorEndpoint, {
            id: "aggregator",
            number: EndpointNumber(6),
            parts: [{ type: OnOffLightDevice, id: "nested", number: EndpointNumber(5), isEssential: false }],
        });
        node.parts.add(holder);
        node.parts.add(aggregator);

        await node.start();
        await MockTime.yield3();

        const nested = aggregator.parts.require("nested");
        expect(nested.construction.error).instanceOf(IdentityConflictError);
        expect(holderOf(node, 5)).equals(holder);
        expect(partsListOf(node)).deep.equals([5, 6]);
    });

    describe("a failed add of an essential endpoint", () => {
        it("closes the endpoint", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const failing = new Endpoint(OnOffLightDevice.with(FailingOnOffServer), { id: "failing", number: 5 });

            await expect(node.add(failing)).rejected;

            expect(failing.construction.status).equals(Lifecycle.Status.Destroyed);
            expect(node.parts.has(failing)).false;
            expect(holderOf(node, 5)).undefined;
        });

        it("accepts a retry with the same id and number", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });

            await expect(node.add(OnOffLightDevice.with(FailingOnOffServer), { id: "retried", number: 5 })).rejected;
            const retried = await node.add(OnOffLightDevice, { id: "retried", number: 5 });

            expect(holderOf(node, 5)).equals(retried);
        });
    });

    // Characterization
    it("allocates around a preset sibling", async () => {
        await using node = new MockServerNode();
        const preset = new Endpoint(OnOffLightDevice, { id: "preset", number: EndpointNumber(1) });
        const automatic = new Endpoint(OnOffLightDevice, { id: "automatic" });
        node.parts.add(preset);
        node.parts.add(automatic);

        await node.start();

        expect(preset.number).equals(1);
        expect(automatic.number).not.equals(1);
        expect(holderOf(node, 1)).equals(preset);
        expect(holderOf(node, automatic.number)).equals(automatic);
    });
});
