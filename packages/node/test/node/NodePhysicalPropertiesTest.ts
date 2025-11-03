/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { PowerSourceServer } from "#behaviors/power-source";
import { ThreadNetworkDiagnosticsServer } from "#behaviors/thread-network-diagnostics";
import { WiFiNetworkDiagnosticsServer } from "#behaviors/wi-fi-network-diagnostics";
import { PowerSource } from "#clusters/power-source";
import { ThreadNetworkDiagnostics } from "#clusters/thread-network-diagnostics";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { PowerSourceEndpoint } from "#endpoints/power-source";
import { SecondaryNetworkInterfaceEndpoint } from "#endpoints/secondary-network-interface";
import { Minutes, Seconds } from "#general";
import { Node } from "#node/Node.js";
import { NodePhysicalProperties } from "#node/NodePhysicalProperties.js";
import { ServerNode } from "#node/ServerNode.js";
import { PhysicalDeviceProperties, Subscribe } from "#protocol";
import { MockServerNode } from "./mock-server-node.js";

describe("NodePhysicalProperties", () => {
    it("chooses correct default intervals", async () => {
        const node = await MockServerNode.create();
        expectParams(node, {
            minIntervalFloor: Seconds(1),
            maxIntervalCeiling: Minutes(1),
        });
    });

    it("accepts request intervals", async () => {
        const request = {
            minIntervalFloor: Seconds(2),
            maxIntervalCeiling: Minutes(2),
        };
        const node = await MockServerNode.create();
        expectParams(node, request, request);
    });

    it("overrides ICD floor", async () => {
        const node = await MockServerNode.create(ServerNode.RootEndpoint.with(IcdManagementServer));
        const props = NodePhysicalProperties(node);
        expect(props.isIntermittentlyConnected).true;
        expectParams(
            node,
            {
                minIntervalFloor: Seconds(0),
                maxIntervalCeiling: Minutes(1),
            },
            {
                minIntervalFloor: Seconds(10),
            },
        );
    });

    it("chooses correct intervals for battery", async () => {
        const BatteryServer = PowerSourceServer.with("Battery").set({ status: PowerSource.PowerSourceStatus.Active });
        const BatteryEndpoint = PowerSourceEndpoint.with(BatteryServer);
        await expectParamsWithCluster(BatteryServer, BatteryEndpoint, {
            maxIntervalCeiling: Minutes(10),
            minIntervalFloor: Seconds(1),
        });
    });

    it("chooses correct intervals for mains + battery", async () => {
        const MainsServer = PowerSourceServer.with("Wired").set({
            status: PowerSource.PowerSourceStatus.Active,
        });
        const MainsEndpoint = PowerSourceEndpoint.with(MainsServer);
        const BatteryServer = PowerSourceServer.with("Battery").set({
            status: PowerSource.PowerSourceStatus.Active,
        });
        const BatteryEndpoint = PowerSourceEndpoint.with(BatteryServer);

        const node = await MockServerNode.create({
            parts: [MainsEndpoint, BatteryEndpoint],
        });
        expectParams(node, {
            maxIntervalCeiling: Minutes(1),
            minIntervalFloor: Seconds(1),
        });
    });

    it("chooses correct intervals for wifi", async () => {
        const WifiEndpoint = SecondaryNetworkInterfaceEndpoint.with(WiFiNetworkDiagnosticsServer);
        await expectParamsWithCluster(WiFiNetworkDiagnosticsServer, WifiEndpoint, {
            maxIntervalCeiling: Minutes(1),
            minIntervalFloor: Seconds(1),
        });
    });

    it("chooses correct intervals for sleepy thread", async () => {
        const ThreadServer = ThreadNetworkDiagnosticsServer.set({
            routingRole: ThreadNetworkDiagnostics.RoutingRole.SleepyEndDevice,
        });
        const ThreadEndpoint = SecondaryNetworkInterfaceEndpoint.with(ThreadServer);
        await expectParamsWithCluster(ThreadServer, ThreadEndpoint, {
            maxIntervalCeiling: Minutes(3),
            minIntervalFloor: Seconds(1),
        });
    });

    it("chooses correct intervals for caffeinated thread", async () => {
        const ThreadEndpoint = SecondaryNetworkInterfaceEndpoint.with(ThreadNetworkDiagnosticsServer);
        await expectParamsWithCluster(ThreadNetworkDiagnosticsServer, ThreadEndpoint, {
            maxIntervalCeiling: Minutes(1),
            minIntervalFloor: Seconds(1),
        });
    });
});

async function expectParamsWithCluster(
    cluster: ClusterBehavior.Type,
    utility: EndpointType,
    expected: Partial<Subscribe>,
) {
    // Cluster on root endpoint should affect default
    let node: ServerNode<ServerNode.RootEndpoint> = await MockServerNode.create(
        ServerNode.RootEndpoint.with(cluster) as unknown as typeof ServerNode.RootEndpoint,
    );
    expectParams(node, expected);

    // Cluster from utility endpoint should affect default
    node = await MockServerNode.create({
        parts: [new Endpoint(utility)],
    });
    expectParams(node, expected);

    // Cluster from application endpoint should not affect default
    node = await MockServerNode.create({
        parts: [
            new Endpoint(AggregatorEndpoint, {
                parts: [new Endpoint(utility)],
            }),
        ],
    });
    expectParams(node, {
        minIntervalFloor: Seconds(1),
        maxIntervalCeiling: Minutes(1),
    });
}

function expectParams(node: Node, expected: Partial<Subscribe>, request?: Partial<Subscribe>) {
    const properties = NodePhysicalProperties(node);
    const params = PhysicalDeviceProperties.subscriptionIntervalBoundsFor({ properties, request });
    expect(params).deep.equals(expected);
}
