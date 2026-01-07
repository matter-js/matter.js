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
const appBooters = {} as Record<string, () => void>;

export interface Boot {
    format: string;
    init(fn: () => void): void;
    reboot(): void;
}

export const Boot: Boot = {
    format: "unknown",

    init(fn) {
        fn();
        initializers.push(fn);
    },

    reboot() {
        for (const initializer of initializers) {
            initializer();
        }
    },
};

const initializers = [() => appBooters[Boot.format]?.()];

export function bootSetup(AppBoot: { reboot(): () => void }) {
    appBooters[Boot.format] = AppBoot.reboot.bind(Boot);
}
