/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import type { EndpointType } from "#endpoint/type/EndpointType.js";
import { ImportError, Logger, MaybePromise } from "@matter/general";

// Must load from public export so node selects the correct format
import { load } from "@matter/node/load";

import type { ServerNode } from "./ServerNode.js";

const logger = Logger.get("Plugins");

/**
 * Manages plugin loading and application for a {@link ServerNode}.
 *
 * Plugins are comma-separated module specifiers configured via the `plugins` variable, either globally
 * (`MATTER_PLUGINS`) or per-node (`MATTER_NODES_<id>_PLUGINS`).  Both sources are merged with deduplication.
 *
 * String specifiers are resolved via the platform module loader (ESM `import()` or CJS `require()`).
 *
 * Module exports are classified by precedence:
 *   - Named `install` function: called with the node
 *   - `*Server` {@link Behavior} exports: installed on the root endpoint
 *   - Single {@link EndpointType}: added as a child endpoint
 *   - None of the above: side-effect only (no-op)
 *   - Multiple server behaviors or device types without `install`: error
 *
 * Only exports whose name ends with "Server" are considered as behavior plugins.  This matches the matter.js
 * convention where `*Server` is the implementation behavior, while `*Behavior` is the base class and `*Client`
 * is the client-side proxy.  This allows standard behavior module paths (e.g. `@matter/node/behaviors/on-off`)
 * to work directly as plugin specifiers.
 */
export class Plugins {
    #node: ServerNode;

    constructor(node: ServerNode) {
        this.#node = node;
    }

    /**
     * Load and apply all plugins.  Called once during node initialization.
     */
    async load() {
        const specifiers = Array<string>();

        // Merge global plugins (MATTER_PLUGINS) and node-scoped plugins (MATTER_NODES_<id>_PLUGINS)
        for (const path of ["plugins", `nodes.${this.#node.id}.plugins`]) {
            const value = this.#node.env.vars.get<string>(path);
            if (typeof value === "string" && value.length) {
                for (const segment of value.split(",")) {
                    const trimmed = segment.trim();
                    if (trimmed.length && !specifiers.includes(trimmed)) {
                        specifiers.push(trimmed);
                    }
                }
            }
        }

        for (const specifier of specifiers) {
            const mod = await this.#loadModule(specifier);
            this.#applyModule(specifier, mod);
        }
    }

    async #loadModule(specifier: string): Promise<Record<string, unknown>> {
        try {
            const mod = load(specifier);
            if (MaybePromise.is(mod)) {
                return (await mod) as Record<string, unknown>;
            }
            return mod as Record<string, unknown>;
        } catch (e) {
            throw new ImportError(`Failed to load plugin "${specifier}": ${e}`);
        }
    }

    #applyModule(specifier: string, mod: Record<string, unknown>) {
        // Priority 1: explicit install function
        if (typeof mod.install === "function") {
            const result = (mod.install as Plugins.Installer)(this.#node);
            if (MaybePromise.is(result)) {
                throw new ImportError(
                    `Plugin "${specifier}" install function returned a promise; install must be synchronous`,
                );
            }
            return;
        }

        // Scan exports for *Server behaviors and device types.  Only exports named *Server are considered as behavior
        // plugins — this matches the convention where *Behavior is the base class and *Client is client-side
        const serverBehaviors = Array<Behavior.Type>();
        const deviceTypes = Array<EndpointType>();

        for (const [name, value] of Object.entries(mod)) {
            if (name === "default" || name.startsWith("_") || value === undefined || value === null) {
                continue;
            }

            if (name.endsWith("Server") && isBehaviorType(value)) {
                serverBehaviors.push(value);
            } else if (isEndpointType(value)) {
                deviceTypes.push(value);
            }
        }

        if (serverBehaviors.length === 0 && deviceTypes.length === 0) {
            logger.debug("Plugin", specifier, "loaded (side-effect only)");
            return;
        }

        // Multiple server behaviors are fine — install all of them
        for (const behavior of serverBehaviors) {
            logger.debug("Plugin", specifier, "installing behavior", behavior.id);
            this.#node.behaviors.require(behavior);
        }

        if (deviceTypes.length > 1) {
            const names = deviceTypes.map(d => `DeviceType "${d.name}"`);
            throw new ImportError(
                `Plugin "${specifier}" exports multiple device types (${names.join(", ")}). ` +
                    `Add a named "install" export to specify how the plugin should be applied.`,
            );
        }

        if (deviceTypes.length === 1) {
            logger.debug("Plugin", specifier, "adding endpoint", deviceTypes[0].name);
            this.#node.parts.add(new Endpoint(deviceTypes[0]));
        }
    }
}

export namespace Plugins {
    /**
     * The `install` export signature for plugin modules.
     */
    export type Installer = (node: ServerNode) => void;
}

function isBehaviorType(value: unknown): value is Behavior.Type {
    return typeof value === "function" && value.prototype instanceof Behavior;
}

function isEndpointType(value: unknown): value is EndpointType {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.name === "string" &&
        typeof candidate.deviceType === "number" &&
        typeof candidate.deviceRevision === "number" &&
        typeof candidate.behaviors === "object" &&
        candidate.behaviors !== null
    );
}
