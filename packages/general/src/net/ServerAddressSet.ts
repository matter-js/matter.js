/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AddressStatus, ServerAddress } from "./ServerAddress.js";

/**
 * A set of server addresses ordered by a comparator.
 */
export interface ServerAddressSet<T extends ServerAddress> {
    /**
     * Add an address.
     *
     * If the address alreay exists, returns the existing address to facilitate comparison by value.  If not, returns
     * the input address.
     */
    add(address: T): T;

    /**
     * Delete an address.
     */
    delete(address: T): boolean;

    /**
     * Replace the stored addresses.
     */
    replace(newAddresses: Iterable<T>): void;

    /**
     * Test for existence of address.
     */
    has(address: T): boolean;

    /**
     * The number of addresses.
     */
    size: number;

    /**
     * Iterate.
     *
     * If you replace addresses during iteration only addresses not already produced will be covered by remaining
     * iterations.
     */
    [Symbol.iterator](): Iterator<T>;
}

/**
 * Create a new {@link ServerAddressSet}.
 */
export function ServerAddressSet<T extends ServerAddress>(
    initial?: Iterable<T>,
    comparator = ServerAddressSet.compareDesirability,
) {
    let version = 0;
    let addresses: undefined | Map<string, T>;

    const set: ServerAddressSet<T> = {
        add(address: T) {
            version++;
            const key = ServerAddress.urlFor(address);
            const existing = addresses?.get(key);
            if (existing) {
                return existing;
            }

            if (!addresses) {
                addresses = new Map();
            }

            addresses.set(key, address);
            return address;
        },

        delete(address: T) {
            version++;
            return addresses?.delete(ServerAddress.urlFor(address)) ?? false;
        },

        has(address: T) {
            return addresses?.has(ServerAddress.urlFor(address)) ?? false;
        },

        replace(newAddresses) {
            version++;
            const oldAddresses = addresses;
            addresses = new Map();
            for (const address of newAddresses) {
                const key = ServerAddress.urlFor(address);
                addresses.set(key, oldAddresses?.get(key) ?? address);
            }
        },

        get size() {
            return addresses?.size ?? 0;
        },

        *[Symbol.iterator]() {
            const tried = new Set<string>();

            all: while (true) {
                const currentVersion = version;
                const ordered = addresses
                    ? [...addresses.entries()].map(([, address]) => address).sort(comparator)
                    : [];

                for (const address of ordered) {
                    // Skip duplicates or addresses we've tried with previous sets
                    const key = ServerAddress.urlFor(address);
                    if (tried.has(key)) {
                        continue;
                    }

                    yield address;

                    // Restart iteration if the underlying address set changed
                    if (currentVersion !== version) {
                        continue all;
                    }
                }

                break;
            }
        },
    };

    if (initial) {
        set.replace(initial);
    }

    return set;
}

export namespace ServerAddressSet {
    export interface Comparator<T extends ServerAddress = ServerAddress> {
        (addr1: T, addr2: T): number;
    }

    /**
     * Update a list of addresses with health information from another list.
     */
    export function copyHealth<T extends ServerAddress>(targetAddresses: Iterable<T>, sourceAddresses: Iterable<T>) {
        const output = [...targetAddresses];

        nextTarget: for (let i = 0; i < output.length; i++) {
            const target = output[i];
            for (const source of sourceAddresses) {
                if (ServerAddress.isEqual(target, source)) {
                    if (source.healthyAt !== undefined || source.unhealthyAt !== undefined) {
                        output[i] = { ...target, healthyAt: source.healthyAt, unhealthyAt: source.unhealthyAt };
                    }
                    continue nextTarget;
                }
            }
        }

        return output;
    }

    /**
     * Compare the "desirability" of two addresses for communication.
     */
    export function compareDesirability(a: ServerAddress, b: ServerAddress) {
        const value = ServerAddress.selectionPreferenceOf(a) - ServerAddress.selectionPreferenceOf(b);

        if (value) {
            return value;
        }

        // Compare health
        const relativeHealth = compareHealth(a, b);
        if (relativeHealth) {
            return relativeHealth;
        }

        // Compare priority if known for both addresses
        if (a.priority !== undefined && b.priority !== undefined) {
            return b.priority - a.priority;
        }

        return 0;
    }

    /**
     * Compare the health of two addresses.
     *
     * Returns a negative number if a is healthier, positive if b is healthier and 0 if assessment is neutral.
     */
    export function compareHealth(a: AddressStatus, b: AddressStatus) {
        const ha = ServerAddress.healthOf(a);
        const hb = ServerAddress.healthOf(b);

        // If a is unhealthy, check b's unhealth
        if (ha.unhealthyAt) {
            if (hb.unhealthyAt) {
                // Prefer smaller "unhealthy at" value
                return ha.unhealthyAt - hb.unhealthyAt;
            }

            // Prefer b as it is healthy or unused
            return 1;
        }

        // If b is unhealthy and a is not; prefer b
        if (hb.unhealthyAt) {
            return -1;
        }

        // If a is known healthy, check b's health
        if (ha.healthyAt) {
            if (hb.healthyAt) {
                // Prefer greater health value
                return hb.healthyAt - ha.healthyAt;
            }

            // Prefer a as b has not been used
            return -1;
        }

        // No preference
        return 0;
    }
}
