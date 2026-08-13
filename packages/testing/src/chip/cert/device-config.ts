/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { env } from "node:process";
import type { DeviceFlavor } from "./cert-context.js";

function isDeviceFlavor(value: string): value is DeviceFlavor {
    return value === "chip-docker" || value === "chip-local" || value === "matterjs";
}

/**
 * Resolve which device implementation cert tests run against, from `MATTER_CERT_DEVICE`.
 *
 * Unset defaults to `matterjs`, the only flavor that works with no configuration at all:
 * `chip-local` needs `MATTER_CERT_APP_DIR`/`MATTER_CHIP_BINS_SOURCE`, and `chip-docker` has no
 * published per-app images yet, so either would guarantee a failing default run.
 */
export function resolveDeviceFlavor(): DeviceFlavor {
    const value = env.MATTER_CERT_DEVICE;

    if (value === undefined || value === "") {
        return "matterjs";
    }

    if (isDeviceFlavor(value)) {
        return value;
    }

    throw new Error(`Unknown MATTER_CERT_DEVICE "${value}" (expected "chip-docker", "chip-local", or "matterjs")`);
}

/**
 * Which controller stack a cert-test run drives the DUT with.
 */
export type ControllerImplementation = "chip-tool" | "matterjs";

function isControllerImplementation(value: string): value is ControllerImplementation {
    return value === "matterjs" || value === "chip-tool";
}

/**
 * Resolve which controller implementation cert tests run with, from `MATTER_CERT_CONTROLLER`.
 *
 * Unset defaults to `matterjs`, the only implementation that works with no configuration at all:
 * `chip-tool` needs the Linux-only chip-tool binary, so it would guarantee a failing default run.
 */
export function resolveControllerImplementation(): ControllerImplementation {
    const value = env.MATTER_CERT_CONTROLLER;

    if (value === undefined || value === "") {
        return "matterjs";
    }

    if (isControllerImplementation(value)) {
        return value;
    }

    throw new Error(`Unknown MATTER_CERT_CONTROLLER "${value}" (expected "chip-tool" or "matterjs")`);
}
