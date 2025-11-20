/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkCommissioningBehavior } from "#behaviors/network-commissioning";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Immutable, Lifecycle, UnsupportedDependencyError } from "#general";
import type { ServerNode } from "#node/ServerNode.js";
import { FabricManager, FailsafeContext } from "#protocol";

/**
 * {@link FailsafeContext} for {@link ServerNode} API.
 */
export class ServerNodeFailsafeContext extends FailsafeContext {
    #node: ServerNode;
    #storedState?: {
        networks: Map<Endpoint, Immutable<NetworkCommissioningBehavior.State["networks"]>>;
        /*

        When Fabrics are no longer managed centrally in FabricManager we need this. Maybe we change to this later,
        but now it is just here for reference because these changes are realized by events that are triggered by Fabric
        object changes. See also other commented out sections in this class.

        nocs: OperationalCredentialsBehavior.State["nocs"];
        fabrics: OperationalCredentialsBehavior.State["fabrics"];
        trustedRootCertificates: OperationalCredentialsBehavior.State["trustedRootCertificates"];

         */
    };

    constructor(node: ServerNode, options: FailsafeContext.Options) {
        super(options);
        this.#node = node;
        this.#node.env.set(FailsafeContext, this);
        this.construction.change.on(status => {
            if (status === Lifecycle.Status.Destroyed) {
                this.#node.env.delete(FailsafeContext, this);
            }
        });
    }

    /**
     * Persist endpoint credentials and network configurations for restoration if commissioning does not complete.
     *
     * The Matter 1.2 specification makes it pretty clear that Matter supports configuration of multiple network
     * interfaces (e.g. @see {@link MatterSpecification.v11.Core} § 11.8.8 and § 2.3.2).
     * {@link NetworkCommissioningCluster} of the primary interface is on the root endpoint.  However it's not clear
     * where {@link NetworkCommissioningCluster} instances for secondary interfaces reside.  To be on the safe side
     * we just assume any endpoint may support {@link NetworkCommissioningCluster}.
     *
     * TODO - it's recommended to reset all state if commissioning bails; currently we perform mandatory restore
     */
    override async storeEndpointState() {
        this.#storedState = {
            networks: new Map(),
        };

        if (!this.#node.behaviors.has(NetworkCommissioningBehavior)) {
            return;
        }

        this.#node.visit(endpoint => {
            if (endpoint.behaviors.has(NetworkCommissioningBehavior)) {
                this.#storedState?.networks.set(endpoint, endpoint.stateOf(NetworkCommissioningBehavior).networks);
            }
        });
    }

    override async restoreNetworkState() {
        await this.#node.act(this.restoreNetworkState.name, async agent => {
            const context = agent.context;

            await this.#node.visit(async endpoint => {
                const networks = this.#storedState?.networks.get(endpoint);
                if (networks) {
                    endpoint.agentFor(context).get(NetworkCommissioningBehavior).state.networks = [...networks];
                }
            });
        });
    }

    override async restoreBreadcrumb() {
        await this.#node.act(this.restoreBreadcrumb.name, async agent => {
            const tx = agent.context.transaction;
            await tx.addResources(agent.generalCommissioning);
            await tx.begin();
            agent.generalCommissioning.state.breadcrumb = 0;
        });
    }

    override async rollback() {
        if (!this.fabricIndex && this.hasRootCert) {
            // Update the fabric details if needed (like Trusted Root certificates) Only if fabric was not added because
            // else all data gets updated anyway
            try {
                const fabricManager = this.#node.env.get(FabricManager);
                fabricManager.events.failsafeClosed.emit();
            } catch (error) {
                // UnsupportedDependencyError can happen when the node closes. Then data are refreshed on next start
                // anyway, so ignore this case
                UnsupportedDependencyError.accept(error);
            }
        }

        return super.rollback();
    }

    /*
    override async restoreFabric() {
        await super.restoreFabric();
        await this.#restoreOperationalCredentials();
    }

    async #restoreOperationalCredentials() {
        if (this.#operationalCredentialsRestored) {
            return;
        }

        const state = this.#storedState;
        if (state) {
            await this.#node.act(agent => {
                const opcreds = agent.operationalCredentials.state;
                opcreds.nocs = state.nocs;
                opcreds.fabrics = state.fabrics;
                opcreds.commissionedFabrics = opcreds.fabrics.length;
                opcreds.trustedRootCertificates = state.trustedRootCertificates;
            });
        }

        this.#operationalCredentialsRestored = true;
    }
    */
}
