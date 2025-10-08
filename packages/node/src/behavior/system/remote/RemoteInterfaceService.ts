/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AppAddress,
    Diagnostic,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
    ServiceBundle,
} from "#general";
import type { ServerNode } from "#node/ServerNode.js";
import type { RemoteInterface } from "./RemoteInterface.js";

const logger = Logger.get("RemoteServer");

/**
 * Environmental registration for API adapters.
 */
export class RemoteInterfaceService {
    #factories = new Set<RemoteInterface.Factory>();

    add(factory: RemoteInterface.Factory) {
        this.#factories.add(factory);
    }

    async create(node: ServerNode, address: AppAddress): Promise<RemoteInterface> {
        for (const factory of this.#factories) {
            let result = factory(node, address);

            if (result) {
                result = await result;
            }

            if (result === undefined) {
                continue;
            }

            logger.info("Listening on", Diagnostic.strong(AppAddress.for(address)));

            return result;
        }
        throw new ImplementationError(`No remote implementation available for address ${address}`);
    }

    static [Environmental.create](env: Environment) {
        const instance = new RemoteInterfaceService();
        env.set(RemoteInterfaceService, instance);
        return instance;
    }

    /**
     * Register an API adapter for use in any environment.
     */
    static register(type: RemoteInterface.Type) {
        ServiceBundle.default.add(env => {
            env.get(RemoteInterfaceService).add((node, address) => {
                if (type.protocol === address.appProtocol) {
                    return type.create(node, address);
                }
            });
        });
    }
}
