/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestRunner } from "@matter/testing";

/**
 * The testing framework bundles tests so dynamic loads won't work.
 *
 * We install all behaviors/devices/endpoints into the static registry where the static loader will find them.
 */
TestRunner.current.entrypointPreprocessor = lines => {
    lines.push(`import { loader } from "@matter/node"`);
    for (const group of ["behaviors", "devices", "endpoints"]) {
        lines.push(
            `import * as ${group} from "@matter/node/${group}";`,
            `loader.registry[${JSON.stringify(group)}] = ${group};`,
        );
    }
};
