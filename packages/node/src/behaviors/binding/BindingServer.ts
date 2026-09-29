/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, MaybePromise } from "@matter/general";
import { BindingBehavior } from "./BindingBehavior.js";
import { BindingManager, type BindingResolution } from "./BindingManager.js";

/**
 * Default server implementation of the Matter Binding cluster.
 *
 * Subscribe to {@link BindingServer.Events.established} and {@link BindingServer.Events.removed} on
 * the endpoint to react when peers add or remove binding entries pointing at this endpoint, then
 * use the materialized node and endpoint in the resolution payload to talk to the bound peer.
 *
 * ## How bindings work in matter.js
 *
 * The Matter Binding cluster (§ 9.6) lets a controller tell one of our endpoints "talk to these
 * other nodes for these clusters".  When a controller writes an entry to the `binding` attribute,
 * the framework resolves it into a typed peer abstraction.  The kind of abstraction depends on
 * the entry contents:
 *
 * - **`kind: "client"`** — the entry targets a specific remote node.  The framework registers a
 *   {@link ClientNode} for the peer, opens a CASE session in the background, materializes the
 *   target endpoint, and installs each of this endpoint's declared client cluster behaviors on it.
 *   The `established` event fires once the peer is online; the resolution carries the
 *   `ClientNode` plus the materialized endpoint ready for read/write/subscribe/invoke.
 *
 * - **`kind: "group"`** — the entry targets a Matter group (multicast).  The framework provides a
 *   {@link ClientGroup} with the materialized endpoint carrying the declared client behaviors;
 *   command invocations and writes on it are sent as group multicast. Read and subscribe is not available.
 *
 * - **`kind: "server"`** — the entry targets a different endpoint of *this same node* (a
 *   "self-binding", typical for bridges).  The resolution endpoint IS the local target endpoint;
 *   commands invoked on it dispatch locally with no wire transport involved.
 *
 * ## Typical developer pattern
 *
 * Declare the client clusters you want to talk to on the source endpoint, install BindingServer,
 * and subscribe to `events.established` on the endpoint.  The framework does the rest.
 * To clean up own logic, use the `events.removed` event, which is also called when the node shuts down.
 *
 * ```ts
 * const LightWithSensorBinding = OnOffLightDevice
 *     .with(BindingServer)
 *     .withClientClusters(OccupancySensingClient);
 *
 * const node = await ServerNode.create();
 * const light = new Endpoint(LightWithSensorBinding, { id: "light" });
 * await node.add(light);
 *
 * light.events.binding.established.on(async resolution => {
 *     if (resolution.kind !== "client") return;
 *
 *     // Enable a sustained Matter subscription so attribute updates arrive over the wire.
 *     await resolution.node.set({
 *         network: {
 *             defaultSubscription: Read(
 *                 Read.Attribute({
 *                     endpoint: resolution.endpoint.number,
 *                     cluster: OccupancySensing.Cluster,
 *                     attributes: "occupancy",
 *                 }),
 *             ),
 *             autoSubscribe: true,
 *         },
 *     });
 *
 *     resolution.endpoint
 *         .eventsOf(OccupancySensingClient)
 *         .occupancy$Changed
 *         .on(occupancy => {
 *             if (occupancy.occupied === true) {
 *                 void light.act(agent => agent.get(OnOffServer).on());
 *             }
 *         });
 * });
 * ```
 *
 * A controller writes a binding entry pointing this light at a remote occupancy sensor; the
 * handler above enables a sustained Matter subscription targeted at the `occupancy` attribute,
 * then reacts to attribute updates routed into the `eventsOf(...)` observable.
 *
 * ## Things to consider when designing your binding logic
 *
 * * Consider whether your use case truly needs a sustained subscription to the bound device.  The
 *   number of parallel subscriptions a device accepts may be limited.
 *   * Polling the data (e.g. a TemperatureMeasurement reading on demand) is often sufficient and
 *     avoids holding a subscription slot.
 *   * If you only want to control the bound device in response to events on your own device (e.g.
 *     toggle when a local switch changes state), you do not need a subscription at all.
 *   * If you do need a subscription, keep its surface small — subscribe only to the attributes
 *     you actually consume, not "everything".
 * * Your access is typically limited to the bound endpoint (and sometimes a single cluster) on the
 *   bound device.  Reads, writes, and invocations may be rejected by the peer; handle errors at
 *   each interaction.
 */
export class BindingServer extends BindingBehavior {
    declare readonly events: BindingServer.Events;

    override initialize() {
        const manager = this.env.get(BindingManager);
        let snapshot = [...this.state.binding];
        for (const entry of snapshot) {
            manager.register(this, this.endpoint, entry);
        }

        this.reactTo(
            this.events.interactionEnd,
            // Must be a regular function, not an arrow, so ReactorBacking.bind() can supply a
            // fresh `this` with a live state reference for each invocation.
            async function (this: BindingServer) {
                const current = this.state.binding;
                const oldKeys = new Map(snapshot.map(e => [BindingManager.entryKey(e), e]));
                const newKeys = new Map(current.map(e => [BindingManager.entryKey(e), e]));
                let mutated = false;
                for (const [k, e] of newKeys) {
                    if (!oldKeys.has(k)) {
                        manager.register(this, this.endpoint, e);
                        mutated = true;
                    }
                }
                const unregistrations = new Array<MaybePromise<void>>();
                for (const [k, e] of oldKeys) {
                    if (!newKeys.has(k)) {
                        unregistrations.push(manager.unregister(this, e));
                        mutated = true;
                    }
                }
                if (unregistrations.length) {
                    await Promise.all(unregistrations);
                }
                if (mutated) {
                    snapshot = [...current];
                }
            },
            { offline: true },
        );
    }

    override async [Symbol.asyncDispose]() {
        await this.env.get(BindingManager).disposeServer(this);
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace BindingServer {
    export class Events extends BindingBehavior.Events {
        /**
         * Fires when a binding entry is resolved into a usable peer abstraction — either on
         * startup (for pre-existing entries) or when a controller writes a new entry.
         *
         * The handler receives a {@link BindingResolution} discriminated by `kind`.  The
         * `endpoint` field always carries any declared client cluster behaviors pre-installed —
         * call `endpoint.eventsOf`, `endpoint.stateOf`, or `endpoint.act` just as you would on
         * any other endpoint.
         *
         * See the class-level "Typical developer pattern" example on {@link BindingServer} for the
         * full shape.
         *
         * **`kind: "client"`** — `resolution.node` is the peer {@link ClientNode};
         * `resolution.endpoint` is the materialized remote endpoint.  CASE is already warming
         * when the event fires.  Attribute changes require an explicit subscription (see class doc).
         *
         * **`kind: "group"`** — `resolution.node` is a {@link ClientGroup} keyed by
         * `(fabricIndex, groupId)`; command invocations are sent as group multicast.  Attribute
         * reads and subscriptions are not available for groups.
         *
         * **`kind: "server"`** — `resolution.node` is our own {@link ServerNode};
         * `resolution.endpoint` IS the local target endpoint.  Dispatch stays local, no wire
         * transport involved.  Useful for bridges where one endpoint should react to another.
         */
        established = AsyncObservable<[BindingResolution]>();

        /**
         * Fires when a previously established binding is removed.  Cleanup mirror of
         * {@link established}: tear down subscriptions, drop cached state, etc.  Fires for every
         * live binding when the endpoint is being disposed.
         *
         * ```ts
         * endpoint.events.binding.removed.on(resolution => {
         *     if (resolution.kind !== "client") return;
         *     // resolution.endpoint is still the same instance that was delivered in established —
         *     // use it to remove subscriptions installed earlier.
         * });
         * ```
         */
        removed = AsyncObservable<[BindingResolution]>();
    }
}
