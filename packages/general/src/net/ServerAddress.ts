/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Duration } from "#time/Duration.js";
import { Timestamp } from "#time/Timestamp.js";
import { Seconds } from "#time/TimeUnit.js";

export type ServerAddressUdp = {
    type: "udp";
    ip: string;
    port: number;
};

export type ServerAddressTcp = {
    type: "tcp";
    ip: string;
    port: number;
};

export type ServerAddressBle = {
    type: "ble";
    peripheralAddress: string;
};

export interface Lifespan {
    /** Beginning of lifespan (system time in milliseconds) */
    discoveredAt: Timestamp;

    /** Length of lifespan, if known (seconds) */
    ttl: Duration;
}

export type ServerAddress = (ServerAddressUdp | ServerAddressTcp | ServerAddressBle) & Partial<Lifespan>;

export function ServerAddress(definition: ServerAddress.Definition) {
    return {
        discoveredAt: undefined,
        ...definition,
        ttl: Seconds(definition.ttl),
    } as ServerAddress;
}

export namespace ServerAddress {
    export function urlFor(address: ServerAddress): string {
        switch (address.type) {
            case "udp":
            case "tcp":
                return `${address.type}://${address.ip}:${address.port}`;

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

    export function definitionOf(address: ServerAddress): Definition {
        return address;
    }

    export interface Definition extends Omit<ServerAddress, "ttl"> {
        ttl?: Duration;
    }
}
