/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { limitNodeDataToAllowedFabrics } from "#behavior/cluster/FabricScopedDataHandler.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ServerEndpointInitializer } from "#node/server/ServerEndpointInitializer.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import {
    Crypto,
    DatafileRoot,
    Filesystem,
    Logger,
    MatterAggregateError,
    type MaybePromise,
    Observable,
    StorageService,
} from "@matter/general";
import {
    CertificateAuthority,
    FabricAuthority,
    FabricManager,
    MdnsService,
    OccurrenceManager,
    PeerSet,
    SessionManager,
} from "@matter/protocol";
import { BindingManager } from "../../behaviors/binding/BindingManager.js";
import { IdentityService } from "./IdentityService.js";

const logger = Logger.get("ServerEnvironment");

/**
 * Manages components that are present for the lifetime of a server.
 */
export namespace ServerEnvironment {
    /** Emits the fabric-scoped data are sanitized after the removal of a fabric. Only use for testing! */
    export const fabricScopedDataSanitized = Observable();

    export async function initialize(node: ServerNode) {
        const { env } = node;

        if (!env.owns(NodeServices)) {
            await NodeServices.install(node);
        }

        // Ensure these are fully initialized
        await env.load(FabricManager);
        await env.load(SessionManager);

        // Synchronous initialization
        env.get(PeerSet);

        env.get(Crypto).reportUsage(node.id);
    }

    /**
     * Discard the credentials the node issues fabrics under.
     *
     * The authorities cache key material for the lifetime of their instances, so both are dropped along with what they
     * persist.  An authority supplied by an ancestor environment belongs to whoever supplied it, but key material the
     * node persisted under its own storage is ours to discard either way: the authority is created lazily and may be
     * configured without storage, so neither its absence nor its presence proves the node's context is empty.
     */
    export async function eraseCredentials(node: ServerNode) {
        const { env } = node;

        env.delete(FabricAuthority);

        if (env.owns(CertificateAuthority)) {
            try {
                await env.get(CertificateAuthority).erase();
            } finally {
                env.delete(CertificateAuthority);
            }
        }

        await CertificateAuthority.eraseFor(env);
    }

    /**
     * Close the services a node's lifetime depends on.
     *
     * The order below is load-bearing and was arrived at through a series of shutdown defects.  Treat it as fixed:
     * {@link NodeServices} installs most of these but deliberately does not sequence their closure, because the
     * services it installs interleave with services it does not.
     */
    export async function close(node: ServerNode) {
        const { env } = node;

        await env.close(FabricManager);
        await env.close(PeerSet);
        await env.close(ChangeNotificationService);
        await env.close(SessionManager);
        await env.close(OccurrenceManager);
        await env.close(BindingManager);

        // Flush and stop client cache buffering before closing storage
        if (env.has(ClientCacheBuffer)) {
            await env.get(ClientCacheBuffer).close();
        }

        await env.close(ServerNodeStore);
        await env.close(NodeServices);
        await env.close(FabricAuthority);
        await env.close(CertificateAuthority);

        // Release the env-held lock (from storage.lock) if one was acquired
        if (env.has(DatafileRoot.Lock)) {
            await env.get(DatafileRoot.Lock).close();
        }
    }
}

/**
 * Installs the services a {@link ServerNode} owns for as long as the node exists.
 *
 * These hold OS resources, storage locks and node-wide observers, so a node that reinitializes — as it does after a
 * factory reset — must keep the ones it has.  A second set would orphan the first, and nothing closes an orphan.  The
 * environment owns this service only once installation is complete, and a failed installation releases what it
 * already acquired, so a reinitialization never finds a half-equipped environment to install over.  A service that
 * installs itself elsewhere as it constructs, as {@link MdnsService} does at the root environment, is beyond that
 * guarantee.
 *
 * Closing releases only what {@link ServerEnvironment.close} does not, because that function sequences the rest
 * against services this does not install; its order is load-bearing, so see the note there.
 */
class NodeServices {
    #release: NodeServices.Release[];

    static async install(node: ServerNode) {
        const { env } = node;
        const services = env.asDependent();

        // Steps run in reverse registration order, so register each before the operation that can fail.  Each releases
        // a resource and none removes a service from the environment: a node whose installation failed is still closed
        // by its owner, and its endpoints still resolve what they need in order to close
        const release = new Array<NodeServices.Release>({ on: "close", run: () => services.close() });

        try {
            await services.load(MdnsService);

            // Create the datafile root — locking is now ref-counted and acquired by individual consumers
            if (env.get(StorageService).hasFilesystem) {
                const fs = env.get(Filesystem);
                env.set(DatafileRoot, new DatafileRoot(fs.directory(node.id)));

                // When storage.lock is enabled, hold a lock for the node's lifetime (for CLI PID file management)
                if (env.vars.boolean("storage.lock")) {
                    const lock = await env.get(DatafileRoot).lock();
                    env.set(DatafileRoot.Lock, lock);
                    release.push({ on: "failure", run: () => lock.close() });
                }
            }

            // Construction opens storage, so a store that fails part way through still holds a driver and a lock
            const store = new ServerNodeStore(env, node.id);
            env.set(ServerNodeStore, store);
            release.push({ on: "failure", run: () => store.close() });
            await store.construction;

            env.set(EndpointInitializer, new ServerEndpointInitializer(env));
            env.set(IdentityService, new IdentityService(node));

            const notifications = new ChangeNotificationService(node);
            env.set(ChangeNotificationService, notifications);
            release.push({ on: "failure", run: () => notifications.close() });

            // Construction is awaited by the caller; the event this subscribes to is available before then
            const fabrics = env.get(FabricManager);
            const sanitize = async () => {
                const fabricIndices = fabrics.fabrics.map(fabric => fabric.fabricIndex);
                if (fabricIndices.length > 0) {
                    await limitNodeDataToAllowedFabrics(node, fabricIndices);
                }
                ServerEnvironment.fabricScopedDataSanitized.emit(); // Only for testing purposes
            };
            fabrics.events.deleting.on(sanitize);
            release.push({ on: "close", run: () => fabrics.events.deleting.off(sanitize) });
        } catch (cause) {
            await NodeServices.#releaseAll(release, "failure", `Error installing services for ${node}`).catch(error =>
                logger.error("Could not release the services of a failed installation", error),
            );
            throw cause;
        }

        env.set(NodeServices, new NodeServices(release));
    }

    constructor(release: NodeServices.Release[]) {
        this.#release = release;
    }

    async close() {
        await NodeServices.#releaseAll(this.#release, "close", "Error closing node services");
    }

    static #releaseAll(release: NodeServices.Release[], reason: "failure" | "close", message: string) {
        // Filtering preserves registration order, so the reversal below is still last-in-first-out
        const steps = release.filter(step => reason === "failure" || step.on === "close").map(step => step.run);

        return MatterAggregateError.settleSeries(steps.reverse(), message);
    }
}

namespace NodeServices {
    export interface Release {
        /** "failure" steps release a service {@link ServerEnvironment.close} closes itself, so only a failed install runs them */
        on: "close" | "failure";

        run: () => MaybePromise<void>;
    }
}
