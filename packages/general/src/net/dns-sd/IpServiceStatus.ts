/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import { AbortedError } from "#MatterError.js";
import { ServerAddress } from "#net/ServerAddress.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { Abort } from "#util/Abort.js";
import { asError } from "#util/Error.js";
import { BasicSet } from "#util/Set.js";
import type { IpService } from "./IpService.js";
import { IpServiceResolution } from "./IpServiceResolution.js";

const logger = Logger.get("IpServiceStatus");

/**
 * Tracks status of an {@link IpService}, logs state changes and manages service discovery.
 */
export class IpServiceStatus {
    #service: IpService;
    #isReachable = false;
    #connecting = new BasicSet<PromiseLike<boolean>>();
    #resolveAbort?: Abort;
    #resolving?: Promise<void>;
    #connectionInitiatedAt?: Timestamp;
    #lastReceiptAt?: Timestamp;

    constructor(service: IpService) {
        this.#service = service;
    }

    async close() {
        this.#stopResolving();
        if (this.#resolving) {
            await this.#resolving;
        }
    }

    /**
     * Is the service actively connecting?
     *
     * This is true so long as a promise passed to {@link connecting} is unresolved.
     */
    get isConnecting() {
        return this.#connecting.size > 0;
    }

    /**
     * Is the service currently reachable?
     *
     * This value is writable.  If you set {@link isReachable} to false and {@link isConnecting} is true, the service
     * enters discovery mode and begins active solicitation so long as neither condition changes.
     *
     * The service sets {@link isReachable} to true automatically if:
     *
     * - It discovers a new (previously unknown) address, or
     *
     * - The input promise to {@link connecting} resolves to true
     *
     * The service sets {@link isReachable} to false automatically if the input promise to {@link connecting} resolves
     * to false.
     */
    get isReachable() {
        return this.#isReachable;
    }

    /**
     * Are we actively performing MDNS discovery for the service?
     */
    get isResolving() {
        return this.#resolving !== undefined;
    }

    set isReachable(isReachable: boolean) {
        if (this.#isReachable === isReachable) {
            return;
        }

        this.#isReachable = isReachable;

        if (isReachable) {
            this.#maybeStopResolving();
        } else {
            this.#maybeStartResolving();
        }
    }

    get lastReceiptAt(): Timestamp | undefined {
        return this.#lastReceiptAt;
    }

    set lastReceiptAt(time: Timestamp) {
        this.#lastReceiptAt = time;
    }

    get connectionInitiatedAt() {
        return this.#connectionInitiatedAt;
    }

    /**
     * Register a new connection attempt.
     *
     * If {@link result} resolves as true the service is marked as reachable.  If {@link result} resolves as false
     * reachability is not modified.
     *
     * If {@link result} throws an error other than {@link AbortedError}, the service is marked as unreachable and if
     * the error logged.
     *
     * {@link isConnecting} will be true until {@link result} resolves.
     */
    connecting(result: PromiseLike<boolean>) {
        logger.debug(this.#service.via, "Connecting");

        result.then(
            returned => {
                this.#connecting.delete(result);

                if (!this.#connecting.size) {
                    this.#connectionInitiatedAt = undefined;
                }

                if (returned) {
                    this.isReachable = true;

                    logger.info(this.#service.via, "Connected");
                } else {
                    logger.debug(this.#service.via, "Connect attempt aborted");
                }

                this.#maybeStopResolving();
            },

            error => {
                this.#connecting.delete(result);

                if (!(error instanceof AbortedError)) {
                    return;
                }

                logger.error(this.#service.via, "Connection error:", asError(error));

                this.#isReachable = false;

                this.#maybeStartResolving();
            },
        );

        if (!this.#connecting.size) {
            this.#connectionInitiatedAt = Time.nowMs;
        }
        this.#connecting.add(result);

        this.#maybeStartResolving();
    }

    #maybeStartResolving() {
        if (this.#isReachable || !this.isConnecting || this.#resolveAbort) {
            return;
        }

        const numAddresses = this.#service.addresses.size;

        let why;

        switch (numAddresses) {
            case 0:
                why = "need address";
                break;

            case 1:
                why = "address is unreachable";
                break;

            default:
                why = `${numAddresses} known addresses are unreachable`;
        }

        logger.info(this.#service.via, "Resolving", Diagnostic.weak(`(${why})`));

        this.#resolveAbort = new Abort();
        this.#resolving = IpServiceResolution(this.#service, this.#resolveAbort).finally(() => {
            if (this.#resolveAbort?.aborted === false) {
                const addresses = [...this.#service.addresses].map(ServerAddress.urlFor);
                logger.debug(this.#service.via, `Resolved as ${addresses.join(", ")}`);
            }
            this.#resolveAbort?.close();
            this.#resolveAbort = undefined;
            this.#resolving = undefined;
        });
    }

    #maybeStopResolving() {
        if (!this.#isReachable || this.isConnecting || !this.#resolveAbort) {
            return;
        }

        this.#stopResolving();
    }

    #stopResolving() {
        if (!this.#resolveAbort) {
            return;
        }

        this.#resolveAbort();

        logger.debug(this.#service.via, "Stopped resolving");
    }
}
