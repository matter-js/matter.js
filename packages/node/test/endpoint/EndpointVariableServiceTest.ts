/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import { EndpointBehaviorsError } from "#endpoint/errors.js";
import { Environment } from "#general";
import { MockServerNode } from "../node/mock-server-node.js";
import { MockEndpoint } from "./mock-endpoint.js";

describe("EndpointVariableService", () => {
    describe("root endpoint", () => {
        it("sets property from environment", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({ MATTER_NODES_NODE0_BASICINFORMATION_VENDORNAME: "Foopers" });
            const node = await MockServerNode.create(MockServerNode.RootEndpoint, { environment });
            expect(node.state.basicInformation.vendorName).equals("Foopers");
        });

        it("sets property from behavior environment", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({ MATTER_BEHAVIORS_BASICINFORMATION_VENDORNAME: "Foopers" });
            const node = await MockServerNode.create(MockServerNode.RootEndpoint, { environment });
            expect(node.state.basicInformation.vendorName).equals("Foopers");
        });

        it("sets property from command line", async () => {
            const environment = new Environment("test");
            environment.vars.addArgvStyle(["--nodes-node0-basicInformation-vendorName=Foopers"]);
            const node = await MockServerNode.create(MockServerNode.RootEndpoint, { environment });
            expect(node.state.basicInformation.vendorName).equals("Foopers");
        });

        it("sets property from config", async () => {
            const environment = new Environment("test");
            environment.vars.addConfigStyle({ nodes: { node0: { basicInformation: { vendorName: "Foopers" } } } });
            const node = await MockServerNode.create(MockServerNode.RootEndpoint, { environment });
            expect(node.state.basicInformation.vendorName).equals("Foopers");
        });

        it("rejects unknown property", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({ MATTER_NODES_NODE0_BASICINFORMATION_VENDORSPECIES: "Frog" });
            await expect(MockServerNode.create(MockServerNode.RootEndpoint, { environment })).rejectedWith(
                EndpointBehaviorsError,
            );
        });
    });

    describe("child endpoint", () => {
        it("sets property from environment", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({ MATTER_NODES_NODE0_PARTS_PART0_ONOFF_ONTIME: "10" });
            const endpoint = await MockEndpoint.create(OnOffLightDevice, { environment });
            expect(endpoint.state.onOff.onTime).equals(10);
        });

        it("sets property from command line", async () => {
            const environment = new Environment("test");
            environment.vars.addArgvStyle(["--nodes-node0-parts-part0-onOff-onTime=10"]);
            const endpoint = await MockEndpoint.create(OnOffLightDevice, { environment });
            expect(endpoint.state.onOff.onTime).equals(10);
        });

        it("sets property from config", async () => {
            const environment = new Environment("test");
            environment.vars.addConfigStyle({ "nodes.node0.parts.part0.onOff.onTime": 10 });
            const endpoint = await MockEndpoint.create(OnOffLightDevice, { environment });
            expect(endpoint.state.onOff.onTime).equals(10);
        });

        it("sets property from behavior config", async () => {
            const environment = new Environment("test");
            environment.vars.addConfigStyle({ "behaviors.onOff.onTime": 10 });
            const endpoint = await MockEndpoint.create(OnOffLightDevice, { environment });
            expect(endpoint.state.onOff.onTime).equals(10);
        });

        it("sets properties from behavior and endpoint config", async () => {
            const environment = new Environment("test");
            environment.vars.addConfigStyle({
                "behaviors.onOff.onOff": true,
                "nodes.node0.parts.part0.onOff.onTime": 10,
            });
            const endpoint = await MockEndpoint.create(OnOffLightDevice, { environment });
            expect(endpoint.state.onOff.onOff).equals(true);
            expect(endpoint.state.onOff.onTime).equals(10);
        });

        it("rejects invalid property", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({ MATTER_NODES_NODE0_PARTS_PART0_ONOFF_ONTIME: "Fred" });

            await expect(MockEndpoint.create(OnOffLightDevice, { environment })).rejectedWith(EndpointBehaviorsError);
        });
    });
});
