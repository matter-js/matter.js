/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, Logger, Observable, type HttpEndpoint } from "@matter/general";
import { BleProxyConnection } from "./BleProxyConnection.js";
import { BleProxyCommand, BleProxyEvent, type DeviceDiscoveredData, type StartScanArgs } from "./BleProxyProtocol.js";

const logger = Logger.get("BleProxyHandler");

/**
 * Hub for the BLE proxy WebSocket endpoint.
 *
 * Accepts any number of proxy client connections, broadcasts scan commands to
 * all of them, and tracks which client owns each discovered peripheral so that
 * per-peripheral traffic routes to a single client.
 *
 * The endpoint is unauthenticated by design. The embedder that hosts the WebSocket endpoint
 * (routes upgrades to {@link accept}) is responsible for securing it — for example by placing
 * authentication in front of the upgrade, isolating the network it is reachable on, or fronting
 * it with a reverse proxy.
 */
export class BleProxyHandler {
    #connections = new Set<BleProxyConnection>();
    #closed = false;
    #closing?: Promise<void>;

    /** Active scan intent + args, so clients joining mid-scan can be synced. */
    #scanActive = false;
    #scanArgs?: StartScanArgs;
    /** Connections currently told to scan, for aggregate `scanStopped`. */
    #scanning = new Set<BleProxyConnection>();

    /** address -> owning connection + every connection that has seen it. */
    #owners = new Map<string, { owner: BleProxyConnection; seers: Set<BleProxyConnection> }>();

    // An observer that throws must not abort emission or prevent state updates later in the same handler
    readonly #observerFailed = (error: Error) => logger.error("Observer failed:", error);

    /** Emitted whenever a connection completes its handshake. */
    readonly connectionEstablished = new Observable<[]>(this.#observerFailed);
    /** Emitted for each `device_discovered`, after ownership is updated. */
    readonly deviceDiscovered = new Observable<[data: DeviceDiscoveredData, connection: BleProxyConnection]>(
        this.#observerFailed,
    );
    /** Emitted once no connection is scanning anymore. */
    readonly scanStopped = new Observable<[reason: string]>(this.#observerFailed);

    get connected(): boolean {
        for (const c of this.#connections) {
            if (c.connected) return true;
        }
        return false;
    }

    /** Accept one proxy-client WebSocket. The embedder routes upgrades (e.g. `HttpEndpoint.ws` at `/ble`) here. */
    accept(connection: HttpEndpoint.WsConnection): BleProxyConnection {
        if (this.#closed) {
            // Never took ownership of this transport, so close it directly rather than leaking the socket
            connection.writable.close().catch(err => logger.debug("Error closing output of rejected accept:", err));
            connection.readable.cancel().catch(err => logger.debug("Error cancelling input of rejected accept:", err));
            throw new ImplementationError("BleProxyHandler is closed and cannot accept new connections");
        }

        const bleConnection = new BleProxyConnection(connection);
        this.#connections.add(bleConnection);

        bleConnection.handshakeCompleted.on(() => this.#onHandshakeCompleted(bleConnection));
        bleConnection.eventReceived.on((event, data) => this.#onConnectionEvent(bleConnection, event, data));
        bleConnection.closed.on(() => this.#onConnectionClosed(bleConnection));

        return bleConnection;
    }

    /** Close all client connections and stop accepting. Safe to call repeatedly and concurrently. */
    close(): Promise<void> {
        return (this.#closing ??= this.#close());
    }

    async #close(): Promise<void> {
        this.#closed = true;

        const connections = [...this.#connections];
        this.#connections.clear();
        this.#scanning.clear();
        this.#owners.clear();

        await Promise.all(connections.map(connection => connection.close()));
    }

    /** Returns the connection that owns `address`, if it is still connected. */
    getOwner(address: string): BleProxyConnection | undefined {
        const entry = this.#owners.get(address);
        if (entry && entry.owner.connected) return entry.owner;
        return undefined;
    }

    async startScan(args: StartScanArgs): Promise<void> {
        this.#scanActive = true;
        this.#scanArgs = args;
        const sends = new Array<Promise<unknown>>();
        for (const connection of this.#connections) {
            if (connection.connected) {
                this.#scanning.add(connection);
                sends.push(
                    connection.sendCommand(BleProxyCommand.StartScan, args).catch(err => {
                        logger.warn(`[${connection.id}] Failed to start scan:`, err);
                        this.#markNotScanning(connection, "start scan failed");
                    }),
                );
            }
        }
        await Promise.all(sends);
    }

    async stopScan(): Promise<void> {
        this.#scanActive = false;
        const sends = new Array<Promise<unknown>>();
        for (const connection of this.#connections) {
            if (connection.connected) {
                sends.push(
                    connection
                        .sendCommand(BleProxyCommand.StopScan)
                        .catch(err => logger.warn(`[${connection.id}] Failed to stop scan:`, err)),
                );
            }
        }
        this.#scanning.clear();
        await Promise.all(sends);
    }

    #onHandshakeCompleted(connection: BleProxyConnection): void {
        if (this.#scanActive && this.#scanArgs) {
            this.#scanning.add(connection);
            connection.sendCommand(BleProxyCommand.StartScan, this.#scanArgs).catch(err => {
                logger.warn(`[${connection.id}] Failed to sync scan to joining client:`, err);
                this.#markNotScanning(connection, "start scan failed");
            });
        }
        this.connectionEstablished.emit();
    }

    #onConnectionEvent(connection: BleProxyConnection, event: string, data: Record<string, unknown>): void {
        if (event === BleProxyEvent.DeviceDiscovered) {
            this.#onDeviceDiscovered(connection, data as unknown as DeviceDiscoveredData);
        } else if (event === BleProxyEvent.ScanStopped) {
            this.#markNotScanning(connection, (data as { reason?: string }).reason ?? "unknown");
        }
    }

    /** Drop a connection from the scanning set; emit aggregate scanStopped once none remain. */
    #markNotScanning(connection: BleProxyConnection, reason: string): void {
        if (!this.#scanning.delete(connection)) {
            return;
        }
        if (this.#scanning.size === 0) {
            this.scanStopped.emit(reason);
        }
    }

    #onDeviceDiscovered(connection: BleProxyConnection, data: DeviceDiscoveredData): void {
        let entry = this.#owners.get(data.address);
        if (!entry) {
            entry = { owner: connection, seers: new Set([connection]) };
            this.#owners.set(data.address, entry);
        } else {
            entry.seers.add(connection);
            if (!entry.owner.connected) {
                entry.owner = connection;
            }
        }
        logger.debug(
            `[${connection.id}] device_discovered ${data.address} rssi=${data.rssi ?? "n/a"} seers=${entry.seers.size} isOwner=${entry.owner === connection}`,
        );
        this.deviceDiscovered.emit(data, connection);
    }

    #onConnectionClosed(connection: BleProxyConnection): void {
        this.#connections.delete(connection);
        this.#markNotScanning(connection, "client disconnected");

        for (const [address, entry] of this.#owners) {
            entry.seers.delete(connection);
            if (entry.owner === connection) {
                let next: BleProxyConnection | undefined;
                for (const seer of entry.seers) {
                    if (seer.connected) {
                        next = seer;
                        break;
                    }
                }
                if (next) {
                    entry.owner = next;
                    logger.info(`Reassigned ownership of ${address} to [${next.id}]`);
                } else {
                    this.#owners.delete(address);
                }
            }
        }
    }
}
