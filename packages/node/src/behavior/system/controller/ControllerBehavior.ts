/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { CommissioningDiscovery } from "#behavior/system/controller/discovery/CommissioningDiscovery.js";
import { BasicInformationBehavior } from "#behaviors/basic-information";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { IdentityService } from "#node/server/IdentityService.js";
import {
    ConnectionlessTransportSet,
    Crypto,
    DnsRecordType,
    ImplementationError,
    Logger,
    SharedEnvironmentServices,
} from "@matter/general";
import {
    Ble,
    ClientSubscriptions,
    Fabric,
    FabricAuthority,
    FabricAuthorityConfiguration,
    FabricManager,
    MdnsClient,
    MdnsScannerTargetCriteria,
    MdnsService,
    PeerAddress,
    PeerSet,
    Scanner,
    ScannerSet,
    getFabricQname,
} from "@matter/protocol";
import { CaseAuthenticatedTag, FabricId, FabricIndex, NodeId } from "@matter/types";
import { CommissioningClient } from "../commissioning/CommissioningClient.js";
import { CommissioningServer } from "../commissioning/CommissioningServer.js";
import { NetworkServer } from "../network/NetworkServer.js";
import { ActiveDiscoveries } from "./discovery/ActiveDiscoveries.js";
import type { Discovery } from "./discovery/Discovery.js";

const logger = Logger.get("ControllerBehavior");

/**
 * Node controller functionality.
 *
 * For our purposes, a "controller" is a node that supports commissioning of remote devices.
 *
 * This class initializes components required for controller usage and tracks active discoveries.  Discovery logic
 * resides in {@link Discovery} and commissioning logic in {@link CommissioningClient}.
 */
export class ControllerBehavior extends Behavior {
    static override readonly id = "controller";

    declare internal: ControllerBehavior.Internal;
    declare state: ControllerBehavior.State;

    override async initialize() {
        if (this.state.adminFabricLabel === undefined || this.state.adminFabricLabel === "") {
            throw new ImplementationError("adminFabricLabel must be set for ControllerBehavior");
        }

        const node = Node.forEndpoint(this.endpoint);

        // Configure discovery transports
        if (this.state.ip === undefined) {
            this.state.ip = true;
        }
        if (this.state.ip !== false) {
            this.internal.services = this.env.asDependent();
            this.env.get(ScannerSet).add((await this.internal.services.load(MdnsService)).client);
        }

        if (this.state.ble === undefined) {
            this.state.ble = (await this.agent.load(NetworkServer)).state.ble;
        }
        if (this.state.ble !== false) {
            try {
                this.env.get(ScannerSet).add(this.env.get(Ble).scanner);
            } catch (error) {
                logger.error("Disabling BLE due to initialization error:", error);
                this.state.ble = false;
            }
        }

        // Ensure the fabric authority is fully initialized
        await this.env.load(FabricAuthority);

        // "Automatic" controller mode - disable commissioning if node is not otherwise configured as a commissionable
        // device
        const commissioning = this.agent.get(CommissioningServer);
        if (commissioning.state.enabled === undefined) {
            const totalFabrics = this.env.get(FabricManager).length;
            const controlledFabrics = this.env.get(FabricAuthority).fabrics.length;
            if (controlledFabrics === totalFabrics) {
                commissioning.state.enabled = false;
            }
        }

        this.reactTo(node.lifecycle.online, this.#nodeOnline);
        if (node.lifecycle.isOnline) {
            await this.#nodeOnline();
        }
        this.reactTo(node.lifecycle.goingOffline, this.#nodeGoingOffline);

        // Mark addresses in use (or not) based on known peers
        const identity = this.env.get(IdentityService);
        const peers = this.env.get(PeerSet);
        this.reactTo(peers.added, peer => identity.reservePeerAddress(peer.address));
        this.reactTo(peers.deleted, peer => identity.releasePeerAddress(peer.address));
    }

    /**
     * Allocate a new node address in the given fabric.
     */
    async allocatePeerAddress(fabricIndex: FabricIndex, nodeId?: NodeId) {
        const identity = this.env.get(IdentityService);
        let address: PeerAddress | undefined;

        try {
            // Allocate address in a separate transaction we can commit as soon as it's reserved
            return await this.endpoint.act(async function (agent) {
                const controller = agent.get(ControllerBehavior);

                // Lock early to act as semaphor for address assignment
                await agent.context.transaction.addResources(controller);
                await agent.context.transaction.begin();

                const useSequentialIds = controller.state.nodeIdAssignment !== "random";
                let nextNodeId: NodeId = controller.state.nextNodeId ?? NodeId(1);

                while (nodeId === undefined) {
                    if (useSequentialIds) {
                        nodeId = nextNodeId;
                        nextNodeId++;
                    } else {
                        nodeId = NodeId.randomOperationalNodeId(controller.env.get(Crypto));
                    }
                    if (identity.peerAddressInUse({ fabricIndex, nodeId })) {
                        nodeId = undefined;
                    }
                }

                address = PeerAddress({ fabricIndex, nodeId });

                // Reserve prior to commit.  We then release below if commit fails
                identity.reservePeerAddress(address);

                if (useSequentialIds) {
                    controller.state.nextNodeId = nextNodeId;
                }

                return address;
            });
        } catch (e) {
            // If there's an error but we have an address, ensure it's not allocated
            if (address) {
                identity.releasePeerAddress(address);
            }

            throw e;
        }
    }

    /**
     * Commission a node by discovery criteria from the controller context.
     *
     * This method is intended for ambiguous discovery criteria (for example, the same discriminator on multiple
     * devices).  All discovered candidates are commissioned in parallel; the first success wins.
     */
    commission(options: CommissioningDiscovery.Options, preferredNode?: ClientNode): Promise<ClientNode> {
        return new CommissioningDiscovery(this.endpoint as ServerNode, {
            id: preferredNode?.id,
            ...options,
        });
    }

    override async [Symbol.asyncDispose]() {
        await this.env.close(ActiveDiscoveries);
        this.env.delete(FabricAuthority);
        this.env.delete(ScannerSet);
        await this.internal.services?.close();
    }

    get fabricAuthorityConfig(): FabricAuthorityConfiguration {
        const biState = this.endpoint.stateOf(BasicInformationBehavior);
        return {
            adminVendorId: biState.vendorId,
            ...this.state,
        };
    }

    async #nodeOnline() {
        // Configure network connections
        const netTransports = this.env.get(ConnectionlessTransportSet);
        if (this.state.ble) {
            // no try-catch needed because we already added the scanner in initialize()
            netTransports.add(this.env.get(Ble).centralInterface);
        }

        // Add each pre-existing fabric to discovery criteria and update fabric label if needed
        const authority = this.env.get(FabricAuthority);
        for (const fabric of authority.fabrics) {
            if (fabric.label !== this.state.adminFabricLabel) {
                await fabric.setLabel(this.state.adminFabricLabel);
            }
            this.#enableScanningForFabric(fabric);
        }
        this.reactTo(authority.fabricAdded, this.#enableScanningForFabric);

        // Configure each MDNS scanner with criteria
        const scanners = this.env.get(ScannerSet);
        for (const scanner of scanners) {
            this.#enableScanningForScanner(scanner);
        }
        this.reactTo(scanners.added, this.#enableScanningForScanner);
    }

    async #nodeGoingOffline() {
        await this.env.close(ClientSubscriptions);

        // Configure each MDNS scanner with criteria
        const scanners = this.env.get(ScannerSet);
        for (const scanner of scanners) {
            if (scanner instanceof MdnsClient) {
                scanner.targetCriteriaProviders.delete(this.internal.mdnsTargetCriteria);
            }
        }

        const netTransports = this.env.get(ConnectionlessTransportSet);
        if (this.state.ble) {
            netTransports.delete(this.env.get(Ble).centralInterface);
        }
    }

    #enableScanningForFabric(fabric: Fabric) {
        // Send a one-time wildcard query via DnssdNames so existing operational nodes on this fabric respond and
        // populate IpService for known peers
        if (this.internal.services) {
            const names = this.env.get(MdnsService).names;
            names.solicitor.solicit({
                name: names.get(getFabricQname(fabric.globalId)),
                recordTypes: [DnsRecordType.PTR],
            });
        }
    }

    #enableScanningForScanner(scanner: Scanner) {
        if (!(scanner instanceof MdnsClient)) {
            return;
        }
        scanner.targetCriteriaProviders.add(this.internal.mdnsTargetCriteria);
    }
}

export namespace ControllerBehavior {
    export class Internal {
        /**
         * MDNS scanner criteria for each controlled fabric (keyed by operational ID).
         */
        mdnsTargetCriteria: MdnsScannerTargetCriteria = {
            commissionable: true,
        };

        services?: SharedEnvironmentServices;
    }

    export class State {
        /**
         * Set to false to disable scanning on BLE.
         *
         * By default the controller scans via BLE if BLE is available.
         */
        ble?: boolean = undefined;

        /**
         * Set to false to disable scanning on IP networks.
         *
         * By default the controller always scans on IP networks.
         */
        ip?: boolean = undefined;

        /**
         * Node ID assignment strategy.
         */
        nodeIdAssignment: "sequential" | "random" = "sequential";

        /**
         * Next assigned ID when {@link nodeIdAssignment} is "sequential".
         *
         * matter.js increments this value automatically after allocating a new node ID.  This means that the
         * "sequential" strategy does not reuse IDs from decommissioned nodes.
         *
         * If there is a conflict with an existing ID, matter.js increments this value until it identifies a free ID.
         */
        nextNodeId?: NodeId;

        /**
         * Contains the label of the admin fabric which is set for all commissioned devices
         */
        adminFabricLabel = "matter.js";

        /**
         * Contains the FabricId of the admin fabric when a defined number needs to be used because special Certificates
         * are used.
         * If not provided, a random FabricId will be generated.
         */
        adminFabricId?: FabricId = undefined;

        /**
         * Contains the NodeId of the admin node when a defined number needs to be used because special Certificates
         * are used.
         * If not provided, a random NodeId will be generated.
         */
        adminNodeId?: NodeId = undefined;

        /**
         * Case Authenticated Tags to be used to commission and connect to devices.
         */
        caseAuthenticatedTags?: CaseAuthenticatedTag[] = undefined;
    }
}
