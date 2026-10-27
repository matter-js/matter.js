/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { Discovery } from "#behavior/system/controller/discovery/Discovery.js";
import { ParallelPaseDiscovery } from "#behavior/system/controller/discovery/ParallelPaseDiscovery.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Abort, ChannelType, Diagnostic, Duration, Hours, LogDestination, Logger, LogLevel } from "@matter/general";
import {
    type CommissionableDevice,
    type CommissionableDeviceIdentifiers,
    type Scanner,
    ScannerSet,
} from "@matter/protocol";

export interface FixedScannerOptions {
    /** Called right after the devices were reported. */
    afterReport?: () => void;

    /** Keep scanning after discovery stops, so the scan only ends through {@link FailingScanner#fail}. */
    ignoresStop?: boolean;

    /** End the scan right after reporting, as a scanner does for a query it cannot serve. */
    endsAtOnce?: boolean;
}

/** Reports the given devices once and then keeps scanning until discovery stops. */
export class FixedScanner implements Scanner {
    readonly type = ChannelType.UDP;

    constructor(
        readonly devices: CommissionableDevice[],
        readonly options: FixedScannerOptions = {},
    ) {}

    async findCommissionableDevicesContinuously(
        _identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        _timeout?: unknown,
        cancelSignal?: Promise<void>,
    ) {
        for (const device of this.devices) {
            callback({ ...device });
        }
        this.options.afterReport?.();
        if (this.options.endsAtOnce) {
            return this.devices;
        }
        await (this.options.ignoresStop ? new Promise<void>(() => {}) : cancelSignal);
        return this.devices;
    }

    getDiscoveredCommissionableDevices() {
        return this.devices;
    }

    cancelCommissionableDeviceDiscovery() {}

    async close() {}
}

/** Delegates to another scanner until {@link fail} makes its scan reject. */
export class FailingScanner implements Scanner {
    readonly type: ChannelType;
    #fail!: (error: Error) => void;
    readonly #failed = new Promise<never>((_resolve, reject) => (this.#fail = reject));

    constructor(readonly inner: Scanner) {
        this.type = inner.type;
    }

    fail(error: Error) {
        this.#fail(error);
    }

    async findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeout?: Duration,
        cancelSignal?: Promise<void>,
    ) {
        return await Promise.race([
            this.inner.findCommissionableDevicesContinuously(identifier, callback, timeout, cancelSignal),
            this.#failed,
        ]);
    }

    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers) {
        return this.inner.getDiscoveredCommissionableDevices(identifier);
    }

    cancelCommissionableDeviceDiscovery(identifier: CommissionableDeviceIdentifiers, resolvePromise?: boolean) {
        this.inner.cancelCommissionableDeviceDiscovery(identifier, resolvePromise);
    }

    async close() {}
}

export const DEVICE: CommissionableDevice = {
    deviceIdentifier: "device-a",
    D: 1000,
    CM: 1,
    addresses: [{ type: "udp", ip: "fe80::1", port: 5540 }],
};

export const DEVICE_B: CommissionableDevice = { ...DEVICE, deviceIdentifier: "device-b" };

export const DEVICE_C: CommissionableDevice = { ...DEVICE, deviceIdentifier: "device-c" };

/**
 * One attempt of a {@link TestDiscovery}.  `winOnPase` is the race gate a real attempt calls once PASE is up, `signal`
 * the discovery's abort signal and `index` the attempt's position in discovery order.
 */
export type TestAttempt = (winOnPase: () => boolean, signal: AbortSignal, index: number) => Promise<void>;

/** A parallel PASE discovery whose attempts are supplied by the test; the winner's result is its node. */
export class TestDiscovery extends ParallelPaseDiscovery<ClientNode> {
    /** The number of devices handed to the discovery. */
    discovered = 0;

    /** The number of attempts that started. */
    started = 0;

    /** Resolves once the discovery aborts its attempts. */
    readonly aborting = new Promise<void>(resolve => {
        this.abortSignal.addEventListener("abort", () => resolve(), { once: true });
    });

    constructor(
        owner: ServerNode,
        options: Discovery.Options,
        readonly attempt: TestAttempt,
    ) {
        super(owner, options);
    }

    protected override get cleanupLabel() {
        return "Test candidate cleanup";
    }

    protected override get failureMessage() {
        return "No attempt succeeded";
    }

    protected override onDiscovered(node: ClientNode) {
        const index = this.discovered++;
        this.registerAttempt(
            winOnPase => {
                this.started++;
                return this.attempt(winOnPase, this.abortSignal, index);
            },
            () => node,
        );
    }
}

/** Waits until the signal aborts, then rejects with the abort like a real abortable operation. */
export async function untilAborted(signal: AbortSignal) {
    await Abort.sleep("test attempt", signal, Hours(1));
    signal.throwIfAborted();
}

/** Installs a controller on the node with the given scanners as the only ones. */
export async function configureScanners(node: ServerNode, ...scanners: Scanner[]) {
    node.behaviors.require(ControllerBehavior);
    await node.act(agent => agent.load(ControllerBehavior));

    const set = node.env.get(ScannerSet);
    set.clear();
    for (const scanner of scanners) {
        set.add(scanner);
    }
}

/** Installs a controller on the node whose only scanner reports the given devices. */
export async function configure(node: ServerNode, devices: CommissionableDevice[], options?: FixedScannerOptions) {
    const scanner = new FailingScanner(new FixedScanner(devices, options));
    await configureScanners(node, scanner);
    return scanner;
}

/** Settles to `undefined` on success and to the error on failure. */
export function settle(discovery: PromiseLike<unknown>) {
    return discovery.then(
        () => undefined,
        (error: unknown) => error,
    );
}

export function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => (resolve = r));
    return { promise, resolve };
}

export interface CapturedLog {
    level: LogLevel;
    text: string;
}

/** Captures the messages of the "Discovery" log facility until disposed. */
export function captureDiscoveryLog() {
    const messages = new Array<CapturedLog>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "Discovery") {
                messages.push({ level: message.level, text: message.values.map(value => String(value)).join(" ") });
            }
        },
    });
    return {
        messages,
        [Symbol.dispose]() {
            delete Logger.destinations.capture;
        },
    };
}
