/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Environment, Environmental, MatterError, Millis, Semaphore } from "#general";
import { Peer } from "./Peer.js";

/**
 * Thrown when a named network profile does not exist.
 */
export class UnknownNetworkProfileError extends MatterError {}

/**
 * A single logical Matter networking segment.
 *
 * A "network profile" is a logical grouping of nodes that share rate limits.  By default matter.js selects a network
 * based on medium, falling back to {@link NetworkProfiles.conservative} if the medium is unknown.
 *
 * TODO - record latency and packet loss to support dynamic rate limits
 */
export interface NetworkProfile {
    id: string;
    semaphore: Semaphore;
}

/**
 * Controls how we interact with peers based on the network in which the peer resides.
 */
export class NetworkProfiles {
    #networks = new Map<string, NetworkProfile>();
    #defaults: NetworkProfiles.Templates;

    constructor(options?: NetworkProfiles.Options) {
        this.#defaults = {
            ...NetworkProfiles.defaults,
            ...options,
        };
    }

    static [Environmental.create](env: Environment) {
        const instance = new this();
        env.set(NetworkProfiles, instance);
        return instance;
    }

    select(peer: Peer, id?: string) {
        if (id !== undefined) {
            return this.get(id);
        }

        return this.forPeer(peer);
    }

    /**
     * Retrieve the named network profile.
     *
     * @param id one of the standard {@link NetworkProfiles.Templates} or any previously configured identifier
     */
    get(id: string) {
        const network = this.#networks.get(id);

        if (network) {
            return network;
        }

        if (!(id in NetworkProfiles.defaults)) {
            throw new UnknownNetworkProfileError(`Network profile ${id} is not configured`);
        }

        return this.configure(id, NetworkProfiles.defaults[id as keyof NetworkProfiles.Templates]);
    }

    configure(id: string, parameters: NetworkProfiles.Limits) {
        const network: NetworkProfile = {
            id,
            semaphore: new Semaphore(`network semaphore ${id}`, parameters.exchanges, parameters.delay),
        };
        this.#networks.set(id, network);
        return network;
    }

    forPeer(peer: Peer) {
        const pp = peer.physicalProperties;

        let id: string, defaults: NetworkProfiles.Limits;
        if (pp === undefined) {
            id = "unknown";
            defaults = this.#defaults.conservative;
        } else if (pp.threadActive || (pp.threadActive === undefined && pp.supportsThread)) {
            if (pp.threadChannel) {
                id = `thread:${pp.threadChannel}`;
            } else {
                id = "thread";
            }
            defaults = this.#defaults.thread;
        } else if (pp.supportsWifi || pp.supportsEthernet) {
            id = "fast";
            defaults = this.#defaults.fast;
        } else {
            id = "unknown";
            defaults = this.#defaults.conservative;
        }

        return this.#networks.get(id) ?? this.configure(id, defaults);
    }
}

export namespace NetworkProfiles {
    export interface Options extends Partial<Templates> {}

    /**
     * Parameters that control exchange throttling for a specific medium.
     */
    export interface Limits {
        /**
         * Maximum number of concurrent exchanges.
         */
        exchanges: number;

        /**
         * Delay between new exchanges.
         */
        delay?: Duration;
    }

    /**
     * Standard profiles, selected automatically based on transfer medium.
     */
    export interface Templates {
        /**
         * Limit for "fast" networks.
         *
         * We use this value for ethernet and WiFi.
         */
        fast: Limits;

        /**
         * Limit for thread networks, by channel.
         *
         * Each channel has a separate network, plus an additional one for devices that do not report their channel.
         * If the device indicates thread is disabled then we use {@link fast}.
         */
        thread: Limits;

        /**
         * Fallback limits for unknown profiles.
         */
        conservative: Limits;

        /**
         * Limit for "unlimited" networks.
         *
         * Interactions only use this profile if you specify explicitly.
         */
        unlimited: Limits;
    }

    /**
     * The fallback used for unknown network IDs or mediums.
     */
    export const conservative: Limits = {
        exchanges: 4,
        delay: Millis(100),
    };

    export const defaults: Templates = {
        unlimited: { exchanges: Infinity },
        fast: { exchanges: 200 },
        thread: conservative,
        conservative,
    };
}
