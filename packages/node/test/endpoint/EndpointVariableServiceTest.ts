/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffLightDevice } from "#devices/on-off-light";
import { Diagnostic, Environment, LogDestination, Logger, LogLevel } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { MockEndpoint } from "./mock-endpoint.js";

function captureBehaviorErrors() {
    const errors = new Array<string>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "Behaviors" && message.level >= LogLevel.ERROR) {
                errors.push(String(message.values[0]));
            }
        },
    });
    return errors;
}

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

        it("ignores unknown property but applies valid siblings", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({
                MATTER_NODES_NODE0_BASICINFORMATION_VENDORSPECIES: "Frog",
                MATTER_NODES_NODE0_BASICINFORMATION_VENDORNAME: "Foopers",
            });
            const errors = captureBehaviorErrors();
            try {
                const node = await MockServerNode.create(MockServerNode.RootEndpoint, { environment });
                expect(node.state.basicInformation.vendorName).equals("Foopers");
                expect(errors.some(e => e.toLowerCase().includes("vendorspecies"))).true;
            } finally {
                delete Logger.destinations.capture;
            }
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

        it("ignores property with unconvertible value", async () => {
            const environment = new Environment("test");
            environment.vars.addUnixEnvStyle({ MATTER_NODES_NODE0_PARTS_PART0_ONOFF_ONTIME: "Fred" });

            const errors = captureBehaviorErrors();
            try {
                const endpoint = await MockEndpoint.create(OnOffLightDevice, { environment });
                expect(endpoint.state.onOff.onTime).equals(0);
                expect(errors.some(e => e.toLowerCase().includes("ontime"))).true;
            } finally {
                delete Logger.destinations.capture;
            }
        });
    });
});
