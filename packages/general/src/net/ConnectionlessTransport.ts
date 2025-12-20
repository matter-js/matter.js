/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { Bytes } from "#util/Bytes.js";
import { BasicSet } from "#util/Set.js";
import { Channel, ChannelType } from "./Channel.js";
import { ServerAddress } from "./ServerAddress.js";

/**
 * A local network endpoint associated with a specific {@link ServerAddress} for a connectionless protocol.
 */
export interface ConnectionlessTransport {
    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): ConnectionlessTransport.Listener;
    close(): Promise<void>;
    supports(type: ChannelType, address?: string): boolean;
    openChannel(address: ServerAddress): Promise<Channel<Bytes>>;
}

export namespace ConnectionlessTransport {
    export interface Listener {
        close(): Promise<void>;
    }
}

/**
 * A collection of {@link ConnectionlessTransport}s managed as a unit.
 */
export class ConnectionlessTransportSet<
    T extends ConnectionlessTransport = ConnectionlessTransport,
> extends BasicSet<T> {
    constructor(...initialInterfaces: T[]) {
        super(...initialInterfaces);
    }

    static [Environmental.create](env: Environment) {
        const instance = new ConnectionlessTransportSet();
        env.set(ConnectionlessTransportSet, instance);
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
