/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertDeviceFactory } from "./cert-context.js";

const subjects = new Map<string, CertDeviceFactory>();

/**
 * Registers a {@link CertDeviceFactory} for the "matterjs" {@link DeviceFlavor}, keyed by
 * chip-test-header app name.
 *
 * Kept separate from {@link Chip.subjectFor}'s app registry: that one is for the existing py/yaml
 * harness's plain `Subject.Factory`s, which don't carry {@link CertDevice}'s extra fields
 * (`log`/`flavor`/`exit`). Registering the same app name in both places is fine — they're
 * independent maps — but a cert factory needs the matter.js `Logger` sink that only
 * `support/chip-testing` (not this package) is allowed to depend on, so it registers here instead.
 */
export function registerMatterJsCertSubject(app: string, factory: CertDeviceFactory): void {
    if (subjects.has(app)) {
        throw new Error(`A matterjs cert subject is already registered for app "${app}"`);
    }
    subjects.set(app, factory);
}

/**
 * Looks up a factory registered via {@link registerMatterJsCertSubject}.
 */
export function matterJsCertSubjectFor(app: string): CertDeviceFactory | undefined {
    return subjects.get(app);
}
