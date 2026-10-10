/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { env } from "node:process";
import type { SelectableDeviceFlavor } from "./cert-context.js";

/**
 * Thrown when the cert-test environment cannot be turned into a running setup: `MATTER_CERT_DEVICE` or
 * `MATTER_CERT_CONTROLLER` names no known implementation, `MATTER_CERT_SERVER_ENTRY` is missing or empty for the
 * `matterjs-server` controller, or the server it names exits early or does not become ready in time. Extends `Error`
 * because `@matter/testing` does not depend on `@matter/general`.
 */
export class CertConfigError extends Error {
    override name = "CertConfigError";
}

function isSelectableDeviceFlavor(value: string): value is SelectableDeviceFlavor {
    return value === "chip-docker" || value === "chip-local" || value === "matterjs";
}

/**
 * Resolve which device implementation cert tests run against, from `MATTER_CERT_DEVICE`.
 *
 * Unset defaults to `matterjs`, the only flavor that works with no configuration at all:
 * `chip-local` needs `MATTER_CERT_APP_DIR`/`MATTER_CHIP_BINS_SOURCE`, and `chip-docker` has no
 * published per-app images yet, so either would guarantee a failing default run.
 *
 * `python-wrapped` is not among the values this accepts: the harness neither builds nor starts such a
 * device, so selecting it would name a device nothing could produce.
 */
export function resolveDeviceFlavor(): SelectableDeviceFlavor {
    const value = env.MATTER_CERT_DEVICE;

    if (value === undefined || value === "") {
        return "matterjs";
    }

    if (isSelectableDeviceFlavor(value)) {
        return value;
    }

    throw new CertConfigError(
        `Unknown MATTER_CERT_DEVICE "${value}" (expected "chip-docker", "chip-local", or "matterjs")`,
    );
}

/**
 * Which controller stack a cert-test run drives the DUT with.
 */
export type ControllerImplementation = "chip-tool" | "matterjs" | "matterjs-server";

function isControllerImplementation(value: string): value is ControllerImplementation {
    return value === "matterjs" || value === "chip-tool" || value === "matterjs-server";
}

/**
 * Resolve which controller implementation cert tests run with, from `MATTER_CERT_CONTROLLER`.
 *
 * Unset defaults to `matterjs`, the only implementation that works with no configuration at all:
 * `chip-tool` needs a chip-tool binary, from `MATTER_CERT_APP_DIR` or the Linux-only cert-bins image, so it would
 * guarantee a failing default run.
 */
export function resolveControllerImplementation(): ControllerImplementation {
    const value = env.MATTER_CERT_CONTROLLER;

    if (value === undefined || value === "") {
        return "matterjs";
    }

    if (isControllerImplementation(value)) {
        return value;
    }

    throw new CertConfigError(
        `Unknown MATTER_CERT_CONTROLLER "${value}" (expected "chip-tool", "matterjs", or "matterjs-server")`,
    );
}
