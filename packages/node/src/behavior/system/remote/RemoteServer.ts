/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { AppAddress, MatterAggregateError } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import type { ServerNode } from "#node/ServerNode.js";
import { RemoteInterface } from "./RemoteInterface.js";
import { RemoteInterfaceService } from "./RemoteInterfaceService.js";

// Register built-in API interfaces
import "./interfaces/index.js";

/**
 * Remote access server for a {@link ServerNode}.
 *
 *
 * # Overview
 *
 * This behavior implements remote access to matter.js internals via non-Matter protocols.  Protocols included with
 * matter.js include HTTP/REST, WebSockets and MQTT.
 *
 * Remote access supports various use cases:
 *
 *   - Local control of a node via UNIX socket
 *
 *   - Server-to-server communication such as synchronizing Matter state with another application
 *
 *   - Client-server communication between a node and mobile or web UI
 *
 *
 * # Configuration
 *
 * You enable remote protocols in by specifying service addresses in {@link RemoteServer#state}.  A service address is a
 * URL.  See {@link RemoteServer#State} for more details.
 *
 * The service URL protocol selects the type of API interface, which must have a corresponding {@link RemoteInterface}
 * registered with {@link RemoteInterfaceService}.  If no appropriate API interface is present for a given protocol the
 * server will log an error.
 *
 * API interfaces included with matter.js implement HTTP, WebSockets and MQTT if appropriate platform components are
 * present.  Matter.js provides interfaces for common platforms with protocol support as follows.
 *
 * With an HTTP implementation such as that provided by @matter/nodejs:
 *   - http
 *   - https
 *   - http+unix
 *   - https+unix
 *
 * With a WebSocket implementation such as that provided by @matter/nodejs-ws:
 *   - ws
 *   - wss
 *   - ws+unix
 *   - wss+unix
 *
 * With an MQTT implementation such as that provided by @matter/mqtt:
 *   - mqtt
 *   - mqtts
 *   - mqtt+ws
 *   - mqtt+wss
 *   - mqtt+unix
 *   - mqtts+unix
 *
 * The "s" suffix indicates standard TLS support.
 *
 * The "+unix" suffix indicates that the hostname is a URL encoded path to a UNIX socket.  The socket path may be
 * absolute or relative to the node's storage root.
 *
 *
 * # Interface scope
 *
 * The path segment in the URL generally acts as additional scope dependent on the service type, as follows:
 *
 *   - For HTTP, this is the root path of matter.js APIs.  You may want to set this if you run multiple services on the
 *     same HTTP server.
 *
 *   - For web sockets, this acts as an additional prefix on {@link RemoteRequest#target}.
 *
 *   - For MQTT, this adds an additional prefix to all matter.js topics.
 *
 * If you include the special token `{node}` in a service path, matter.js replaces it with {@link ServerNode#id}.
 */
export class RemoteServer extends Behavior {
    static override readonly id = "remote";
    static override readonly early = true;

    declare internal: RemoteServer.Internal;
    declare state: RemoteServer.State;

    override async initialize() {
        this.#configureProtocol("http", this.state.http ?? false, this.state.httpAddress);
        this.#configureProtocol("ws", this.state.ws ?? false, this.state.httpAddress?.replace(/^http/, "ws"));
        this.#configureProtocol("mqtt", this.state.mqtt ?? !!this.state.mqttAddress, this.state.mqttAddress);

        this.reactTo((this.endpoint as ServerNode).lifecycle.online, this.#start);
        this.reactTo((this.endpoint as ServerNode).lifecycle.offline, this.#onOffline);

        // If configured to allow interfaces when offline, we must manually ensure we aren't active during node
        // destruction
        this.reactTo((this.endpoint as ServerNode).lifecycle.destroying, this.#stop);

        if (this.state.allowOfflineUse) {
            await this.#start();
        }
    }

    override [Symbol.asyncDispose]() {
        return this.#stop();
    }

    #configureProtocol(name: string, enabled: boolean, defaultAddress?: string) {
        if (!enabled) {
            this.state.services = this.state.services.filter(service => {
                const address = new AppAddress(service);
                return address.appProtocol !== name && address.appProtocol !== `${name}s`;
            });
            return;
        }

        if (defaultAddress === undefined) {
            return;
        }

        if (this.state.services.some(service => service.toString() === defaultAddress)) {
            return;
        }

        this.state.services.push(defaultAddress);
    }

    async #start() {
        if (!this.state.enabled || this.internal.interfaces) {
            return;
        }

        const interfaceService = this.env.get(RemoteInterfaceService);
        const interfacePromises = this.state.services.map(address => {
            const addr = AppAddress.for(address);
            addr.pathname = addr.pathname.replace(/\{node\}|%7[bB]node%7[dD]/g, this.endpoint.id);
            return interfaceService.create(this.endpoint as ServerNode, addr);
        });

        this.internal.interfaces = await MatterAggregateError.allSettled(interfacePromises);
    }

    async #stop() {
        if (!this.internal.interfaces) {
            return;
        }

        const { interfaces } = this.internal;

        await MatterAggregateError.allSettled(interfaces.map(intf => intf.close()));
    }

    async #onOffline() {
        if (!this.state.allowOfflineUse) {
            await this.#stop();
        }
    }

    static override readonly schema = new DatatypeModel(
        {
            name: "ApiState",
            type: "struct",
        },

        FieldElement({ name: "httpAddress", type: "string" }),
        FieldElement({ name: "http", type: "bool" }),
        FieldElement({ name: "ws", type: "bool" }),
        FieldElement({ name: "mqttAddress", type: "string" }),
        FieldElement({ name: "mqtt", type: "bool" }),
        FieldElement({ name: "services", type: "list" }, FieldElement({ name: "entry", type: "string" })),
        FieldElement({ name: "enabled", type: "bool" }),
        FieldElement({ name: "allowOfflineUse", type: "bool" }),
    );
}

export namespace RemoteServer {
    export class Internal {
        interfaces?: Array<RemoteInterface>;
    }

    export class State {
        #services?: string[];

        /**
         * The default address for HTTP and WebSocket endpoints.
         */
        httpAddress? = "http+unix://matter.sock";

        /**
         * Enable HTTP API.
         *
         * Adds an address to {@link services} if true.  Removes HTTP addresses from {@link services} if false.
         *
         * Defaults to false.  Ignored if {@link httpAddress} is undefined or there is no HTTP implementation installed.
         */
        http?: boolean;

        /**
         * Enable WebSocket API.
         *
         * Adds an address to {@link services} if true.  Removes WS addresses from {@link services} if false.
         *
         * Defaults to false.  Ignored if {@link httpAddress} is undefined or there is no WebSocket implementation
         * installed.
         */
        ws?: boolean;

        /**
         * The default address for an MQTT broker.
         */
        mqttAddress?: string;

        /**
         * Enable MQTT API.
         *
         * Adds an address to {@link services} if true.  Removes WS addresses from {@link services} if false.
         *
         * Defaults to true if {@link mqttAddress} is defined.  Ignored if {@link mqttAddress} is undefined or there is
         * no MQTT implementation installed.
         */
        mqtt?: boolean;

        /**
         * The API services to publish.
         *
         * Above shortcuts make configuration more straightforward, but you can also specify a list of services directly
         * here.
         */
        get services(): string[] {
            return this.#services ?? [];
        }

        set services(services: AppAddress.Definition[] | undefined) {
            this.#services = services?.map(definition => new AppAddress(definition).toString()) ?? [];
        }

        /**
         * Set to false to disable the server.
         *
         * This is useful to allow for runtime configuration of HTTP support.
         */
        enabled = true;

        /**
         * By default the HTTP endpoint is available as soon as the {@link Node} initializes.
         *
         * If you set this to false, the HTTP endpoint is only available when the {@link Node}'s Matter networking is
         * also online.
         */
        allowOfflineUse = true;
    }
}
