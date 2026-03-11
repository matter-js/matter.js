/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ChannelType, Seconds } from "@matter/general";
import { Discovery } from "./Discovery.js";
import { ParallelPaseDiscovery } from "./ParallelPaseDiscovery.js";

/**
 * Discovers and commissions nodes.  All discovered candidates are commissioned in parallel; the first to establish
 * PASE wins.  Discovery is stopped at PASE time and the abort signal fires to cancel remaining in-flight PASE
 * attempts.  Any candidate that establishes PASE after the winner cleans up its session without proceeding to
 * commissioning.  {@link onComplete} awaits the winner's commissioning to finish before returning.
 */
export class CommissioningDiscovery extends ParallelPaseDiscovery<ClientNode> {
    #options: CommissioningDiscovery.Options;

    constructor(owner: ServerNode, options: CommissioningDiscovery.Options) {
        const opts = CommissioningClient.PasscodeOptions(options);

        const { discriminator } = opts;
        if (discriminator !== undefined) {
            options = { ...options, longDiscriminator: discriminator };
        }

        // Default discovery timeout matches the old discoverAndEstablishPase default.
        if (options.timeout === undefined) {
            options = { ...options, timeout: Seconds(30) };
        }

        // Map discoveryCapabilities to a scannerFilter so BLE scanners are included when requested.
        // This ensures callers that pass discoveryCapabilities (e.g. MatterController) get the correct
        // scanner selection without having to construct the filter themselves.
        if (options.discoveryCapabilities !== undefined && options.scannerFilter === undefined) {
            const caps = options.discoveryCapabilities;
            options = {
                ...options,
                scannerFilter: s => s.type === ChannelType.UDP || (!!caps.ble && s.type === ChannelType.BLE),
            };
        }

        super(owner, options);

        this.#options = options;
    }

    protected override get cleanupLabel() {
        return "Commissioning candidate cleanup";
    }

    protected override get failureMessage() {
        return "No device could be commissioned";
    }

    protected override onDiscovered(node: ClientNode) {
        if (this.paseWon) return;

        this.registerAttempt(
            winOnPase =>
                node.act("commission", agent =>
                    agent.commissioning.commission({
                        ...this.#options,
                        abort: this.abortSignal,
                        continueCommissioningAfterPase: winOnPase,
                    }),
                ),
            () => node,
        );
    }
}

export namespace CommissioningDiscovery {
    export type Options = Discovery.InstanceOptions & CommissioningClient.CommissioningOptions;
}
