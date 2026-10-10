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
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { RootEndpoint } from "#endpoints/root";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ImplementationError, Lifecycle, LogDestination, Logger, LogFormat, LogLevel } from "@matter/general";
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

    describe("a part that claims endpoint number 0", () => {
        it("is refused by a running node", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });

            await expect(node.add(RootEndpoint, { id: "nestedRoot", number: 0 })).rejectedWith(IdentityConflictError);

            expect(node.endpoints.for(0)).equals(node);
            expect(holderOf(node, 0)).undefined;
        });

        it("is refused before the node starts", async () => {
            await using node = new MockServerNode();
            const nestedRoot = new Endpoint(RootEndpoint, { id: "nestedRoot", number: EndpointNumber(0) });

            expect(() => node.parts.add(nestedRoot)).throws(IdentityConflictError, /node root/);

            expect(node.parts.has(nestedRoot)).false;
        });
    });

    it("refuses an added subtree whose leaves share a number", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = new Endpoint(AggregatorEndpoint, {
            id: "aggregator",
            parts: [
                { type: OnOffLightDevice, id: "a", number: EndpointNumber(8) },
                { type: OnOffLightDevice, id: "b", number: EndpointNumber(8) },
            ],
        });

        expect(() => node.parts.add(aggregator)).throws(IdentityConflictError, /conflicting/);

        expect(node.parts.has(aggregator)).false;
    });

    // Characterization; pins the sibling ID check that now runs before install
    it("refuses an automatic id that duplicates a sibling's id", async () => {
        await using node = new MockServerNode();
        const first = new Endpoint(OnOffLightDevice, { id: "part1" });
        const unnamed = new Endpoint(OnOffLightDevice, { isEssential: false });
        node.parts.add(first);
        node.parts.add(unnamed);

        await node.start();

        // The second part's automatic id is part1 (its index), which the first part already uses
        expect(unnamed.construction.error).instanceOf(IdentityConflictError);
        expect(node.parts.get("part1")).equals(first);
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

    it("keeps a preset number added after an automatic sibling", async () => {
        await using node = new MockServerNode();
        const automatic = new Endpoint(OnOffLightDevice, { id: "automatic" });
        const preset = new Endpoint(OnOffLightDevice, { id: "preset", number: EndpointNumber(1) });
        node.parts.add(automatic);
        node.parts.add(preset);

        await node.start();

        expect(preset.number).equals(1);
        expect(automatic.number).not.equals(1);
        expect(holderOf(node, 1)).equals(preset);
    });

    it("keeps a preset number of a cousin under another aggregator", async () => {
        await using node = new MockServerNode();
        const first = new Endpoint(AggregatorEndpoint, {
            id: "first",
            parts: [{ type: OnOffLightDevice, id: "automatic" }],
        });
        const second = new Endpoint(AggregatorEndpoint, {
            id: "second",
            parts: [{ type: OnOffLightDevice, id: "preset", number: EndpointNumber(2) }],
        });
        node.parts.add(first);
        node.parts.add(second);

        await node.start();

        const preset = second.parts.require("preset");
        expect(preset.number).equals(2);
        expect(holderOf(node, 2)).equals(preset);
    });

    // Guard: no production path reaches the collision; Installed is emitted by hand
    it("logs an index collision and keeps the holder", async () => {
        await using node = new MockServerNode();
        const holder = new Endpoint(OnOffLightDevice, { id: "holder", number: EndpointNumber(5) });
        const refused = new Endpoint(OnOffLightDevice, {
            id: "refused",
            number: EndpointNumber(5),
            isEssential: false,
        });
        node.parts.add(holder);
        node.parts.add(refused);
        await node.start();
        expect(refused.construction.error).instanceOf(IdentityConflictError);

        const errors = new Array<string>();
        Logger.destinations.capture = LogDestination({
            format: LogFormat.formats.plain,
            write(text, message) {
                if (message.level >= LogLevel.ERROR) {
                    errors.push(text);
                }
            },
        });
        try {
            refused.lifecycle.change(EndpointLifecycle.Change.Installed);
        } finally {
            delete Logger.destinations.capture;
        }

        expect(errors.join("\n")).match(/already indexed/);
        expect(holderOf(node, 5)).equals(holder);
    });

    // Characterization
    it("indexes parts with the same ID under different parents", async () => {
        await using node = new MockServerNode();
        const first = new Endpoint(AggregatorEndpoint, {
            id: "first",
            parts: [{ type: OnOffLightDevice, id: "light" }],
        });
        const second = new Endpoint(AggregatorEndpoint, {
            id: "second",
            parts: [{ type: OnOffLightDevice, id: "light" }],
        });
        node.parts.add(first);
        node.parts.add(second);

        await node.start();

        const firstLight = first.parts.require("light");
        const secondLight = second.parts.require("light");
        expect(holderOf(node, firstLight.number)).equals(firstLight);
        expect(holderOf(node, secondLight.number)).equals(secondLight);
    });

    describe("retraction", () => {
        async function startWithRefusedDuplicate(node: MockServerNode) {
            const holder = new Endpoint(OnOffLightDevice, { id: "holder", number: EndpointNumber(4) });
            const composed = new Endpoint(OnOffLightDevice, {
                id: "composed",
                number: EndpointNumber(6),
                parts: [{ type: OnOffLightDevice, id: "refused", number: EndpointNumber(4), isEssential: false }],
            });
            node.parts.add(holder);
            node.parts.add(composed);
            await node.start();
            await MockTime.yield3();
            const refused = composed.parts.require("refused");
            expect(refused.construction.error).instanceOf(IdentityConflictError);
            return { holder, composed, refused };
        }

        it("reports no deletion when a refused endpoint closes", async () => {
            await using node = new MockServerNode();
            const { refused } = await startWithRefusedDuplicate(node);
            const deleted = new Array<number | undefined>();
            node.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "delete") {
                    deleted.push(change.endpoint.maybeNumber);
                }
            });

            await refused.close();

            expect(deleted).deep.equals([]);
        });

        it("does not list a refused child of a parent without an index", async () => {
            await using node = new MockServerNode();
            const { composed } = await startWithRefusedDuplicate(node);

            expect(composed.stateOf(DescriptorServer).partsList).not.contains(4);
        });

        // Characterization
        it("reports one deletion for an endpoint that was erased and restarted", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(OnOffLightDevice, { id: "restarted", number: 5 });
            await endpoint.erase();
            endpoint.construction.start();
            await endpoint.construction;
            const deleted = new Array<number | undefined>();
            node.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "delete") {
                    deleted.push(change.endpoint.maybeNumber);
                }
            });

            await endpoint.delete();

            expect(deleted).deep.equals([5]);
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
