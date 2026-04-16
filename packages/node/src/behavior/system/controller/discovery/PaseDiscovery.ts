/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ServerAddress } from "@matter/general";
import { ControllerCommissioner, EstablishPaseOptions, EstablishPaseResult, NodeSession } from "@matter/protocol";
import { Discovery } from "./Discovery.js";
import { ParallelPaseDiscovery } from "./ParallelPaseDiscovery.js";

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
export class PaseDiscovery extends ParallelPaseDiscovery<NodeSession> {
    #options: PaseDiscovery.Options;

    constructor(owner: ServerNode, options: PaseDiscovery.Options) {
        super(owner, options);
        this.#options = options;
    }

    protected override get cleanupLabel() {
        return "PASE candidate cleanup";
    }

    protected override get failureMessage() {
        return "No PASE session could be established";
    }

    protected override onDiscovered(node: ClientNode) {
        if (this.paseWon) return;

        this.registerAttempt<EstablishPaseResult | undefined>(
            winOnPase =>
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
                        timeout: (this.#options as Discovery.InstanceOptions).timeout,
                        abort: this.abortSignal,
                        continueAfterPase: winOnPase,
                    };
                    return commissioner.establishPase(establishOptions);
                }),
            result => result?.paseSession,
        );
    }
}

export namespace PaseDiscovery {
    export type Options = Discovery.InstanceOptions & {
        /** PASE passcode for the device. */
        passcode: number;
    };
}
