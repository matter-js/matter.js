/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { Api } from "#behavior/system/remote/api/Api.js";
import { OnOffLightDevice } from "#devices/on-off-light";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ServerNode } from "#node/ServerNode.js";
import { Environment } from "@matter/general";
import { ClusterModel, Matter, MatterModel } from "@matter/model";
import { ClusterType } from "@matter/types";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

const CLUSTER_ID = 0xfff1_fc20;

/**
 * The cluster as the controller's model states it, where the device's model still states the elements as optional.
 */
function schemaWith(legacyConformance: string, levelMax: number) {
    return new ClusterModel({
        id: CLUSTER_ID,
        name: "LegacyApi",
        revision: 1,
        children: [
            { tag: "attribute", id: 0, name: "Mode", type: "ModeEnum", access: "RW VO", conformance: "M", default: 1 },
            {
                tag: "attribute",
                id: 1,
                name: "Level",
                type: "uint8",
                access: "RW VO",
                conformance: "M",
                constraint: `max ${levelMax}`,
                default: 0,
            },
            {
                tag: "command",
                id: 0,
                name: "Configure",
                direction: "request",
                response: "ConfigureResponse",
                access: "O",
                conformance: "M",
                children: [{ tag: "field", id: 0, name: "Policy", type: "uint8", conformance: legacyConformance }],
            },
            {
                tag: "command",
                id: 1,
                name: "ConfigureResponse",
                direction: "response",
                conformance: "M",
                children: [{ tag: "field", id: 0, name: "Legacy", type: "uint8", conformance: legacyConformance }],
            },
            {
                tag: "datatype",
                name: "ModeEnum",
                type: "enum8",
                children: [
                    { tag: "field", id: 0, name: "On", conformance: legacyConformance },
                    { tag: "field", id: 1, name: "Off", conformance: "M" },
                ],
            },
        ],
    });
}

function behaviorFor(schema: ClusterModel) {
    const behavior = class extends ClusterBehavior.for(ClusterType(schema) as ClusterType.Concrete) {};
    Object.defineProperty(behavior.prototype, "configure", {
        value: () => ({ legacy: 1 }),
        writable: true,
        configurable: true,
    });
    return behavior;
}

/** The device still states the elements as optional and accepts a higher level */
const DeviceBehavior = behaviorFor(schemaWith("O", 100));

/** A local implementation of the cluster as the controller knows it */
const LocalBehavior = behaviorFor(schemaWith("Z", 10));

/**
 * The standard model plus the cluster as the controller knows it, so the controller's peers resolve the cluster to it.
 */
function controllerEnvironment() {
    const environment = new Environment("controller");
    environment.set(
        MatterModel,
        new MatterModel({}, ...Matter.children.map(child => child.clone()), schemaWith("Z", 10)),
    );
    return environment;
}

describe("remote API on a peer", () => {
    before(() => {
        MockTime.init();
    });

    async function peerSite() {
        const site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ServerNode.RootEndpoint, environment: controllerEnvironment() },
            device: { type: ServerNode.RootEndpoint, device: OnOffLightDevice.with(DeviceBehavior) },
        });
        await subscribedPeer(controller, "peer1");
        return { site, controller, device };
    }

    function execute(controller: ServerNode, request: Parameters<typeof Api.execute>[2]) {
        return MockTime.resolve(Api.execute("test", controller, request, new AbortController().signal), {
            macrotasks: true,
        });
    }

    it("sends an obsolete command field and accepts an obsolete response field", async () => {
        const { site, controller } = await peerSite();
        await using _site = site;

        const response = await execute(controller, {
            target: "peers/peer1/1/legacyApi/configure",
            method: "invoke",
            parameters: { policy: 1 },
        });

        expect(response.kind).equals("value");
        expect(response.kind === "value" && response.value.js).deep.equals({ legacy: 1 });
    });

    it("writes an obsolete enum value", async () => {
        const { site, controller, device } = await peerSite();
        await using _site = site;

        const response = await execute(controller, {
            target: "peers/peer1/1/legacyApi/mode",
            method: "write",
            value: 0,
        });

        expect(response.kind).equals("ok");
        expect(deviceState(device, "mode")).equals(0);
    });

    it("declines a value outside the local bounds without sending it", async () => {
        const { site, controller, device } = await peerSite();
        await using _site = site;

        const response = await execute(controller, {
            target: "peers/peer1/1/legacyApi/level",
            method: "write",
            value: 50,
        });

        expect(response.kind).equals("error");
        expect(deviceState(device, "level")).equals(0);
    });

    it("declines a value of the wrong type without sending it (characterization)", async () => {
        const { site, controller, device } = await peerSite();
        await using _site = site;

        const response = await execute(controller, {
            target: "peers/peer1/1/legacyApi/level",
            method: "write",
            value: "high",
        });

        expect(response.kind).equals("error");
        expect(deviceState(device, "level")).equals(0);
    });

    describe("on a local endpoint", () => {
        async function localSite() {
            const { site, controller } = await peerSite();
            const endpoint = await controller.add(
                MutableEndpoint({ name: "LocalLegacy", deviceType: 0xfff1_fc21, deviceRevision: 1 }).with(
                    LocalBehavior,
                ),
            );
            return { site, controller, number: endpoint.number };
        }

        it("rejects an obsolete enum value", async () => {
            const { site, controller, number } = await localSite();
            await using _site = site;

            const response = await execute(controller, {
                target: `host/${number}/legacyApi/mode`,
                method: "write",
                value: 0,
            });

            expect(response.kind).equals("error");
        });

        it("rejects an obsolete command field", async () => {
            const { site, controller, number } = await localSite();
            await using _site = site;

            const response = await execute(controller, {
                target: `host/${number}/legacyApi/configure`,
                method: "invoke",
                parameters: { policy: 1 },
            });

            expect(response.kind).equals("error");
        });
    });
});

function deviceState(device: ServerNode, name: string) {
    for (const part of device.parts) {
        if (part.number === 1) {
            return Reflect.get(part.stateOf(DeviceBehavior), name);
        }
    }
}
