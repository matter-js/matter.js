/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateMatterjsMainForwards } from "#forwards/matterjs-main.js";
import { Progress } from "@matter/tools";

/**
 * Generate a "forward" file for each sub-module re-export.
 */
const progress = new Progress();

progress.startup(`Generating ${progress.emphasize("sub-module forwards")}`, false);

await progress.run("@matter/main", generateMatterjsMainForwards);

progress.close();
