/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const FEATURE = "mock-forward-features-test";
const DIRECT_FEATURE = "mock-forward-features-direct";

/** The before-all and after-all callbacks one {@link MockForwardFeatures.enable} call registers. */
function registrationOf(feature: string) {
    const hooks = new Array<() => void>();
    const { before, after } = globalThis;
    const capture = (hook: () => void) => {
        hooks.push(hook);
    };
    Object.assign(globalThis, { before: capture, after: capture });
    try {
        MockForwardFeatures.enable(feature);
    } finally {
        Object.assign(globalThis, { before, after });
    }
    expect(hooks.length).equals(2);
    const [enable, disable] = hooks;
    return { enable, disable };
}

describe("MockForwardFeatures", () => {
    describe("in a suite that enables a feature", () => {
        MockForwardFeatures.enable(FEATURE);

        it("reports the feature as enabled", () => {
            expect(MockForwardFeatures.isEnabled(FEATURE)).true;
            expect(MatterHooks?.forwardFeatureEnabled?.(FEATURE)).true;
        });

        describe("in a nested suite that enables it as well", () => {
            MockForwardFeatures.enable(FEATURE);

            it("reports the feature as enabled", () => {
                expect(MockForwardFeatures.isEnabled(FEATURE)).true;
            });
        });

        describe("after the nested suite", () => {
            it("still reports the feature as enabled", () => {
                expect(MockForwardFeatures.isEnabled(FEATURE)).true;
            });
        });
    });

    describe("after the enabling suite", () => {
        it("reports the feature as disabled", () => {
            expect(MockForwardFeatures.isEnabled(FEATURE)).false;
            expect(MatterHooks?.forwardFeatureEnabled?.(FEATURE)).false;
        });
    });

    it("ignores an after-all hook whose own before-all did not run", () => {
        const outer = registrationOf(DIRECT_FEATURE);
        const inner = registrationOf(DIRECT_FEATURE);

        outer.enable();
        try {
            inner.disable();
            expect(MockForwardFeatures.isEnabled(DIRECT_FEATURE)).true;
        } finally {
            outer.disable();
        }
        expect(MockForwardFeatures.isEnabled(DIRECT_FEATURE)).false;
    });

    it("enables every feature while an enableAll() handle is not disposed", () => {
        const outer = MockForwardFeatures.enableAll();
        try {
            {
                using _inner = MockForwardFeatures.enableAll();
                expect(MockForwardFeatures.isEnabled("mock-forward-features-any")).true;
            }
            expect(MatterHooks?.forwardFeatureEnabled?.("mock-forward-features-any")).true;
        } finally {
            outer[Symbol.dispose]();
            outer[Symbol.dispose]();
        }
        expect(MockForwardFeatures.isEnabled("mock-forward-features-any")).false;
    });

    it("reports a feature no suite enabled as disabled", () => {
        expect(MockForwardFeatures.isEnabled("mock-forward-features-other")).false;
    });
});
