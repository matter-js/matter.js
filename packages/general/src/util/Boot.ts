/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const initializers = Array<{ setup: () => void; kind: Boot.Kind }>();

/**
 * Utility for managing singleton state.  This is primarily for testing but may be used for any purpose that requires
 * a global reset of the process.
 */
export namespace Boot {
    /**
     * Invoke a callback immediately and on reboot.
     */
    export function init(setup: () => void, kind: Boot.Kind = "platform") {
        initializers.push({ setup, kind });
        setup();
    }

    /**
     * Invoke all boot callbacks.  This signals singletons to revert to "first loaded" state.
     */
    export function reboot(kind?: Boot.Kind) {
        for (const initializer of initializers) {
            if (initializer.kind === "platform" && kind === "state") {
                continue;
            }

            if (kind === "state") {
                continue;
            }

            initializer.setup();
        }
    }

    /**
     * Kind of boot.
     *
     * "platform" resets singletons and state.  "state" resets state only.
     */
    export type Kind = "platform" | "state";
}

if (typeof MatterHooks !== "undefined") {
    MatterHooks?.bootSetup(Boot);
}
