/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Duration } from "#time/Duration.js";
import { Timestamp } from "#time/Timestamp.js";

export interface AddressLifespan {
    /**
     * Beginning of lifespan
     */
    discoveredAt: Timestamp;

    /**
     * Length of lifespan, if known
     */
    ttl: Duration;
}

export interface AddressStatus extends Partial<AddressLifespan> {
    /**
     * Time of last successful access.
     */
    healthyAt?: Timestamp;

    /**
     * Time of last unsuccessful access.
     */
    unhealthyAt?: Timestamp;

    /**
     * DNS priority.
     */
    priority?: number;

    /**
     * DNS weight.
     */
    weight?: number;
}

/** Transport-agnostic IP address as discovered via DNS-SD. */
export type ServerAddressIp = {
    ip: string;
    port: number;
} & AddressStatus;

/** IP address with explicit UDP transport. */
export type ServerAddressUdp = ServerAddressIp & { type: "udp" };

/** IP address with explicit TCP transport. */
export type ServerAddressTcp = ServerAddressIp & { type: "tcp" };

export type ServerAddressBle = {
    type: "ble";
    peripheralAddress: string;
} & AddressStatus;

export type ServerAddress = ServerAddressIp | ServerAddressUdp | ServerAddressTcp | ServerAddressBle;

export function ServerAddress(definition: ServerAddress) {
    return {
        ttl: undefined,
        discoveredAt: undefined,
        healthyAt: undefined,
        unhealthyAt: undefined,
        priority: undefined,
        weight: undefined,
        ...definition,
    } as unknown as ServerAddress;
}

export namespace ServerAddress {
    /** Type guard for IP-based addresses (with or without explicit transport type). */
    export function isIp(address: ServerAddress): address is ServerAddressIp {
        return (address as ServerAddressIp).ip !== undefined;
    }

    /** Type guard for BLE addresses. */
    export function isBle(address: ServerAddress): address is ServerAddressBle {
        return (address as ServerAddressBle).peripheralAddress !== undefined;
    }

    /** Returns the transport protocol label for display — "udp", "tcp", or "ip" if unspecified. */
    export function protocolOf(address: ServerAddress): string {
        if (isBle(address)) {
            return "ble";
        }
        if ("type" in address && typeof address.type === "string") {
            return address.type;
        }
        return "ip";
    }

    export function urlFor(address: ServerAddress): string {
        if (isIp(address)) {
            const proto = protocolOf(address);
            const host = address.ip.includes(":") ? `[${address.ip}]` : address.ip;
            return `${proto}://${host}:${address.port}`;
        }

        if (isBle(address)) {
            return `ble://${address.peripheralAddress}`;
        }

        return `unknown://`;
    }

    export function diagnosticFor(address: ServerAddress) {
        const diagnostic = Array<unknown>();

        if (isIp(address)) {
            diagnostic.push(`${protocolOf(address)}://`, Diagnostic.strong(address.ip), ":", address.port);
        } else if (isBle(address)) {
            diagnostic.push("ble://", Diagnostic.strong(address.peripheralAddress));
        } else {
            diagnostic.push("unknown://");
        }

        if ("ttl" in address && typeof address.ttl === "number") {
            diagnostic.push(" ttl ", Duration.format(address.ttl));
        }

        return Diagnostic.squash(...diagnostic);
    }

    /** IP addresses are equal if ip and port match, regardless of transport type. */
    export function isEqual(a: ServerAddress, b: ServerAddress): boolean {
        if (isIp(a) && isIp(b)) {
            return a.ip === b.ip && a.port === b.port;
        }

        if (isBle(a) && isBle(b)) {
            return a.peripheralAddress === b.peripheralAddress;
        }

        return false;
    }

    /**
     * Compute logical health of an address.
     *
     * This returns heathyAt/unhealthyAt values with unhealthyAt set to undefined if the address was more recently
     * healthy.
     */
    export function healthOf(health: AddressStatus): AddressStatus {
        if (health.unhealthyAt === undefined) {
            return health;
        }

        if (health.healthyAt !== undefined && health.healthyAt > health.unhealthyAt) {
            return {
                healthyAt: health.healthyAt,
            };
        }

        return health;
    }

    /**
     * Network address desirability from a Matter communication perspective.
     *
     * Lower values indicate higher preference.  This is not a standard "happy eyeballs" ranking but works similarly.
     */
    export enum SelectionPreference {
        IPV6_ULA,
        IPV6_LINK_LOCAL,
        IPV6,
        IPV4,
        NOT_IP = 3,
    }

    /** True when `ip` is an IPv6 link-local address (fe80::/10).  Assumes lowercase — DNS codec output is. */
    const IPV6_LINK_LOCAL_PATTERN = /^fe[89ab]/;
    export function isIpv6LinkLocal(ip: string): boolean {
        return IPV6_LINK_LOCAL_PATTERN.test(ip);
    }

    export function selectionPreferenceOf(address: ServerAddress) {
        if (!isIp(address)) {
            return SelectionPreference.NOT_IP;
        }

        const ip = address.ip;
        if (ip.startsWith("fd")) {
            return SelectionPreference.IPV6_ULA;
        }

        if (isIpv6LinkLocal(ip)) {
            return SelectionPreference.IPV6_LINK_LOCAL;
        }

        if (ip.includes(":")) {
            return SelectionPreference.IPV6;
        }

        return SelectionPreference.IPV4;
    }
}
