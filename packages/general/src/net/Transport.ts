/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { Bytes } from "#util/Bytes.js";
import { BasicSet } from "#util/Set.js";
import { Channel, ChannelType } from "./Channel.js";
import { ServerAddress } from "./ServerAddress.js";

/**
 * A local network endpoint for message transport.
 */
export interface Transport {
    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): Transport.Listener;
    close(): Promise<void>;
    supports(type: ChannelType, address?: string): boolean;
    openChannel(address: ServerAddress): Promise<Channel<Bytes>>;
}

export namespace Transport {
    export interface Listener {
        close(): Promise<void>;
    }

    export interface Provider<T extends Transport = Transport> {
        /**
         * Obtain an interface capable of routing an address.
         */
        interfaceFor(type: ChannelType, address?: string): T | undefined;

        /**
         * Obtain an interface of specific type.
         */
        hasInterfaceFor(type: ChannelType, address?: string): boolean;
    }
}

/**
 * Extension of {@link Transport} for connection-oriented protocols (TCP).
 * Adds lifecycle hooks for connection/disconnection events.
 * Methods are optional — a transport may only implement one direction.
 */
export interface ConnectionOrientedTransport extends Transport {
    /** Fires when a remote peer connects (server role). */
    onConnect?(listener: (channel: Channel<Bytes>) => void): Transport.Listener;
    /** Fires when a connection drops. */
    onDisconnect?(listener: (channel: Channel<Bytes>) => void): Transport.Listener;
}

/**
 * A collection of {@link Transport}s managed as a unit.
 */
export class TransportSet<T extends Transport = Transport> extends BasicSet<T> implements Transport.Provider<T> {
    constructor(...initialInterfaces: T[]) {
        super(...initialInterfaces);
    }

    static [Environmental.create](env: Environment) {
        const instance = new TransportSet();
        env.set(TransportSet, instance);
        return instance;
    }

    /**
     * Closes all interfaces.
     */
    async close() {
        for (const transportInterface of this) {
            await transportInterface.close();
        }
        this.clear();
    }

    /**
     * Obtain an interface capable of routing an address.
     */
    interfaceFor(type: ChannelType, address?: string) {
        return this.find(transportInterface => transportInterface.supports(type, address));
    }

    /**
     * Obtain an interface of specific type.
     */
    hasInterfaceFor(type: ChannelType, address?: string) {
        return this.interfaceFor(type, address) !== undefined;
    }
}
