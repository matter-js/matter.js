/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { MatterAggregateError } from "@matter/general";
import { Discovery } from "./Discovery.js";
import { DiscoveryError } from "./DiscoveryError.js";

/**
 * Discovers and commissions nodes.  All discovered candidates are commissioned in parallel; the first to establish
 * PASE wins.  Discovery is stopped at PASE time and the abort signal fires to cancel remaining in-flight PASE
 * attempts.  Any candidate that establishes PASE after the winner cleans up its session without proceeding to
 * commissioning.  {@link onComplete} awaits the winner's commissioning to finish before returning.
 */
export class CommissioningDiscovery extends Discovery<ClientNode> {
    #options: CommissioningDiscovery.Options;
    #winner?: ClientNode;
    #winnerPromise?: Promise<unknown>;
    #paseWon = false;
    #pending = new Set<Promise<unknown>>();
    #abort = new AbortController();

    constructor(owner: ServerNode, options: CommissioningDiscovery.Options) {
        const opts = CommissioningClient.PasscodeOptions(options);

        const { discriminator } = opts;
        if (discriminator !== undefined) {
            options = { ...options, longDiscriminator: discriminator };
        }

        super(owner, options);

        this.#options = options;
    }

    protected override onDiscovered(node: ClientNode) {
        if (this.#paseWon) {
            // PASE already won by another candidate; ignore this node.
            return;
        }

        // Track by reference so the continueCommissioningAfterPase closure can promote this attempt to #winnerPromise.
        // This works because the callback is always invoked asynchronously (after PASE establishes), well after the
        // synchronous assignment of `attempt` below.
        let attempt: Promise<unknown>;

        // Launch commissioning for this candidate.
        //
        // continueCommissioningAfterPase is the atomic PASE-time race gate:
        //  - First caller: sets #paseWon, stops discovery, fires abort (cancels all other PASE attempts),
        //    promotes this attempt from #pending to #winnerPromise, returns true.
        //  - Any later caller (another candidate that established PASE after the winner): returns false;
        //    ControllerCommissioner closes its PASE session cleanly.
        attempt = Promise.resolve(
            node.act("commission", agent =>
                agent.commissioning.commission({
                    ...this.#options,
                    abort: this.#abort.signal,
                    continueCommissioningAfterPase: () => {
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
                        this.#winnerPromise = attempt.then(() => {
                            this.#winner = node;
                        });
                        return true;
                    },
                }),
            ),
        ).finally(() => {
            // Clean up: remove from pending (no-op if already promoted to #winnerPromise).
            this.#pending.delete(attempt);
        });

        this.#pending.add(attempt);
    }

    protected override async onComplete(): Promise<ClientNode> {
        if (!this.#paseWon) {
            // Discovery ended without any candidate winning PASE — cancel any remaining attempts.
            this.#abort.abort();
        }

        try {
            // Await winner's commissioning.  Any error here is meaningful and propagates to the caller.
            await this.#winnerPromise;
        } finally {
            // Await loser cleanup (canceled PASE sessions, etc.) and absorb errors — these are expected
            // side effects of the race and are not relevant to the caller.  Runs in finally so cleanup
            // is not skipped if the winner's commissioning itself throws.
            await MatterAggregateError.allSettled([...this.#pending], "Commissioning candidate cleanup").catch(
                () => {},
            );
        }

        if (this.#winner === undefined) {
            throw new DiscoveryError(`${this} failed: No device could be commissioned`);
        }

        return this.#winner;
    }
}

export namespace CommissioningDiscovery {
    export type Options = Discovery.InstanceOptions & CommissioningClient.CommissioningOptions;
}
