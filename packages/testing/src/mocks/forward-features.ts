/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MockForwardFeatures {
    /**
     * Enable forward Matter features for the tests of the enclosing suite.  Call it inside `describe()`; the features
     * turn off again once the suite completes.
     *
     * Names are the `Specification.ForwardFeature` names of `@matter/model`.  They are typed as `string` because
     * `@matter/testing` cannot depend on `@matter/model`, so a misspelled name enables nothing.
     */
    enable(...features: string[]): void;

    /** Whether a running suite enabled {@link feature}. */
    isEnabled(feature: string): boolean;
}

// One entry per enable() call, so an after-all hook only removes what its own before-all hook added
const active = new Set<ReadonlySet<string>>();

export const MockForwardFeatures: MockForwardFeatures = {
    enable(...features) {
        const enabled = new Set(features);
        before(() => {
            active.add(enabled);
        });
        after(() => {
            active.delete(enabled);
        });
    },

    isEnabled(feature) {
        for (const enabled of active) {
            if (enabled.has(feature)) {
                return true;
            }
        }
        return false;
    },
};
