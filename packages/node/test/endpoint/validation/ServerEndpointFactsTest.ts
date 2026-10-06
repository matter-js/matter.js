/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { Endpoint } from "#endpoint/Endpoint.js";
import { SecondaryNetworkInterfaceEndpoint } from "#endpoints/secondary-network-interface";
import { ServerEndpointFacts } from "#node/server/ServerEndpointFacts.js";
import { ImplementationError } from "@matter/general";
import { Matter, NodeCondition } from "@matter/model";
import { MockServerNode } from "@matter/node/testing";
import {
    addRefrigerator,
    createBleNode,
    createNode,
    deviceTypeList,
    featuresOf,
    RootWithEthernet,
    RootWithThread,
    RootWithWiFi,
    serverPass,
    ThreadCommissioningServer,
} from "./validation-helpers.js";

const DescribedLight = OnOffLightDevice.with(DescriptorServer);

const facts = new ServerEndpointFacts();

function serverOf(endpoint: Endpoint, cluster: string) {
    return facts.serverClustersOf(endpoint).find(({ name }) => name === cluster);
}

function elementsOf(endpoint: Endpoint, cluster: string) {
    const schema = serverOf(endpoint, cluster);
    if (schema === undefined) {
        throw new ImplementationError(`Endpoint ${endpoint} has no ${cluster} server`);
    }
    return facts.elementsOf(endpoint, schema);
}

describe("ServerEndpointFacts", () => {
    it("reads device types from the Descriptor, including those the model does not define", async () => {
        const node = await createNode();
        const light = await node.add(DescribedLight, {
            id: "light",
            descriptor: { deviceTypeList: deviceTypeList("OnOffLight", 0xfff10099) },
        });

        expect(facts.deviceTypeIdsOf(light)).deep.equals([Matter.deviceTypes("OnOffLight")?.id, 0xfff10099]);

        await node.close();
    });

    it("names server and client clusters by their model name", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const lightSwitch = await node.add(OnOffLightSwitchDevice, { id: "switch" });

        const namesOf = (clusters: Iterable<{ name: string }>) => [...clusters].map(({ name }) => name);
        expect(namesOf(facts.serverClustersOf(light))).includes("OnOff");
        expect(namesOf(facts.clientClustersOf(light))).not.includes("OnOff");
        expect(namesOf(facts.clientClustersOf(lightSwitch))).includes("OnOff");

        await node.close();
    });

    it("reports the features a server supports by code", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        expect([...featuresOf(light, "OnOff")]).deep.equals(["LT"]);
        expect(serverOf(light, "LevelControl")).undefined;

        await node.close();
    });

    it("reports the attributes, commands and events a server implements", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const onOff = elementsOf(light, "OnOff");
        expect(onOff.attributes.has("onTime")).true;
        expect(onOff.attributes.has("offWaitTime")).true;
        expect(onOff.commands.has("onWithTimedOff")).true;
        expect(elementsOf(node, "BasicInformation").events.has("startUp")).true;

        await node.close();
    });

    it("lists parts", async () => {
        const node = await createNode();
        const { fridge, cabinets } = await addRefrigerator(node);

        expect([...facts.partsOf(fridge)]).deep.equals(cabinets);
        expect(cabinets.every(cabinet => facts.isPresent(cabinet))).true;

        await node.close();
    });

    it("answers the conditions an endpoint states", async () => {
        const node = await createNode();
        const light = await node.add(DescribedLight, {
            id: "light",
            deviceConditions: ["BridgedPowerSourceInfo", "RootNode.PowerSourceCond", "sit"],
        });

        expect([...facts.statedConditionsOf(light)]).deep.equals([
            "BridgedPowerSourceInfo",
            "RootNode.PowerSourceCond",
            "sit",
        ]);

        await node.close();
    });

    describe("node conditions", () => {
        it("answers CustomNetworkConfig for a node that does not commission over BLE", async () => {
            const node = await createNode();

            expect(facts.nodeConditionsOf(node)).deep.equals([NodeCondition.CustomNetworkConfig]);

            await node.close();
        });

        it("does not answer CustomNetworkConfig for a node that commissions over BLE", async () => {
            const node = await createBleNode({ deviceConditions: ["CustomNetworkConfig"] });

            expect(facts.nodeConditionsOf(node)).deep.equals([]);
            expect([...facts.statedConditionsOf(node)]).deep.equals(["CustomNetworkConfig"]);

            await node.close();
        });

        for (const [root, feature, condition] of [
            [RootWithWiFi, "WI", NodeCondition.WiFi],
            [RootWithThread, "TH", NodeCondition.Thread],
            [RootWithEthernet, "ET", NodeCondition.Ethernet],
        ] as const) {
            it(`reports the ${feature} feature of the root's NetworkCommissioning server`, async () => {
                const node = await MockServerNode.createOnline(root, { device: undefined });

                const interfaces = ["WI", "TH", "ET"];
                expect(interfaces.filter(code => featuresOf(node, "NetworkCommissioning").has(code))).deep.equals([
                    feature,
                ]);
                expect(serverPass().nodeEndpointConditionsOf(node).has(condition)).true;

                await node.close();
            });
        }

        it("reports the network interface of a secondary interface's NetworkCommissioning server", async () => {
            const node = await createNode();
            const thread = await node.add(SecondaryNetworkInterfaceEndpoint.with(ThreadCommissioningServer), {
                id: "thread",
            });

            expect(featuresOf(thread, "NetworkCommissioning").has("TH")).true;
            expect(serverPass().nodeEndpointConditionsOf(node).has(NodeCondition.Thread)).true;

            await node.close();
        });

        it("reports no network interface for a node without NetworkCommissioning", async () => {
            const node = await createNode();

            const features = featuresOf(node, "NetworkCommissioning");
            expect(["WI", "TH", "ET"].filter(code => features.has(code))).deep.equals([]);

            await node.close();
        });
    });
});
