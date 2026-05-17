#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cluster-client binding example.  An OnOff Light endpoint declares OccupancySensingClient as an
 * optional client cluster and hosts a BindingServer.  A controller writes a Binding entry on this
 * endpoint pointing at a remote occupancy sensor; when the sensor reports "occupied" the light
 * turns on.
 */

import { Endpoint, ServerNode } from "@matter/main";
import { BindingServer } from "@matter/main/behaviors/binding";
import { OccupancySensingClient } from "@matter/main/behaviors/occupancy-sensing";
import { OnOffServer } from "@matter/main/behaviors/on-off";
import { OccupancySensing } from "@matter/main/clusters/occupancy-sensing";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";
import { Read } from "@matter/main/protocol";

// OnOffLightDevice declares OccupancySensingClient as an optional client cluster per Matter spec
// § 4.1.  withClientClusters() registers it so BindingManager installs the behavior on the
// materialized remote endpoint when a binding to an occupancy sensor is established.
const OccupancyLightType = OnOffLightDevice.with(BindingServer).withClientClusters(OccupancySensingClient);

const node = await ServerNode.create({ id: "occupancy-binding-light" });
const lightEndpoint = new Endpoint(OccupancyLightType, { id: "onoff-light" });
await node.add(lightEndpoint);

// Subscriptions installed per established binding so they can be torn down on removed.
const occupancyHandlers = new Map<Endpoint, (occupancy: OccupancySensing.Occupancy) => void>();

lightEndpoint.events.binding.established.on(async resolution => {
    if (resolution.kind === "group") {
        console.log("Group binding not supported in this example — ignoring");
        return;
    }
    if (resolution.kind === "server") {
        console.log("Self-binding case — not exercised in this example");
        // Self-binding would subscribe to a local OccupancySensingServer:
        //   resolution.endpoint.events.occupancySensing.occupancy$Changed.on(handler);
        return;
    }

    console.log(`Binding established to remote occupancy sensor: ${resolution.node}`);

    // Enable a sustained Matter subscription so occupancy attribute updates arrive over the wire.
    await resolution.node.set({
        network: {
            defaultSubscription: Read(
                Read.Attribute({
                    endpoint: resolution.endpoint.number,
                    cluster: OccupancySensing,
                    attributes: "occupancy",
                }),
            ),
            autoSubscribe: true,
        },
    });

    const handler = async (occupancy: OccupancySensing.Occupancy) => {
        if (occupancy.occupied !== true) {
            return;
        }
        console.log("Occupancy detected — turning light ON");
        try {
            await lightEndpoint.act("occupancy-on", agent => agent.get(OnOffServer).on());
        } catch (err) {
            console.error("OnOff.on failed:", err);
        }
    };

    resolution.endpoint.eventsOf(OccupancySensingClient).occupancy$Changed.on(handler);
    occupancyHandlers.set(resolution.endpoint, handler);
});

lightEndpoint.events.binding.removed.on(resolution => {
    if (resolution.kind !== "client") {
        return;
    }
    const handler = occupancyHandlers.get(resolution.endpoint);
    if (handler === undefined) {
        return;
    }
    resolution.endpoint.eventsOf(OccupancySensingClient).occupancy$Changed.off(handler);
    occupancyHandlers.delete(resolution.endpoint);
});

await node.run();
