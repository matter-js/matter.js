/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { EndpointInitializer } from "#endpoint/index.js";
import { AppAddress, ImplementationError, InternalError } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import type { ServerNode } from "#node/ServerNode.js";
import { ServerEndpointInitializer } from "#node/index.js";
import { RemoteInterface } from "./RemoteInterface.js";

/**
 * Base class for {@link Behavior}s that enable remote access to a {@link ServerNode} via a non-Matter API.
 *
 * Each protocol supported by Matter.js implements a subclass of {@link RemoteServer} and {@link RemoteInterface}.
 *
 * The {@link RemoteServer} provides a convenient interface for adding a protocol to a {@link ServerNode}.  The The
 * {@link RemoteInterface} implements the actual protocol.
 *
 * For greater control you may instantiate and manage {@link RemoteInterface} separately from {@link RemoteServer}. To
 * implement your own protocol you may extend the server implementations provided by matter.js, or create a new protocol
 * implementation by subclassing {@link RemoteInterface} yourself.
 */
export abstract class RemoteServer extends Behavior {
    static override readonly early = true;

    static interfaceType: RemoteInterface.Type;

    declare internal: RemoteServer.Internal;
    declare state: RemoteServer.State;

    override async initialize() {
        if (!(this.env.get(EndpointInitializer) instanceof ServerEndpointInitializer)) {
            throw new ImplementationError("Remote server is not installed in a ServerNode");
        }

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

    async #start() {
        if (!this.state.enabled || this.internal.interface) {
            return;
        }

        const interfaceType = (this.constructor as typeof RemoteServer).interfaceType;
        if (typeof (interfaceType as any) !== "function") {
            throw new InternalError(`Remote server ${this.constructor.name} does not define a remote interface`);
        }

        const address = new AppAddress(this.state.address);
        const intf = await interfaceType.create(this.endpoint as ServerNode, address);

        this.internal.interface = intf;
    }

    async #stop() {
        const { interface: intf } = this.internal;
        if (!intf) {
            return;
        }

        this.internal.interface = undefined;
        await intf.close();
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

        FieldElement({ name: "address", type: "string" }),
        FieldElement({ name: "enabled", type: "bool" }),
        FieldElement({ name: "allowOfflineUse", type: "bool" }),
    );
}

export namespace RemoteServer {
    export class Internal {
        interface?: RemoteInterface;
    }

    export class State {
        /**
         * The public address at which the service endpoint is accessible.
         *
         * The address is a URL.  See subclasses for supported protocols.  An "s" suffix indicates standard TLS support.
         * The "+unix" suffix indicates that the hostname is a URL encoded path to a UNIX socket.  The socket path may
         * be absolute or relative to the node's storage root.
         *
         * The path portion of the URL generally acts as a namespace prefix for the relevant protocol implementation.
         * Matter.js replaces the special token `{node}` in the URL with the {@link ServerNode.id}.  This allows for
         * multiple nodes to participate in a protocol in separate namespaces.
         */
        address = "";

        /**
         * Set to false to disable this service.
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
