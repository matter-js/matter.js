/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PicsFile } from "../pics/file.js";
import type { PicsValues } from "../pics/values.js";
import type { CertTestDefinition, DeviceFlavor, SelectableDeviceFlavor } from "./cert-context.js";
import { controllerPicsOverridesFor } from "./controller-adapter.js";
import { resolveControllerImplementation, resolveDeviceFlavor } from "./device-config.js";

const appPics = new Map<string, PicsValues>();

function key(flavor: DeviceFlavor, app: string) {
    return `${flavor}\u0000${app}`;
}

/**
 * Declares the PICS entries a cert app answers for itself, overlaying the PICS file the run loads.
 *
 * The file describes a generic device, so a capability only one app has — the BDX receiver role,
 * which belongs to an OTA requestor and to nothing else in this suite — reads `0` there for every app
 * alike. An app states what it is here, beside the code that implements it, rather than through a
 * PICS file per app.
 *
 * Declared per flavor, because one app name is two implementations: `chip-ota-requestor-app` and
 * matter.js's own requestor answer the same role questions differently, and a key like
 * `MCORE.BDX.BlockQueryWithSkip` is exactly where they part.
 *
 * This answers what the app *is*, never what a test would like it to be: a case that could answer its
 * own PICS could never be skipped by them.
 */
export function registerCertAppPics(flavor: SelectableDeviceFlavor, app: string, pics: PicsValues): void {
    if (appPics.has(key(flavor, app))) {
        throw new Error(`Cert app PICS are already registered for app "${app}" on flavor "${flavor}"`);
    }
    appPics.set(key(flavor, app), pics);
}

/** The PICS entries {@link registerCertAppPics} declared for `app` on `flavor`, empty where none. */
export function certAppPicsOverridesFor(flavor: DeviceFlavor | undefined, app: string): PicsValues {
    if (flavor === undefined) {
        return {};
    }
    return appPics.get(key(flavor, app)) ?? {};
}

/**
 * Removes an app's registered PICS, so a test can register throwaway entries without leaving them
 * stuck for the rest of the process (registration has no other way to be undone).
 */
export function unregisterCertAppPics(flavor: SelectableDeviceFlavor, app: string): void {
    appPics.delete(key(flavor, app));
}

/**
 * `base` with the self-declarations of both sides applied, the DUT's own side last.
 *
 * The PICS file describes a generic device, and both a controller and a cert app state what they are
 * on top of it. Where the two disagree the DUT's side wins, because the claim a step makes is about
 * the DUT: `MCORE.BDX.BlockQueryWithSkip` is the case in point, where the controller answers for its
 * own sending, which says nothing about a device the plan puts in the sender's place.
 *
 * Both the collection-time gate (`cert-dsl.ts`'s `certPicsFile`) and the run-time one
 * (`cert-test.ts`) compose it here, so a test cannot be admitted by one and refused by the other.
 */
export function picsWithOverrides(base: PicsFile, definition: Pick<CertTestDefinition, "app" | "dutIsDevice">) {
    const controllerOverrides = controllerPicsOverridesFor(resolveControllerImplementation());
    const appOverrides = certAppPicsOverridesFor(resolveDeviceFlavor(), definition.app);
    return definition.dutIsDevice === true
        ? base.with(controllerOverrides).with(appOverrides)
        : base.with(appOverrides).with(controllerOverrides);
}
