/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ChannelType, Logger, Minutes } from "@matter/general";
import { Discovery } from "./Discovery.js";
import { ParallelPaseDiscovery } from "./ParallelPaseDiscovery.js";

const logger = Logger.get("CommissioningDiscovery");

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

        // Default discovery timeout matches the spec minimum commissioning window (3 minutes).
        // Devices that need factory reset, BLE→WiFi transition, or Thread joining can take 2+ minutes
        // before they start mDNS advertising.
        if (options.timeout === undefined) {
            options = { ...options, timeout: Minutes(3) };
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

        if (!this.#namesThisDevice(node)) {
            return;
        }

        const peers = this.owner.peers;
        this.registerAttempt(
            winOnPase =>
                peers.runCommissioning(node, () =>
                    node.act("commission", agent =>
                        agent.commissioning.commission({
                            ...this.#options,
                            abort: this.abortSignal,
                            continueCommissioningAfterPase: winOnPase,
                        }),
                    ),
                ),
            () => node,
        );
    }

    #namesThisDevice(node: ClientNode) {
        const { vendorId, productId } = CommissioningClient.PasscodeOptions(this.#options);
        const mismatch = CommissioningDiscovery.identityMismatch({ vendorId, productId }, node.state.commissioning);

        if (mismatch !== undefined) {
            logger.info(`Passing over ${node}: ${mismatch}`);
            return false;
        }

        return true;
    }
}

export namespace CommissioningDiscovery {
    export type Options = Discovery.InstanceOptions & CommissioningClient.CommissioningOptions;

    /** What an onboarding payload and a commissionable advertisement each say about a device's identity. */
    export interface Identity {
        vendorId?: number;
        productId?: number;
    }

    /**
     * Why `advertised` is not the device `payload` names, or `undefined` if it may be.
     *
     * Discovery browses one DNS-SD sub-service, so a discriminator is all it can narrow by; the vendor
     * and product a payload names are checked against what the device advertises (§ 4.3.1's `VP`
     * record) once it is found. Either side may say nothing — a manual pairing code carries no identity
     * in its 11-digit form and the record is optional — and absence never rejects, so this only ever
     * refuses a device that positively advertises something else.
     *
     * Zero is "not stated" on either side, not a value to match: a QR payload always carries both
     * fields and says nothing by setting them to zero (§ 2.5.2, § 2.5.3), which is also the only form
     * in which a payload may name a product of zero at all. Mirrors CHIP's
     * `SetUpCodePairer::NodeMatchesCurrentFilter`, whose `kNotAvailable` is zero.
     */
    export function identityMismatch(payload: Identity, advertised: Identity) {
        if (stated(payload.vendorId) && stated(advertised.vendorId) && payload.vendorId !== advertised.vendorId) {
            return `it advertises vendor ${advertised.vendorId} where the onboarding payload names ${payload.vendorId}`;
        }

        if (stated(payload.productId) && stated(advertised.productId) && payload.productId !== advertised.productId) {
            return `it advertises product ${advertised.productId} where the onboarding payload names ${payload.productId}`;
        }

        return undefined;
    }

    function stated(id?: number): id is number {
        return id !== undefined && id !== 0;
    }
}
