/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogExpectPatterns } from "@matter/testing";
import { MATTERJS_COMMISSIONED_FABRIC } from "./tc-support.js";

// TC-CADMIN-1.17's device-log patterns live beside the test case rather than inside it because a
// `TC-*.test.ts` registers a device-driven mocha test at import time, so the cert-framework spec set
// cannot import one to unit-test what it declares.

/** A completed commissioning: chip announces it, matter.js names the fabric it completed for. */
export const COMMISSIONING_COMPLETE: LogExpectPatterns = {
    chip: /Commissioning completed successfully/,
    matterjs: MATTERJS_COMMISSIONED_FABRIC,
};

/** An opened commissioning window: matter.js names it by the timer it arms for it. */
export const WINDOW_OPEN: LogExpectPatterns = {
    chip: /Commissioning window is now open/,
    matterjs: /AdministratorCommissioningServer Commissioning window timer started/,
};

/**
 * A `RemoveFabric` the device answered with success. matter.js's line is the invoke's own answer,
 * which names the fabric it removed and the status it answered with, where chip logs an unqualified
 * success line.
 */
export function removeFabricSucceeded(fabricIndex: number): LogExpectPatterns {
    return {
        chip: /OpCreds: RemoveFabric successful/,
        matterjs: new RegExp(
            `operationalCredentials\\.removeFabric .*statusCode: 0 fabricIndex: ${fabricIndex}(?!\\d)`,
        ),
    };
}

/**
 * The removed fabric's sessions going away. A matter.js session is named
 * `@<fabricIndex>:<fabricId>•<id>`, so one such line per session is what chip states once as
 * "Expiring all sessions for fabric N".
 */
export function fabricSessionsEnded(fabricIndex: number): LogExpectPatterns {
    return {
        chip: new RegExp(`Expiring all sessions for fabric 0x${fabricIndex.toString(16)}!!`),
        matterjs: new RegExp(`Session @${fabricIndex}:[0-9a-f]+•[0-9a-f]+ Session ended`),
    };
}
