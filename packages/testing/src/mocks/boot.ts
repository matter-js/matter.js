/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On test reboot, also reboot application environment.  We install this as the first initializer so application
 * initializers run before test harness initializers that may mock the application components.
 *
 * The test harness may load multiple test environments (e.g. ESM vs CJS) so we must track the current environment to
 * ensure we boot the correct version of the code.
 */
const appBooters = {} as Record<string, (kind?: BootKind) => void>;

export interface Boot {
    format: string;
    init(fn: (kind: BootKind) => void): void;
    reboot(): void;
    reset(): void;
}

export const Boot: Boot = {
    format: "unknown",

    init(fn) {
        fn("platform");
        initializers.push(fn);
    },

    reboot() {
        for (const initializer of initializers) {
            initializer("platform");
        }
    },

    reset() {
        for (const initializer of initializers) {
            initializer("state");
        }
    },
};

const initializers = [(kind: BootKind) => appBooters[Boot.format]?.(kind)];

export function bootSetup(AppBoot: { reboot(kind?: BootKind): () => void }) {
    appBooters[Boot.format] = AppBoot.reboot.bind(Boot);
}

export type BootKind = "platform" | "state";
