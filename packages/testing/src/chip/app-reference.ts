/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TestDescriptor } from "../test-descriptor.js";

/**
 * Thrown when a test's script arguments carry a `${...}` placeholder that names no executable app in the
 * container. CHIP's CI expands these from its own build tree; passing one through unexpanded makes the script
 * fail later with a message that no longer names the placeholder.
 */
export class UnresolvedAppPlaceholderError extends Error {}

const PLACEHOLDER = /\$\{([^}]*)\}/g;

/**
 * Reduce a CHIP app reference such as `${ALL_DEVICES_APP}` or `${CHIP_LOCK_APP}` to the harness app name
 * (`all-devices`, `lock`).
 *
 * CHIP names its apps this way both in the `app` key of a test's CI block and in placeholders inside its script
 * arguments. The result is the name harness subjects register under.
 *
 * Idempotent: a name already in harness form comes back unchanged.
 */
export function chipAppName(reference: string) {
    let name = reference;
    if (name.startsWith("${")) {
        name = name.slice(2);
    }
    if (name.startsWith("CHIP_")) {
        name = name.slice(5);
    }
    if (name.endsWith("}")) {
        name = name.slice(0, -1);
    }
    if (name.endsWith("_APP")) {
        name = name.slice(0, -4);
    }
    return name.replaceAll("_", "-").toLowerCase();
}

/**
 * Bring the CHIP app references in a descriptor tree into harness form with {@link chipAppName}, in place.
 */
export function normalizeAppReferences(descriptor: TestDescriptor) {
    if (descriptor.app !== undefined) {
        descriptor.app = chipAppName(descriptor.app);
    }
    if (descriptor.preferredApp !== undefined) {
        descriptor.preferredApp = chipAppName(descriptor.preferredApp);
    }
    const configApp = descriptor.config?.app;
    if (descriptor.config !== undefined && typeof configApp === "string") {
        descriptor.config.app = chipAppName(configApp);
    }
    for (const member of descriptor.members ?? []) {
        normalizeAppReferences(member);
    }
}

/**
 * Replace each `${...}` app placeholder in `args` with the container path of the app it names, as CHIP's CI does
 * with `--string-arg th_server_app_path:${TV_APP}`.
 *
 * A placeholder resolves to `/bin/chip-<name>-app`, with `<name>` from {@link chipAppName}. That is how the test
 * image names most of its apps; a binary named otherwise (`lit-icd-app`, `matter-network-manager-app`) does not
 * resolve and fails the test.
 *
 * `isExecutable` reports whether a container path is an executable file.
 *
 * @throws UnresolvedAppPlaceholderError if a placeholder names no executable app
 */
export async function expandAppPlaceholders(args: string[], isExecutable: (path: string) => Promise<boolean>) {
    const expanded = new Array<string>();
    for (const arg of args) {
        let result = arg;
        for (const [placeholder] of arg.matchAll(PLACEHOLDER)) {
            const path = `/bin/chip-${chipAppName(placeholder)}-app`;
            if (!(await isExecutable(path))) {
                throw new UnresolvedAppPlaceholderError(
                    `Script argument "${arg}" names ${placeholder}, but the test image has no executable ${path}`,
                );
            }
            result = result.replace(placeholder, () => path);
        }
        expanded.push(result);
    }
    return expanded;
}
