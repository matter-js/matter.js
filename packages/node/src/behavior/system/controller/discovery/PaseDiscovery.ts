/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Duration, MatterAggregateError, ServerAddress } from "@matter/general";
import { ControllerCommissioner, EstablishPaseOptions, EstablishPaseResult, NodeSession } from "@matter/protocol";
import { Discovery } from "./Discovery.js";
import { DiscoveryError } from "./DiscoveryError.js";

/**
 * Discovers commissionable devices and establishes a PASE session with the first one that responds.
 *
 * All discovered candidates attempt PASE in parallel; the first to succeed wins.  Discovery stops at PASE
 * time and the abort signal fires to cancel remaining in-flight PASE attempts.  Any candidate that
 * establishes PASE after the winner cleans up its session cleanly.  {@link onComplete} returns the winning
 * {@link NodeSession}.
 *
 * This is the discovery counterpart to {@link CommissioningDiscovery}: whereas that class performs a full
 * commissioning flow, this class stops at PASE and returns the raw session for callers that manage their own
 * commissioning (e.g. split-commissioning scenarios or raw PASE channel establishment for chip-testing).
 */
export class PaseDiscovery extends Discovery<NodeSession> {
    #options: PaseDiscovery.Options;
    #timeout?: Duration;
    #winner?: NodeSession;
    #winnerPromise?: Promise<unknown>;
    #paseWon = false;
    #pending = new Set<Promise<EstablishPaseResult | undefined>>();
    #abort = new AbortController();

    constructor(owner: ServerNode, options: PaseDiscovery.Options) {
        super(owner, options);
        this.#options = options;
        // Store timeout explicitly since TypeScript cannot resolve it through the
        // CommissionableDeviceIdentifiers union intersection in Discovery.Options.
        this.#timeout = (options as { timeout?: Duration }).timeout;
    }

    protected override onDiscovered(node: ClientNode) {
        if (this.#paseWon) {
            // PASE already won by another candidate; ignore this node.
            return;
        }

        // Track by reference so the continueAfterPase closure can promote this attempt to #winnerPromise.
        // This works because the callback is always invoked asynchronously (after PASE establishes), well
        // after the synchronous assignment of `attempt` below.
        let attempt: Promise<EstablishPaseResult | undefined>;

        // Launch PASE for this candidate.
        //
        // continueAfterPase is the atomic PASE-time race gate:
        //  - First caller: sets #paseWon, stops discovery, fires abort (cancels all other PASE attempts),
        //    promotes this attempt from #pending to #winnerPromise, returns true.
        //  - Any later caller (another candidate that established PASE after the winner): returns false;
        //    ControllerCommissioner closes its PASE session cleanly.
        attempt = Promise.resolve(
            node.act("establish-pase", agent => {
                const addresses = agent.commissioning.state.addresses;
                if (!addresses?.length) {
                    return;
                }
                const commissioner = node.env.get(ControllerCommissioner);
                const establishOptions: EstablishPaseOptions = {
                    addresses: addresses.map(ServerAddress),
                    discoveryData: agent.commissioning.descriptor,
                    passcode: this.#options.passcode,
                    timeout: this.#timeout,
                    abort: this.#abort.signal,
                    continueAfterPase: () => {
                        if (this.#paseWon) {
                            // Another candidate already won PASE; decline.
                            return false;
                        }
                        this.#paseWon = true;
                        // Stop discovery immediately — no point scanning further.
                        this.stop();
                        // Cancel all other in-flight PASE attempts.
                        this.#abort.abort();
                        // Promote this attempt from the loser pool to dedicated winner tracking.
                        this.#pending.delete(attempt);
                        this.#winnerPromise = attempt.then(result => {
                            this.#winner = result?.paseSession;
                        });
                        return true;
                    },
                };
                return commissioner.establishPase(establishOptions);
            }),
        ).finally(() => {
            // Clean up: remove from pending (no-op if already promoted to #winnerPromise).
            this.#pending.delete(attempt);
        });

        this.#pending.add(attempt);
    }

    protected override async onComplete(): Promise<NodeSession> {
        if (!this.#paseWon) {
            // Discovery ended without any candidate winning PASE — cancel any remaining attempts.
            this.#abort.abort();
        }

        try {
            // Await winner's PASE session establishment.
            await this.#winnerPromise;
        } finally {
            // Await loser cleanup (canceled PASE sessions, etc.) and absorb errors — these are expected
            // side effects of the race and are not relevant to the caller.
            await MatterAggregateError.allSettled([...this.#pending], "PASE candidate cleanup").catch(() => {});
        }

        if (this.#winner === undefined) {
            throw new DiscoveryError(`${this} failed: No PASE session could be established`);
        }

        return this.#winner;
    }
}

export namespace PaseDiscovery {
    export type Options = Discovery.InstanceOptions & {
        /** PASE passcode for the device. */
        passcode: number;
    };
}
