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

    /**
     * Enable every forward Matter feature for the whole process, outside any suite, until the returned handle is
     * disposed.  For a harness whose entire run tests against peers of the next Matter line; unit tests enable single
     * features with {@link enable} instead.
     */
    enableAll(): Disposable;

    /** Whether a running suite or {@link enableAll} enabled {@link feature}. */
    isEnabled(feature: string): boolean;
}

// One entry per enable() call, so an after-all hook only removes what its own before-all hook added
const active = new Set<ReadonlySet<string>>();

// One entry per enableAll() handle that is not disposed yet
const allEnabled = new Set<Disposable>();

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

    enableAll() {
        const handle: Disposable = {
            [Symbol.dispose]() {
                allEnabled.delete(handle);
            },
        };
        allEnabled.add(handle);
        return handle;
    },

    isEnabled(feature) {
        if (allEnabled.size) {
            return true;
        }
        for (const enabled of active) {
            if (enabled.has(feature)) {
                return true;
            }
        }
        return false;
    },
};
