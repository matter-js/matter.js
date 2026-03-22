/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DnsRecord } from "#codec/DnsCodec.js";
import { Diagnostic } from "#log/Diagnostic.js";
import type { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";
import { CancelablePromise } from "#util/Cancelable.js";
import { ObserverGroup } from "#util/Observable.js";
import { MaybePromise } from "#util/Promises.js";
import type { DnssdName } from "./DnssdName.js";
import type { DnssdNames } from "./DnssdNames.js";
import { IpService } from "./IpService.js";

/**
 * A service instance discovered via DNS-SD.
 */
export interface DiscoveredService {
    /** Full instance qname, e.g. "MyBorderRouter._meshcop._udp.local" */
    instanceName: string;

    /** Service type without ".local", e.g. "_meshcop._udp" */
    serviceType: string;

    /** Resolved IP addresses, port, and TXT parameters for this instance */
    ipService: IpService;
}

/**
 * Discovers DNS-SD service instances of a given service type.
 *
 * Extend this class and implement {@link onDiscovered} and {@link onComplete} to collect results.
 * The discovery is a {@link CancelablePromise} that resolves when stopped or timed out.
 *
 * Example:
 * ```typescript
 * class MyDiscovery extends ServiceDiscovery<MyService[]> {
 *     #found: MyService[] = [];
 *
 *     constructor(names: DnssdNames) {
 *         super(names, "_myservice._tcp", { timeout: Duration.seconds(5) });
 *     }
 *
 *     protected onDiscovered(service: DiscoveredService) {
 *         this.#found.push(parseMyService(service));
 *     }
 *
 *     protected onComplete() { return this.#found; }
 * }
 * const results = await new MyDiscovery(mdnsService.names);
 * ```
 */
export abstract class ServiceDiscovery<T> extends CancelablePromise<T> {
    readonly #names: DnssdNames;
    readonly #serviceType: string;
    readonly #filter: (record: DnsRecord) => boolean;
    readonly #observers = new ObserverGroup();
    readonly #ipServices = new Map<string, IpService>();
    #isStopped = false;
    #resolve!: (value: T) => void;
    #reject!: (cause?: unknown) => void;
    #timeout?: Timer;

    constructor(names: DnssdNames, serviceType: string, options?: ServiceDiscovery.Options) {
        let resolve!: (value: T) => void;
        let reject!: (cause?: unknown) => void;
        super((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this.#resolve = resolve;
        this.#reject = reject;
        this.#names = names;
        this.#serviceType = serviceType.toLowerCase().replace(/\.local$/, "");

        // Accept records whose name matches the service type or is an instance of it
        const suffix = `.${this.#serviceType}.local`;
        const exactType = `${this.#serviceType}.local`;
        this.#filter = (record: DnsRecord) => {
            const lower = record.name.toLowerCase();
            return lower === exactType || lower.endsWith(suffix);
        };

        names.addFilter(this.#filter);
        this.#observers.on(names.discovered, this.#onDiscovered.bind(this));

        if (options?.timeout !== undefined) {
            this.#timeout = Time.getTimer("service-discovery timeout", options.timeout, () => this.stop()).start();
        }
    }

    /**
     * Called when a new service instance is discovered.
     */
    protected abstract onDiscovered(service: DiscoveredService): void;

    /**
     * Called when discovery completes (after stop() or timeout). Return the final result.
     */
    protected abstract onComplete(): MaybePromise<T>;

    /**
     * Stop discovery and resolve the promise with the result of {@link onComplete}.
     */
    stop() {
        if (this.#isStopped) {
            return;
        }
        this.#isStopped = true;

        if (this.#timeout !== undefined) {
            this.#timeout.stop();
            this.#timeout = undefined;
        }

        let result: MaybePromise<T>;
        try {
            result = this.onComplete();
        } catch (e) {
            this.#cleanup();
            this.#reject(e);
            return;
        }

        if (MaybePromise.is(result)) {
            result.then(
                value => {
                    this.#cleanup();
                    this.#resolve(value);
                },
                error => {
                    this.#cleanup();
                    this.#reject(error);
                },
            );
        } else {
            this.#cleanup();
            this.#resolve(result);
        }
    }

    protected override onCancel(reason: Error) {
        this.#isStopped = true;
        this.#timeout?.stop();
        this.#timeout = undefined;
        this.#cleanup();
        this.#reject(reason);
    }

    #onDiscovered(name: DnssdName) {
        if (this.#isStopped) {
            return;
        }

        const lower = name.qname.toLowerCase();
        const suffix = `.${this.#serviceType}.local`;

        // Only process instance names (those with a prefix label before the service type)
        if (!lower.endsWith(suffix)) {
            return;
        }

        if (this.#ipServices.has(lower)) {
            return;
        }

        const ipService = new IpService(name.qname, Diagnostic.via("service-discovery"), this.#names);
        this.#ipServices.set(lower, ipService);

        this.onDiscovered({
            instanceName: name.qname,
            serviceType: this.#serviceType,
            ipService,
        });
    }

    #cleanup() {
        this.#names.removeFilter(this.#filter);
        this.#observers.close();
        for (const svc of this.#ipServices.values()) {
            void svc.close();
        }
        this.#ipServices.clear();
    }
}

export namespace ServiceDiscovery {
    export interface Options {
        /**
         * Stop discovery after this duration and resolve with whatever was found.
         * {@link Duration} is in milliseconds.
         */
        timeout?: Duration;
    }
}
