/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { loader } from "./loader.js";

/**
 * This static version of the loader only responds with components loaded statically.
 *
 * You must load components required separately into {@link loader.registry}.
 */
export function load(path: string): {} {
    const parsed = path.match(/([^/]+)\/[^/]+\/[^/]+\.js/);

    if (parsed) {
        const [, group] = parsed;
        return loader.registry[group] ?? {};
    }

    return {};
}
