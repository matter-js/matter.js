/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const initializers = Array<() => void>();

/**
 * Utility for managing singleton state.  This is primarily for testing but may be used for any purpose that requires
 * a global reset of the process.
 */
export namespace Boot {
    /**
     * Invoke a callback immediately and on reboot.
     */
    export function init(setup: () => void) {
        initializers.push(setup);
        setup();
    }

    /**
     * Invoke all boot callbacks.  This signals singletons to revert to "first loaded" state.
     */
    export function reboot() {
        for (const initializer of initializers) {
            initializer();
        }
    }
}

if (typeof MatterHooks !== "undefined") {
    MatterHooks?.bootSetup(Boot);
}
