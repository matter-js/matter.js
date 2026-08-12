/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Noble-based BLE proxy client — the reference implementation of the hardware side of the BLE proxy protocol.
 *
 * Connects out to a hub hosting {@link BleProxyHandler} (for example the matter-server `/ble` endpoint) and executes
 * the proxied BLE operations against a local Bluetooth adapter via Noble.  It doubles as a standalone BLE bridge and
 * as an integration testing tool.
 */

import {
    Bytes,
    Duration,
    Environment,
    errorOf,
    ImplementationError,
    Logger,
    Observable,
    PromiseTimeoutError,
    WsProxyCommandError,
    WsProxyConnection,
    Seconds,
    WebSocketClient,
    withTimeout,
} from "@matter/general";
import "@matter/nodejs-ws";
import type { Characteristic, Noble, Peripheral, Service } from "@stoprocent/noble";
import {
    BLE_PROXY_PROTOCOL_VERSION,
    BinaryFrameOpcode,
    BleProxyCommand,
    BleProxyErrorCode,
    BleProxyEvent,
    type BinaryFrame,
    type BleProxyEventName,
    type ConnectResult,
    type DeviceDiscoveredData,
    type DiscoverCharacteristicsResult,
    type DiscoverServicesResult,
    type ReadCharacteristicResult,
    type RequestMtuResult,
} from "../BleProxyProtocol.js";

const logger = Logger.get("NobleBleProxyClient");

/** Matter's BTP service.  Both scanning and the connect-time interview are limited to it. */
const MATTER_SERVICE_UUID = "fff6";

const INTERVIEW_TIMEOUT = Seconds(30);
const LAZY_DISCOVERY_TIMEOUT = Seconds(10);
const ADAPTER_POWER_ON_TIMEOUT = Seconds(10);

type NobleFactory = (options: { extended: boolean }) => Noble;

type NotificationListener = (data: Buffer) => void;

interface Subscription {
    characteristic: Characteristic;
    listener: NotificationListener;
}

interface ConnectionState {
    peripheral: Peripheral;
    services: Map<string, Service>;
    characteristics: Map<string, Characteristic>;
    subscriptions: Map<string, Subscription>;
    lastWriteCharacteristic?: Characteristic;

    /**
     * Serializes writes.  Noble registers each write's completion with `onceExclusive`, so overlapping writes on
     * one characteristic drop all but the last callback and their errors vanish.
     */
    writes: Promise<void>;
}

/** Fields that, when changed, justify re-emitting a device_discovered event. */
interface DiscoverFingerprint {
    name: string;
    connectable: boolean;
    serviceUuids: string;
    serviceData: string;
}

/** Some noble builds export a factory function rather than a ready-made instance. */
function nobleInstanceOf(nobleExport: Noble | NobleFactory): Noble {
    return typeof nobleExport === "function" ? nobleExport({ extended: false }) : nobleExport;
}

function decodeBase64(value: string): Buffer {
    return Buffer.from(Bytes.of(Bytes.fromBase64(value)));
}

function timeoutAfter<T>(promise: Promise<T>, timeout: Duration, message: string): Promise<T> {
    return withTimeout(timeout, promise, () => {
        throw new PromiseTimeoutError(message);
    });
}

function requireString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    if (typeof value !== "string") {
        throw new WsProxyCommandError(BleProxyErrorCode.InternalError, `Command argument ${key} must be a string`);
    }
    return value;
}

function requireNumber(args: Record<string, unknown>, key: string): number {
    const value = args[key];
    if (typeof value !== "number") {
        throw new WsProxyCommandError(BleProxyErrorCode.InternalError, `Command argument ${key} must be a number`);
    }
    return value;
}

function optionalFlag(args: Record<string, unknown>, key: string): boolean {
    const value = args[key];
    if (value === undefined) {
        return false;
    }
    if (typeof value !== "boolean") {
        throw new WsProxyCommandError(BleProxyErrorCode.InternalError, `Command argument ${key} must be a boolean`);
    }
    return value;
}

export class NobleBleProxyClient {
    readonly #serverUrl: string;
    readonly #hciId?: number;
    readonly #environment: Environment;
    #connection?: WsProxyConnection;
    #noble?: Noble;
    #connections = new Map<number, ConnectionState>();
    #nextHandle = 1;
    #discoveredPeripherals = new Map<string, Peripheral>();
    #lastDiscoverFingerprint = new Map<string, DiscoverFingerprint>();
    #started = false;
    #closing = false;
    /** Hub's last commanded scan state, independent of whether noble is actually scanning right now. */
    #hubScanRequested = false;
    #closePromise?: Promise<void>;
    #nobleWarningListener?: (message: string) => void;
    #nobleStateListener?: (state: string) => void;
    #nobleDiscoverListener?: (peripheral: Peripheral) => void;

    /** Emitted once the connection to the hub is gone, whether we closed it or the hub did. */
    readonly closed = new Observable<[]>(error => logger.error("Observer failed:", error));

    constructor(options: NobleBleProxyClient.Options) {
        this.#serverUrl = options.serverUrl;
        this.#hciId = options.hciId;
        this.#environment = options.environment ?? Environment.default;
    }

    /** True once the handshake completed and until the connection closes. */
    get connected(): boolean {
        return this.#connection?.connected ?? false;
    }

    /**
     * Open the local Bluetooth adapter, connect to the hub, and complete the protocol handshake.
     */
    async connect(): Promise<void> {
        // One socket per instance: a second connect would abandon the previous WsProxyConnection and stack another
        // pair of listeners on noble's process-wide singleton.  The sentinel is set before the first await so
        // concurrent callers cannot both pass the check.
        if (this.#started) {
            throw new ImplementationError(
                "This client has already been connected; construct a new one to reconnect to the hub",
            );
        }
        this.#started = true;

        await this.#loadNoble();

        const connection = await this.#environment.get(WebSocketClient).connect(this.#serverUrl);

        const proxy = new WsProxyConnection({
            connection,
            version: BLE_PROXY_PROTOCOL_VERSION,
            role: "initiator",
            idPrefix: "nbl",
        });
        this.#connection = proxy;

        proxy.setCommandHandler((command, args) => this.#invokeCommand(command, args ?? {}));
        proxy.frameReceived.on(frame => this.#receiveFrame(frame));
        proxy.closed.on(() => {
            if (!this.#closing) {
                logger.info("Disconnected from hub");
            }
            this.closed.emit();
        });

        proxy.start();
        await proxy.opened();
    }

    /**
     * Disconnect every peripheral, stop the adapter and close the hub connection.  Safe to call repeatedly and
     * concurrently; noble's `stop()` must not run twice.
     */
    close(): Promise<void> {
        this.#closing = true;
        return (this.#closePromise ??= this.#close());
    }

    async #close(): Promise<void> {
        for (const [handle, conn] of this.#connections) {
            if (conn.peripheral.state === "connected") {
                // Not awaited: noble's disconnect can stall on a wedged adapter and shutdown must still complete
                conn.peripheral
                    .disconnectAsync()
                    .catch(error => logger.warn(`[CONN] handle=${handle} disconnect during shutdown failed:`, error));
            }
        }
        this.#connections.clear();

        // Noble is a process-wide singleton, so listeners left behind outlive this client
        const noble = this.#noble;
        if (noble !== undefined) {
            if (this.#nobleWarningListener !== undefined) {
                noble.removeListener("warning", this.#nobleWarningListener);
                this.#nobleWarningListener = undefined;
            }
            if (this.#nobleStateListener !== undefined) {
                noble.removeListener("stateChange", this.#nobleStateListener);
                this.#nobleStateListener = undefined;
            }
            if (this.#nobleDiscoverListener !== undefined) {
                noble.removeListener("discover", this.#nobleDiscoverListener);
                this.#nobleDiscoverListener = undefined;
            }
        }

        try {
            noble?.stop();
        } catch (error) {
            // Noble's stop misbehaves when the adapter is not powered on, and it must not strand the socket close
            // that emits `closed`
            logger.warn("[NOBLE] stop failed:", error);
        }

        await this.#connection?.close();
    }

    async #loadNoble(): Promise<void> {
        if (this.#hciId !== undefined) {
            process.env.NOBLE_HCI_DEVICE_ID = this.#hciId.toString();
        }

        const noble = nobleInstanceOf((await import("@stoprocent/noble")).default);
        this.#noble = noble;

        // Noble's own warnings (unknown peripheral, missing service, …) are only visible here; the proxy runs in a
        // different process than the matter.js node that would otherwise surface them
        this.#nobleWarningListener = (message: string) => logger.warn(`[NOBLE] warning: ${message}`);
        this.#nobleStateListener = (state: string) => logger.info(`[NOBLE] stateChange: ${state}`);
        noble.on("warning", this.#nobleWarningListener);
        noble.on("stateChange", this.#nobleStateListener);

        // The hub pushes start_scan as soon as the handshake completes, and noble rejects scanning outright when
        // the adapter is not powered on — with no retry, that leaves this client blind for the whole scan
        try {
            await noble.waitForPoweredOnAsync(ADAPTER_POWER_ON_TIMEOUT);
        } catch (error) {
            logger.warn(
                `[NOBLE] adapter not powered on after ${Duration.format(ADAPTER_POWER_ON_TIMEOUT)}; scanning will fail until it is:`,
                error,
            );
        }
    }

    // ─── Command Dispatch ────────────────────────────────────────────────────

    async #invokeCommand(command: string, args: Record<string, unknown>): Promise<Record<string, unknown> | void> {
        logger.debug(`[←CMD] ${command}${Object.keys(args).length ? ` ${JSON.stringify(args)}` : ""}`);

        switch (command) {
            case BleProxyCommand.StartScan:
                return this.#handleStartScan();

            case BleProxyCommand.StopScan:
                return this.#handleStopScan();

            case BleProxyCommand.Connect:
                return this.#handleConnect(requireString(args, "address"));

            case BleProxyCommand.Disconnect:
                return this.#handleDisconnect(requireNumber(args, "connection_handle"));

            case BleProxyCommand.DiscoverServices:
                return this.#handleDiscoverServices(requireNumber(args, "connection_handle"));

            case BleProxyCommand.DiscoverCharacteristics:
                return this.#handleDiscoverCharacteristics(
                    requireNumber(args, "connection_handle"),
                    requireString(args, "service_uuid"),
                );

            case BleProxyCommand.ReadCharacteristic:
                return this.#handleReadCharacteristic(
                    requireNumber(args, "connection_handle"),
                    requireString(args, "characteristic_uuid"),
                );

            case BleProxyCommand.WriteCharacteristic:
                return this.#handleWriteCharacteristic(
                    requireNumber(args, "connection_handle"),
                    requireString(args, "characteristic_uuid"),
                    requireString(args, "value"),
                    optionalFlag(args, "response"),
                );

            case BleProxyCommand.SubscribeCharacteristic:
                return this.#handleSubscribeCharacteristic(
                    requireNumber(args, "connection_handle"),
                    requireString(args, "characteristic_uuid"),
                );

            case BleProxyCommand.WriteAndSubscribe:
                return this.#handleWriteAndSubscribe(
                    requireNumber(args, "connection_handle"),
                    requireString(args, "write_uuid"),
                    requireString(args, "write_value"),
                    optionalFlag(args, "write_response"),
                    requireString(args, "subscribe_uuid"),
                );

            case BleProxyCommand.UnsubscribeCharacteristic:
                return this.#handleUnsubscribeCharacteristic(
                    requireNumber(args, "connection_handle"),
                    requireString(args, "characteristic_uuid"),
                );

            case BleProxyCommand.RequestMtu:
                return this.#handleRequestMtu(requireNumber(args, "connection_handle"), requireNumber(args, "mtu"));

            default:
                throw new WsProxyCommandError(BleProxyErrorCode.InternalError, `Unknown command: ${command}`);
        }
    }

    // ─── Command Handlers ────────────────────────────────────────────────────

    async #handleStartScan(): Promise<void> {
        const noble = this.#noble;
        if (!noble) {
            throw new WsProxyCommandError(BleProxyErrorCode.BluetoothUnavailable, "Noble not initialized");
        }

        this.#lastDiscoverFingerprint.clear();
        // A repeated scan would otherwise stack listeners and emit each advertisement more than once
        noble.removeAllListeners("discover");
        this.#nobleDiscoverListener = (peripheral: Peripheral) => this.#onDiscover(peripheral);
        noble.on("discover", this.#nobleDiscoverListener);

        try {
            await noble.startScanningAsync([MATTER_SERVICE_UUID], true);
        } catch (error) {
            // The command failed, so the hub does not believe scanning is active; a later connect must not
            // resume it on the hub's behalf
            this.#hubScanRequested = false;
            throw error;
        }
        this.#hubScanRequested = true;
        logger.info(`[SCAN] BLE scan started (filter: ${MATTER_SERVICE_UUID})`);
    }

    async #handleStopScan(): Promise<void> {
        this.#hubScanRequested = false;
        await this.#noble?.stopScanningAsync();
        logger.info("[SCAN] BLE scan stopped");
    }

    async #handleConnect(address: string) {
        const peripheral = this.#discoveredPeripherals.get(address);
        if (!peripheral) {
            logger.error(
                `[CONN] No peripheral found for address "${address}". Known: ${[...this.#discoveredPeripherals.keys()].join(", ")}`,
            );
            throw new WsProxyCommandError(BleProxyErrorCode.DeviceNotFound, `No device found for address ${address}`);
        }

        const noble = this.#noble;
        if (!noble) {
            throw new WsProxyCommandError(BleProxyErrorCode.BluetoothUnavailable, "Noble not initialized");
        }

        const handle = this.#nextHandle++;
        const connState: ConnectionState = {
            peripheral,
            services: new Map(),
            characteristics: new Map(),
            subscriptions: new Map(),
            writes: Promise.resolve(),
        };
        this.#connections.set(handle, connState);

        // Track disconnect at every stage so unexpected drops are surfaced rather than silently hanging the awaiting
        // noble promise
        let disconnectedReason: string | undefined;
        const disconnectListener = () => {
            disconnectedReason = `peripheral disconnected (state=${peripheral.state})`;
            logger.info(`[CONN] Peripheral handle=${handle} disconnected (state=${peripheral.state})`);
            this.#connections.delete(handle);
            this.#sendEvent(BleProxyEvent.Disconnected, { connection_handle: handle });
        };
        peripheral.once("disconnect", disconnectListener);

        let mtu: number;

        logger.info(`[CONN] Connecting to "${address}" (state=${peripheral.state})...`);
        try {
            // Pause scanning during connect + GATT discovery.  On macOS, scanning concurrently with
            // `service.discoverCharacteristicsAsync` causes the CoreBluetooth delegate callback to never fire; the
            // peripheral stays connected but discovery hangs.
            logger.debug("[SCAN] pausing scan for connect+interview...");
            await noble.stopScanningAsync();

            await peripheral.connectAsync();
            logger.info(`[CONN] Connected handle=${handle} state=${peripheral.state} mtu=${peripheral.mtu ?? "?"}`);

            logger.debug(`[GATT] handle=${handle} discoverServicesAsync(["${MATTER_SERVICE_UUID}"])...`);
            const services = await timeoutAfter(
                peripheral.discoverServicesAsync([MATTER_SERVICE_UUID]),
                INTERVIEW_TIMEOUT,
                `discoverServices(${MATTER_SERVICE_UUID}) timed out after ${Duration.format(INTERVIEW_TIMEOUT)}`,
            );
            logger.debug(
                `[GATT] handle=${handle} services: ${services.map(s => s.uuid).join(", ")} state=${peripheral.state}`,
            );

            for (const service of services) {
                connState.services.set(service.uuid, service);
                if (service.uuid !== MATTER_SERVICE_UUID) continue;
                logger.debug(`[GATT] handle=${handle} discoverCharacteristicsAsync() on ${service.uuid}...`);
                const chars = await timeoutAfter(
                    service.discoverCharacteristicsAsync(),
                    INTERVIEW_TIMEOUT,
                    `discoverCharacteristics(${service.uuid}) timed out after ${Duration.format(INTERVIEW_TIMEOUT)}`,
                );
                for (const char of chars) {
                    connState.characteristics.set(char.uuid, char);
                }
                logger.debug(
                    `[GATT] handle=${handle} chars on ${service.uuid}: ${chars.map(c => c.uuid).join(", ")} state=${peripheral.state}`,
                );
            }

            mtu = peripheral.mtu ?? 23;
            logger.info(`[GATT] handle=${handle} ready mtu=${mtu}`);
        } catch (error) {
            const reason = disconnectedReason ?? errorOf(error).message;
            logger.error(`[CONN] handle=${handle} failed: ${reason}`);
            this.#connections.delete(handle);
            peripheral.removeListener("disconnect", disconnectListener);
            if (peripheral.state === "connected") {
                peripheral
                    .disconnectAsync()
                    .catch(disconnectError =>
                        logger.warn(`[CONN] handle=${handle} cleanup disconnect failed:`, disconnectError),
                    );
            }
            await this.#resumeScanIfRequested(noble, "after connect failure");
            throw new WsProxyCommandError(BleProxyErrorCode.InternalError, reason);
        }

        // Resume scanning outside the connect try: a scan failure here must not tear down an interviewed
        // connection, and the hub may have changed its mind about scanning while this was in flight
        await this.#resumeScanIfRequested(noble, "after connect+interview");

        return { connection_handle: handle, mtu } satisfies ConnectResult;
    }

    /**
     * Resume scanning after the connect-time pause, but only if the hub still wants it — a stop_scan received
     * during the pause, or while the resume itself was in flight, must stay in effect.  Never throws: a scan
     * failure here is logged, not surfaced to the command that triggered the resume.
     */
    async #resumeScanIfRequested(noble: Noble, context: string): Promise<void> {
        if (!this.#hubScanRequested) {
            return;
        }
        try {
            logger.debug(`[SCAN] resuming scan ${context}...`);
            await noble.startScanningAsync([MATTER_SERVICE_UUID], true);
            if (!this.#hubScanRequested) {
                await noble.stopScanningAsync();
            }
        } catch (error) {
            logger.warn(`[SCAN] failed to resume scanning ${context}:`, error);
        }
    }

    async #handleDisconnect(connectionHandle: number): Promise<void> {
        const conn = this.#requireConnection(connectionHandle);

        if (conn.peripheral.state === "connected") {
            await conn.peripheral.disconnectAsync();
        }
        this.#connections.delete(connectionHandle);
    }

    async #handleDiscoverServices(connectionHandle: number) {
        const conn = this.#requireConnection(connectionHandle);

        if (conn.services.size > 0) {
            const uuids = [...conn.services.keys()];
            logger.debug(`[GATT] handle=${connectionHandle} services from cache: ${uuids.join(", ")}`);
            return { services: uuids.map(uuid => ({ uuid })) } satisfies DiscoverServicesResult;
        }

        logger.debug(`[GATT] handle=${connectionHandle} discovering services (lazy)...`);
        const services = await timeoutAfter(
            conn.peripheral.discoverServicesAsync([]),
            LAZY_DISCOVERY_TIMEOUT,
            `discoverServices timed out after ${Duration.format(LAZY_DISCOVERY_TIMEOUT)}`,
        );
        for (const service of services) {
            conn.services.set(service.uuid, service);
        }
        logger.debug(`[GATT] handle=${connectionHandle} discovered services: ${services.map(s => s.uuid).join(", ")}`);

        return { services: services.map(s => ({ uuid: s.uuid })) } satisfies DiscoverServicesResult;
    }

    async #handleDiscoverCharacteristics(connectionHandle: number, serviceUuid: string) {
        const conn = this.#requireConnection(connectionHandle);

        const service = conn.services.get(serviceUuid);
        if (!service) {
            throw new WsProxyCommandError(BleProxyErrorCode.ServiceNotFound, `Service ${serviceUuid} not found`);
        }

        const cachedChars = service.characteristics ?? [];
        if (cachedChars.length > 0) {
            logger.debug(
                `[GATT] handle=${connectionHandle} characteristics from cache for ${serviceUuid}: ` +
                    cachedChars.map(c => `${c.uuid}[${c.properties.join(",")}]`).join(", "),
            );
            return {
                characteristics: cachedChars.map(c => ({ uuid: c.uuid, properties: c.properties })),
            } satisfies DiscoverCharacteristicsResult;
        }

        logger.debug(`[GATT] handle=${connectionHandle} discovering characteristics for ${serviceUuid} (lazy)...`);
        const characteristics = await timeoutAfter(
            service.discoverCharacteristicsAsync([]),
            LAZY_DISCOVERY_TIMEOUT,
            `discoverCharacteristics(${serviceUuid}) timed out after ${Duration.format(LAZY_DISCOVERY_TIMEOUT)}`,
        );
        for (const char of characteristics) {
            conn.characteristics.set(char.uuid, char);
        }
        logger.debug(
            `[GATT] handle=${connectionHandle} discovered chars for ${serviceUuid}: ` +
                characteristics.map(c => `${c.uuid}[${c.properties.join(",")}]`).join(", "),
        );

        return {
            characteristics: characteristics.map(c => ({ uuid: c.uuid, properties: c.properties })),
        } satisfies DiscoverCharacteristicsResult;
    }

    async #handleReadCharacteristic(connectionHandle: number, characteristicUuid: string) {
        const conn = this.#requireConnection(connectionHandle);
        const char = this.#requireCharacteristic(conn, characteristicUuid);

        const data = await char.readAsync();
        logger.debug(`[GATT] read ${characteristicUuid} → ${data.length} bytes`);
        return { value: Bytes.toBase64(data) } satisfies ReadCharacteristicResult;
    }

    async #handleWriteCharacteristic(
        connectionHandle: number,
        characteristicUuid: string,
        value: string,
        withResponse: boolean,
    ): Promise<void> {
        const conn = this.#requireConnection(connectionHandle);
        const char = this.#requireCharacteristic(conn, characteristicUuid);

        const data = decodeBase64(value);
        logger.debug(`[GATT] write ${characteristicUuid} ${data.length} bytes withResponse=${withResponse}`);
        await this.#write(conn, char, data, !withResponse);
        conn.lastWriteCharacteristic = char;
    }

    async #handleSubscribeCharacteristic(connectionHandle: number, characteristicUuid: string): Promise<void> {
        const conn = this.#requireConnection(connectionHandle);
        const char = this.#requireCharacteristic(conn, characteristicUuid);

        const listener = this.#forwardNotifications(conn, connectionHandle, characteristicUuid, char);

        try {
            await char.subscribeAsync();
        } catch (error) {
            char.removeListener("data", listener);
            throw error;
        }
        conn.subscriptions.set(characteristicUuid, { characteristic: char, listener });
        logger.debug(`[GATT] subscribe ${characteristicUuid} handle=${connectionHandle}`);
    }

    /**
     * Write and subscribe without an intervening round-trip to the hub, so a peripheral that indicates immediately
     * after the Write Response — as Matter's BTP handshake does on C2 — cannot fire before notifications are enabled.
     */
    async #handleWriteAndSubscribe(
        connectionHandle: number,
        writeUuid: string,
        writeValue: string,
        writeResponse: boolean,
        subscribeUuid: string,
    ): Promise<void> {
        const conn = this.#requireConnection(connectionHandle);
        const writeChar = this.#requireCharacteristic(conn, writeUuid);
        const subscribeChar = this.#requireCharacteristic(conn, subscribeUuid);

        // Notifications are forwarded from the moment the write goes out; an indication that arrives before
        // subscribeAsync resolves is still delivered
        const listener = this.#forwardNotifications(conn, connectionHandle, subscribeUuid, subscribeChar);

        const data = decodeBase64(writeValue);
        logger.debug(
            `[GATT] write ${writeUuid} ${data.length} bytes withResponse=${writeResponse} + subscribe ${subscribeUuid} handle=${connectionHandle}`,
        );

        try {
            await this.#write(conn, writeChar, data, !writeResponse);
        } catch (error) {
            subscribeChar.removeListener("data", listener);
            throw new WsProxyCommandError(
                BleProxyErrorCode.WriteFailed,
                `write(${writeUuid}): ${errorOf(error).message}`,
            );
        }
        conn.lastWriteCharacteristic = writeChar;

        try {
            await subscribeChar.subscribeAsync();
        } catch (error) {
            subscribeChar.removeListener("data", listener);
            throw new WsProxyCommandError(
                BleProxyErrorCode.SubscribeFailed,
                `subscribe(${subscribeUuid}): ${errorOf(error).message}`,
            );
        }
        conn.subscriptions.set(subscribeUuid, { characteristic: subscribeChar, listener });
    }

    async #handleUnsubscribeCharacteristic(connectionHandle: number, characteristicUuid: string): Promise<void> {
        const conn = this.#requireConnection(connectionHandle);

        const subscription = conn.subscriptions.get(characteristicUuid);
        if (!subscription) {
            throw new WsProxyCommandError(BleProxyErrorCode.NotSubscribed, `Not subscribed to ${characteristicUuid}`);
        }

        await subscription.characteristic.unsubscribeAsync();
        subscription.characteristic.removeListener("data", subscription.listener);
        conn.subscriptions.delete(characteristicUuid);
        logger.debug(`[GATT] unsubscribe ${characteristicUuid} handle=${connectionHandle}`);
    }

    async #handleRequestMtu(connectionHandle: number, mtu: number) {
        const conn = this.#requireConnection(connectionHandle);

        // Noble has no explicit MTU request; report what the peripheral negotiated
        const actualMtu = conn.peripheral.mtu ?? mtu;
        logger.debug(`[GATT] request_mtu handle=${connectionHandle} requested=${mtu} actual=${actualMtu}`);
        return { mtu: actualMtu } satisfies RequestMtuResult;
    }

    // ─── Noble Events ────────────────────────────────────────────────────────

    #onDiscover(peripheral: Peripheral): void {
        // On macOS, peripheral.address is often empty — fall back to peripheral.id (UUID)
        const address = peripheral.address || peripheral.id;
        this.#discoveredPeripherals.set(address, peripheral);

        const serviceData: Record<string, string> = {};
        for (const sd of peripheral.advertisement.serviceData ?? []) {
            serviceData[sd.uuid] = Bytes.toBase64(sd.data);
        }

        const name = peripheral.advertisement.localName ?? "(unnamed)";
        const connectable = peripheral.connectable ?? false;
        const serviceUuids = peripheral.advertisement.serviceUuids ?? [];

        const fingerprint: DiscoverFingerprint = {
            name,
            connectable,
            serviceUuids: serviceUuids.join(","),
            serviceData: Object.entries(serviceData)
                .map(([uuid, data]) => `${uuid}=${data}`)
                .sort()
                .join("|"),
        };

        const prev = this.#lastDiscoverFingerprint.get(address);
        const changed =
            !prev ||
            prev.name !== fingerprint.name ||
            prev.connectable !== fingerprint.connectable ||
            prev.serviceUuids !== fingerprint.serviceUuids ||
            prev.serviceData !== fingerprint.serviceData;

        if (!changed) {
            return;
        }
        this.#lastDiscoverFingerprint.set(address, fingerprint);

        logger.debug(
            `[EVT] device_discovered addr=${address} name="${name}" rssi=${peripheral.rssi}` +
                ` services=${JSON.stringify(serviceUuids)}` +
                ` serviceData=${JSON.stringify(Object.keys(serviceData))}`,
        );

        const event = {
            address,
            name: peripheral.advertisement.localName,
            rssi: peripheral.rssi,
            connectable,
            service_data: serviceData,
            service_uuids: serviceUuids,
        } satisfies DeviceDiscoveredData;

        this.#sendEvent(BleProxyEvent.DeviceDiscovered, event);
    }

    /**
     * Install a notification forwarder, replacing any forwarder this connection already has for the
     * characteristic — stacked listeners would deliver every notification to the hub more than once.  Returns the
     * listener so a caller that fails afterwards removes exactly its own.
     */
    #forwardNotifications(
        conn: ConnectionState,
        connectionHandle: number,
        characteristicUuid: string,
        char: Characteristic,
    ): NotificationListener {
        const previous = conn.subscriptions.get(characteristicUuid);
        if (previous) {
            previous.characteristic.removeListener("data", previous.listener);
            // The entry is only restored once the new subscribe succeeds, so a failure cannot leave the map
            // pointing at a listener that no longer receives anything
            conn.subscriptions.delete(characteristicUuid);
        }

        const listener = (data: Buffer) => {
            logger.debug(`[GATT] notify ${characteristicUuid} handle=${connectionHandle} ${data.length} bytes`);
            this.#sendFrame(BinaryFrameOpcode.Notification, connectionHandle, new Uint8Array(data));
        };
        char.on("data", listener);
        return listener;
    }

    // ─── Hub Traffic ─────────────────────────────────────────────────────────

    #receiveFrame(frame: BinaryFrame): void {
        if (frame.opcode !== BinaryFrameOpcode.WriteData) {
            return;
        }

        const conn = this.#connections.get(frame.handle);
        const characteristic = conn?.lastWriteCharacteristic;
        if (!conn || !characteristic) {
            logger.warn(`[←BIN] WriteData: no lastWriteCharacteristic for handle=${frame.handle}`);
            return;
        }

        // Matter BTP writes C1 with an ATT Write Request, so withoutResponse is false
        this.#write(conn, characteristic, Buffer.from(frame.payload), false).catch(error =>
            logger.error("Binary write error:", error),
        );
    }

    #sendEvent(event: BleProxyEventName, data: Record<string, unknown>): void {
        const connection = this.#connection;
        if (!connection?.connected) {
            logger.debug(`Dropping event ${event}, connection is not open`);
            return;
        }
        connection.sendEvent(event, data);
    }

    #sendFrame(opcode: number, connectionHandle: number, payload: Uint8Array): void {
        const connection = this.#connection;
        if (!connection?.connected) {
            logger.debug(`Dropping frame opcode=${opcode} handle=${connectionHandle}, connection is not open`);
            return;
        }
        connection.sendFrame(opcode, connectionHandle, payload);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Perform a GATT write as part of the connection's write chain, so no two writes are ever in flight on the
     * same peripheral.  The returned promise carries the write's own outcome; the chain itself absorbs it.
     */
    #write(conn: ConnectionState, char: Characteristic, data: Buffer, withoutResponse: boolean): Promise<void> {
        const write = conn.writes.then(() => char.writeAsync(data, withoutResponse));
        conn.writes = write.catch(() => {});
        return write;
    }

    #requireConnection(connectionHandle: number): ConnectionState {
        const conn = this.#connections.get(connectionHandle);
        if (!conn) {
            throw new WsProxyCommandError(
                BleProxyErrorCode.NotConnected,
                `No connection with handle ${connectionHandle}`,
            );
        }
        return conn;
    }

    #requireCharacteristic(conn: ConnectionState, uuid: string): Characteristic {
        // Noble keys characteristics dash-free and lowercase; the hub may send the dashed 128-bit form
        const char =
            conn.characteristics.get(uuid) ??
            conn.characteristics.get(uuid.toLowerCase()) ??
            conn.characteristics.get(uuid.toUpperCase().replace(/-/g, "").toLowerCase());
        if (!char) {
            throw new WsProxyCommandError(BleProxyErrorCode.CharacteristicNotFound, `Characteristic ${uuid} not found`);
        }
        return char;
    }
}

export namespace NobleBleProxyClient {
    export interface Options {
        /** WebSocket URL of the hub's BLE proxy endpoint, e.g. `ws://localhost:5580/ble`. */
        serverUrl: string;

        /** Bluetooth adapter to bind, e.g. 0 for hci0.  Linux only; the platform default is used when unset. */
        hciId?: number;

        /** Environment supplying the {@link WebSocketClient}.  Defaults to {@link Environment.default}. */
        environment?: Environment;
    }
}
