/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { PairRetransmissionLimitReachedError } from "#peer/ControllerDiscovery.js";
import { NodeSession } from "#session/NodeSession.js";
import {
    Abort,
    asError,
    causedBy,
    Duration,
    Logger,
    Millis,
    NoResponseTimeoutError,
    ServerAddress,
    UnexpectedDataError,
} from "@matter/general";
import { CommissioningConnectionPool } from "./CommissioningConnectionPool.js";
import { TransientPeerCommunicationError } from "./PeerCommunicationError.js";

const logger = Logger.get("CommissioningConnection");

export class CommissioningConnection {
    readonly #pool: CommissioningConnectionPool;

    constructor(private readonly options: CommissioningConnection.Options) {
        this.#pool = new CommissioningConnectionPool(options.devices);
    }

    async connect() {
        using abort = new Abort({ timeout: this.options.timeout });
        let lastRetryableError: Error | undefined;

        for await (const candidate of this.#pool.attempts({
            refresh: () => abort.attempt(this.options.discoveredDevices()),
            shouldStop: () => abort.aborted,
            waitForCandidates: () => Abort.sleep("wait for discovered commissioning candidates", abort, Millis(200)),
        })) {
            try {
                const session = await abort.attempt(this.options.establishSession(candidate.address, candidate.device));
                return { session, discoveryData: candidate.device };
            } catch (error) {
                const asErr = asError(error);

                if (causedBy(asErr, UnexpectedDataError)) {
                    logger.info(
                        `Dropping candidate ${candidate.device.deviceIdentifier} on ${ServerAddress.urlFor(candidate.address)} because of invalid credentials`,
                    );
                    this.#pool.markInvalidCredentials(candidate.deviceKey);
                    continue;
                }

                if (this.#isRetryableNetworkError(asErr)) {
                    lastRetryableError = asErr;
                    logger.warn(
                        `Address ${ServerAddress.urlFor(candidate.address)} failed for candidate ${
                            candidate.device.deviceIdentifier
                        } due to network/timeout, trying next address/device`,
                    );
                    this.#pool.markAddressFailure(candidate.deviceKey, candidate.address);
                    continue;
                }

                throw error;
            }
        }

        if (abort.aborted) {
            throw new PairRetransmissionLimitReachedError("Failed to connect on any discovered server before timeout");
        }
        if (lastRetryableError !== undefined) {
            throw new PairRetransmissionLimitReachedError(
                `Failed to connect on any discovered server: ${lastRetryableError.message}`,
            );
        }
        throw new PairRetransmissionLimitReachedError("Failed to connect on any discovered server");
    }

    #isRetryableNetworkError(error: Error) {
        return causedBy(error, NoResponseTimeoutError, TransientPeerCommunicationError);
    }
}

export namespace CommissioningConnection {
    export interface Options {
        devices: CommissionableDevice[];
        timeout: Duration;
        discoveredDevices: () => Promise<CommissionableDevice[]>;
        establishSession: (address: ServerAddress, device: CommissionableDevice) => Promise<NodeSession>;
    }
}
