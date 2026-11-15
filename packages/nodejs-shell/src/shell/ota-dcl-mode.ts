/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

export const DclQueryModes = ["auto", "prod", "test", "both"] as const;

export type DclQueryMode = (typeof DclQueryModes)[number];

/** Adds the `--mode` option selecting which DCL instances are queried for OTA updates. */
export function withDclModeOption<T>(yargs: Argv<T>) {
    return yargs.option("mode", {
        describe: 'DCL instances to query ("auto" follows the config ota-test-images setting)',
        type: "string",
        choices: DclQueryModes,
        default: "auto" as DclQueryMode,
    });
}

/** Resolves the `--mode` option into the `isProduction` flag understood by the OTA update service. */
export function resolveDclMode(theNode: MatterNode, mode: DclQueryMode) {
    const resolved = mode === "auto" ? (theNode.allowTestOtaImages ? "both" : "prod") : mode;
    return {
        label: mode === "auto" ? `auto (${resolved})` : resolved,
        isProduction: resolved === "prod" ? true : resolved === "test" ? false : undefined,
    };
}

/**
 * Why a search for stored images with `isProduction` skips the stored local and test-net images, or `undefined` when it
 * includes them.  Only a search that is not production-only includes them.
 */
function skippedStoredImagesReason(mode: DclQueryMode, isProduction: boolean | undefined) {
    if (isProduction !== true) {
        return undefined;
    }
    return mode === "prod"
        ? "--mode prod uses production images only"
        : "local and test-net images are only used with config ota-test-images";
}

/** Prints why a search with `--local` skips the stored local and test-net images, when it does. */
export function noteSkippedStoredImages(local: boolean, mode: DclQueryMode, isProduction: boolean | undefined) {
    const reason = local ? skippedStoredImagesReason(mode, isProduction) : undefined;
    if (reason !== undefined) {
        console.log(`Note: --local skips stored local and test-net images, ${reason}.\n`);
    }
}
