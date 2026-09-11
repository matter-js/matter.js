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

    export async function close(node: ServerNode) {
        const { env } = node;

        await env.close(FabricManager);
        await env.close(PeerSet);
        await env.close(SessionManager);
        await env.close(OccurrenceManager);
        await env.close(BindingManager);

        // Flush and stop client cache buffering before closing storage
        if (env.has(ClientCacheBuffer)) {
            await env.get(ClientCacheBuffer).close();
        }

        await env.close(FabricAuthority);
        await env.close(CertificateAuthority);

        await env.close(NodeServices);
    }
}

/**
 * The services a {@link ServerNode} owns for as long as the node exists.
 *
 * These hold OS resources, storage locks and node-wide observers, so a node that reinitializes — as it does after a
 * factory reset — must keep the ones it has.  A second set would orphan the first, and nothing closes an orphan.
 *
 * Installation records how to release each service as it installs it, and that same record both unwinds a failed
 * installation and tears down the node at the end of its life, so no service can be installed without also being
 * released.  The environment owns this service only once installation is complete, so a reinitialization never finds
 * a half-equipped environment to install over.
 */
class NodeServices {
    #teardown: Array<() => MaybePromise<void>>;

    static async install(node: ServerNode) {
        const { env } = node;
        const services = env.asDependent();

        // Releasing a service is what closing the node does; removing it from the environment is not, because a
        // closed node is closable again and its endpoints still resolve what they need to close
        const teardown = new Array<() => MaybePromise<void>>(() => services.close());
        const removals = new Array<() => MaybePromise<void>>();

        try {
            await services.load(MdnsService);

            // Create the datafile root — locking is now ref-counted and acquired by individual consumers
            if (env.get(StorageService).hasFilesystem) {
                const fs = env.get(Filesystem);
                const root = new DatafileRoot(fs.directory(node.id));
                env.set(DatafileRoot, root);
                removals.push(() => env.delete(DatafileRoot, root));

                // When storage.lock is enabled, hold a lock for the node's lifetime (for CLI PID file management)
                if (env.vars.boolean("storage.lock")) {
                    env.set(DatafileRoot.Lock, await root.lock());
                    teardown.push(() => env.close(DatafileRoot.Lock));
                }
            }

            // Construction opens storage, so a store that fails part way through still holds a driver and a lock
            const store = new ServerNodeStore(env, node.id);
            env.set(ServerNodeStore, store);
            teardown.push(() => env.close(ServerNodeStore));
            await store.construction;

            env.set(EndpointInitializer, new ServerEndpointInitializer(env));
            removals.push(() => env.delete(EndpointInitializer));

            env.set(IdentityService, new IdentityService(node));
            removals.push(() => env.delete(IdentityService));

            env.set(ChangeNotificationService, new ChangeNotificationService(node));
            teardown.push(() => env.close(ChangeNotificationService));

            const fabrics = await env.load(FabricManager);
            const sanitize = async () => {
                const fabricIndices = fabrics.fabrics.map(fabric => fabric.fabricIndex);
                if (fabricIndices.length > 0) {
                    await limitNodeDataToAllowedFabrics(node, fabricIndices);
                }
                ServerEnvironment.fabricScopedDataSanitized.emit(); // Only for testing purposes
            };
            fabrics.events.deleting.on(sanitize);
            teardown.push(() => fabrics.events.deleting.off(sanitize));
        } catch (cause) {
            await NodeServices.#release([...teardown, ...removals], `Error installing services for ${node}`).catch(
                error => logger.error("Could not undo a failed service installation", error),
            );
            throw cause;
        }

        env.set(NodeServices, new NodeServices(teardown));
    }

    constructor(teardown: Array<() => MaybePromise<void>>) {
        this.#teardown = teardown;
    }

    async close() {
        await NodeServices.#release(this.#teardown, "Error closing node services");
    }

    static #release(steps: Array<() => MaybePromise<void>>, message: string) {
        return MatterAggregateError.settleSeries([...steps].reverse(), message);
    }
}
