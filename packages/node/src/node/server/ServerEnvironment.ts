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
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import {
    Crypto,
    DatafileRoot,
    Environment,
    Filesystem,
    Observable,
    SharedEnvironmentServices,
    StorageService,
} from "@matter/general";
import {
    FabricAuthority,
    FabricManager,
    MdnsService,
    OccurrenceManager,
    PeerSet,
    SessionManager,
} from "@matter/protocol";
import { IdentityService } from "./IdentityService.js";

/**
 * Manages components that are present for the lifetime of a server.
 */
export namespace ServerEnvironment {
    /** Emits the fabric-scoped data are sanitized after the removal of a fabric. Only use for testing! */
    export const fabricScopedDataSanitized = Observable();

    export async function initialize(node: ServerNode) {
        const { env } = node;

        await SharedNodeServices.install(env);

        // Create the datafile root — locking is now ref-counted and acquired by individual consumers
        if (env.get(StorageService).hasFilesystem) {
            const fs = env.get(Filesystem);
            const root = new DatafileRoot(fs.directory(node.id));
            env.set(DatafileRoot, root);

            // When storage.lock is enabled, hold a lock for the node's lifetime (for CLI PID file management)
            if (env.vars.boolean("storage.lock")) {
                env.set(DatafileRoot.Lock, await root.lock());
            }
        }

        const store = await ServerNodeStore.create(env, node.id);
        env.set(ServerNodeStore, store);

        env.set(EndpointInitializer, new ServerEndpointInitializer(env));
        env.set(IdentityService, new IdentityService(node));
        env.set(ChangeNotificationService, new ChangeNotificationService(node));

        // Ensure these are fully initialized
        const fabrics = await env.load(FabricManager);

        fabrics.events.deleting.on(async () => {
            const fabricIndices = fabrics.fabrics.map(fabric => fabric.fabricIndex);
            if (fabricIndices.length > 0) {
                await limitNodeDataToAllowedFabrics(node, fabricIndices);
            }
            fabricScopedDataSanitized.emit(); // Only for testing purposes
        });

        await env.load(SessionManager);

        // Synchronous initialization
        env.get(PeerSet);

        env.get(Crypto).reportUsage(node.id);
    }

    export async function close(node: ServerNode) {
        const { env } = node;

        env.close(FabricManager);
        await env.close(PeerSet);
        await env.close(ChangeNotificationService);
        await env.close(SessionManager);
        await env.close(OccurrenceManager);
        await env.close(ServerNodeStore);
        await env.close(SharedNodeServices);
        env.close(FabricAuthority);

        // Release the env-held lock (from storage.lock) if one was acquired
        if (env.has(DatafileRoot.Lock)) {
            await env.get(DatafileRoot.Lock).close();
        }
    }
}

class SharedNodeServices {
    #services: SharedEnvironmentServices;

    static async install(env: Environment) {
        const services = env.asDependent();
        await services.load(MdnsService);

        env.set(SharedNodeServices, new SharedNodeServices(services));
    }

    constructor(services: SharedEnvironmentServices) {
        this.#services = services;
    }

    async close() {
        await this.#services.close();
    }
}
