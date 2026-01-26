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

export type ServerAddressUdp = {
    type: "udp";
    ip: string;
    port: number;
} & AddressStatus;

export type ServerAddressTcp = {
    type: "tcp";
    ip: string;
    port: number;
} & AddressStatus;

export type ServerAddressBle = {
    type: "ble";
    peripheralAddress: string;
} & AddressStatus;

export type ServerAddress = ServerAddressUdp | ServerAddressTcp | ServerAddressBle;

export function ServerAddress(definition: ServerAddress) {
    return {
        ttl: undefined,
        discoveredAt: undefined,
        healthyAt: undefined,
        unhealthyAt: undefined,
        priority: undefined,
        weight: undefined,
        ...definition,
    } as ServerAddress;
}

export namespace ServerAddress {
    export function urlFor(address: ServerAddress): string {
        switch (address.type) {
            case "udp":
            case "tcp":
                const ip = address.ip;
                return `${address.type}://${ip.includes(":") ? `[${ip}]` : ip}:${address.port}`;

            case "ble":
                return `ble://${address.peripheralAddress}`;

            default:
                return `${(address as any).type}://`;
        }
    }

    export function diagnosticFor(address: ServerAddress) {
        const diagnostic = Array<unknown>();

        switch (address.type) {
            case "udp":
            case "tcp":
                diagnostic.push(`${address.type}://`, Diagnostic.strong(address.ip), ":", address.port);
                break;

            case "ble":
                diagnostic.push("ble://", Diagnostic.strong(address.peripheralAddress));
                break;

            default:
                diagnostic.push(`${(address as any).type}://`);
                break;
        }

        if ("ttl" in address && typeof address.ttl === "number") {
            diagnostic.push(" ttl ", Duration.format(address.ttl));
        }

        return Diagnostic.squash(...diagnostic);
    }

    export function isEqual(a: ServerAddress, b: ServerAddress): boolean {
        if (a.type !== b.type) {
            return false;
        }

        if (a.type === "udp" && b.type === "udp") {
            return a.ip === b.ip && a.port === b.port;
        }

        if (a.type === "ble" && b.type === "ble") {
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

    export function selectionPreferenceOf(address: ServerAddress) {
        if (!("ip" in address)) {
            return SelectionPreference.NOT_IP;
        }

        if (address.ip.startsWith("fd")) {
            return SelectionPreference.IPV6_ULA;
        }

        if (address.ip.startsWith("fe00")) {
            return SelectionPreference.IPV6_LINK_LOCAL;
        }

        if (address.ip.includes(":")) {
            return SelectionPreference.IPV6;
        }

        return SelectionPreference.IPV4;
    }
}
