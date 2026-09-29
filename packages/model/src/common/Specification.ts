/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Matter specification documents.
 */
export enum Specification {
    Core = "core",
    Cluster = "cluster",
    Device = "device",
    Namespace = "namespace",
}

export namespace Specification {
    /**
     * Long names for Matter specification documents.
     */
    export enum Names {
        core = "Matter Core Specification",
        cluster = "Matter Application Cluster Specification",
        device = "Matter Device Library Specification",
        namespace = "Matter Standard Namespace Specification",
    }

    /**
     * Information on the source of an element.
     */
    export type CrossReference = {
        /**
         * The defining document for the element.
         */
        document: `${Specification}`;

        /**
         * The section of the defining document that most specifically
         * addresses the element.
         */
        section: string;
    };

    /**
     * Matter specification version.
     */
    export type Revision =
        | `${number}.${number}`
        | `${number}.${number}.${number}`
        | `${number}.${number}.${number}.${number}`;

    /**
     * Compare two specification revisions.
     *
     * Revisions are dotted numeric strings of varying length, so we compare segment-by-segment numerically with missing
     * trailing segments treated as zero.  This makes "1.6" and "1.6.0" equal and orders patch levels intuitively.
     *
     * Returns a negative number if {@link a} precedes {@link b}, positive if it follows and zero if they are equal.
     */
    export function compareRevisions(a: Revision, b: Revision) {
        const as = a.split(".");
        const bs = b.split(".");
        for (let i = 0; i < Math.max(as.length, bs.length); i++) {
            const delta = Number(as[i] ?? 0) - Number(bs[i] ?? 0);
            if (delta) {
                return delta;
            }
        }
        return 0;
    }

    /**
     * The default specification revision for Matter.js.
     */
    export const REVISION = "1.6.1";

    /**
     * Enables Matter behaviour implemented ahead of a released specification revision.
     *
     * Off in every release.  Only the cert-testing branch sets it to `true`; there is no supported configuration or API
     * to change it.  Tests enable single features through the `MatterHooks` test harness hook, which any runtime that
     * defines that global also reaches.  Typed as `boolean` so that code behind a guard stays type-checked.  When a
     * feature ships in a released specification, remove every guard for it and its name from {@link ForwardFeature}.
     */
    export const ENABLE_FORWARD_MATTER_FEATURES: boolean = false;

    /**
     * Features implemented ahead of a released specification; each name marks its guards.
     *
     * Use only names that are already public, so the source does not disclose unreleased specification content.
     */
    export type ForwardFeature = "pqc-phase-1";

    /**
     * Whether a forward feature is active.  Tests enable one with `MockForwardFeatures.enable()` from
     * `@matter/testing` through the `MatterHooks` global, which only the test harness installs.
     */
    export function isForwardFeatureEnabled(feature: ForwardFeature) {
        return (
            ENABLE_FORWARD_MATTER_FEATURES ||
            (typeof MatterHooks !== "undefined" && MatterHooks.forwardFeatureEnabled?.(feature) === true)
        );
    }

    /**
     * Binary version of specification revision defined by Basic Information Cluster.
     *
     * Currently spec says least significant octet is "reserved", so it should remain zero.
     */
    export const SPECIFICATION_VERSION = 0x01060100;

    /**
     * Data model revision associated with the default revision of Matter.
     */
    export const DATA_MODEL_REVISION = 21;

    /**
     * Interaction model revision associated with the default revision of Matter.
     *
     * Capped at 12 because rev 13's sole delta over 12 is WildcardFilterConfigurationVersion, which spec
     * §8.2.1.7.1 marks provisional (not certifiable).
     * TODO: Bump to 13 once that feature becomes certifiable.
     */
    export const INTERACTION_MODEL_REVISION = 12;
}
