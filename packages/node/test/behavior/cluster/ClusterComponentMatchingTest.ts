/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure type-level tests for component matching logic.
 *
 * These tests verify that the `S extends C["flags"]` pattern in {@link ClusterInterface.ApplicableComponents}
 * correctly matches components based on feature flags, including negated flags like `{ offOnly: false }`.
 *
 * The test namespace mimics the OnOff cluster pattern:
 * - Base component: always present (flags: {})
 * - FeatureA component: present when featureA is selected (flags: { featureA: true })
 * - NotFeatureB component: present when featureB is NOT selected (flags: { featureB: false })
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ClusterEvents } from "#behavior/cluster/ClusterEvents.js";
import { ClusterInterface } from "#behavior/cluster/ClusterInterface.js";
import { ClusterState } from "#behavior/cluster/ClusterState.js";
import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

// ---------------------------------------------------------------------------
// Test namespace — mirrors OnOff's shape (Base / Lighting / NotOffOnly)
// ---------------------------------------------------------------------------

interface BaseMethods {
    baseCmd(): void;
}

interface FeatureAMethods {
    featureACmd(): void;
}

interface NotFeatureBMethods {
    notFeatureBCmd(): void;
}

/**
 * Mimics the unified Components tuple:
 *   { flags: {}, commands: Base, attributes: ... }
 *   { flags: { featureA: true }, commands: FeatureA }
 *   { flags: { featureB: false }, commands: NotFeatureB }
 */
type TestComponents = [
    { flags: {}; attributes: { attr1: string }; commands: BaseMethods },
    { flags: { featureA: true }; commands: FeatureAMethods },
    { flags: { featureB: false }; commands: NotFeatureBMethods },
];

/**
 * Full typing interface (like OnOff extends ClusterTyping).
 */
interface TestTyping extends ClusterTyping {
    Attributes: { attr1: string };
    Commands: BaseMethods & FeatureAMethods & NotFeatureBMethods;
    Features: "FeatureA" | "FeatureB";
    Components: TestComponents;
}

// ---------------------------------------------------------------------------
// 1. SupportedFeaturesOf — defaults to all-false when no SupportedFeatures
// ---------------------------------------------------------------------------

describe("ClusterComponentMatching", () => {
    describe("SupportedFeaturesOf", () => {
        it("defaults to all-false when SupportedFeatures is absent", () => {
            type S = ClusterNamespace.SupportedFeaturesOf<TestTyping>;
            ({}) as S satisfies { featureA: false; featureB: false };
            ({}) as { featureA: false; featureB: false } satisfies S;
        });

        it("returns SupportedFeatures when present", () => {
            type WithA = ClusterNamespace.WithSupportedFeatures<TestTyping, { featureA: true; featureB: false }>;
            type S = ClusterNamespace.SupportedFeaturesOf<WithA>;
            ({}) as S satisfies { featureA: true; featureB: false };
            ({}) as { featureA: true; featureB: false } satisfies S;
        });

        it("defaults to {} when no Features union", () => {
            type S = ClusterNamespace.SupportedFeaturesOf<ClusterTyping>;
            ({}) as S satisfies {};
        });
    });

    // ---------------------------------------------------------------------------
    // 2. FeaturesAsFlags — selected features true, others false
    // ---------------------------------------------------------------------------

    describe("FeaturesAsFlags", () => {
        it("sets selected features to true, others to false", () => {
            type F = ClusterNamespace.FeaturesAsFlags<TestTyping, readonly ["FeatureA"]>;
            ({}) as F satisfies { featureA: true; featureB: false };
            ({}) as { featureA: true; featureB: false } satisfies F;
        });

        it("sets all features false when none selected", () => {
            type F = ClusterNamespace.FeaturesAsFlags<TestTyping, readonly []>;
            ({}) as F satisfies { featureA: false; featureB: false };
            ({}) as { featureA: false; featureB: false } satisfies F;
        });

        it("sets all features true when all selected", () => {
            type F = ClusterNamespace.FeaturesAsFlags<TestTyping, readonly ["FeatureA", "FeatureB"]>;
            ({}) as F satisfies { featureA: true; featureB: true };
            ({}) as { featureA: true; featureB: true } satisfies F;
        });
    });

    // ---------------------------------------------------------------------------
    // 3. ApplicableComponents — the core matching logic
    // ---------------------------------------------------------------------------

    describe("ApplicableComponents", () => {
        it("matches unconditional (flags: {}) always", () => {
            // With no features selected, {} extends {} is true
            type Result = ClusterInterface.ApplicableComponents<TestComponents, { featureA: false; featureB: false }>;
            ({}) as Result[0]["commands"] satisfies BaseMethods;
        });

        it("matches negated flag when feature is false", () => {
            // { featureA: false, featureB: false } extends { featureB: false } → YES
            type S = { featureA: false; featureB: false };
            type Result = ClusterInterface.ApplicableComponents<TestComponents, S>;
            // Should include Base and NotFeatureB
            ({}) as Result satisfies [
                { flags: {}; commands: BaseMethods },
                { flags: { featureB: false }; commands: NotFeatureBMethods },
            ];
        });

        it("excludes negated flag when feature is true", () => {
            // { featureA: true, featureB: true } extends { featureB: false } → NO
            type S = { featureA: true; featureB: true };
            type Result = ClusterInterface.ApplicableComponents<TestComponents, S>;
            // Should include Base and FeatureA, but NOT NotFeatureB
            ({}) as Result satisfies [
                { flags: {}; commands: BaseMethods },
                { flags: { featureA: true }; commands: FeatureAMethods },
            ];
        });

        it("matches featureA + negated featureB together", () => {
            // { featureA: true, featureB: false } — like OnOff with Lighting but not OffOnly
            type S = { featureA: true; featureB: false };
            type Result = ClusterInterface.ApplicableComponents<TestComponents, S>;
            // Should include all three: Base, FeatureA, NotFeatureB
            ({}) as Result satisfies [
                { flags: {}; commands: BaseMethods },
                { flags: { featureA: true }; commands: FeatureAMethods },
                { flags: { featureB: false }; commands: NotFeatureBMethods },
            ];
        });

        it("does NOT match when flags are missing (not explicit false)", () => {
            // If S = {}, then {} extends { featureB: false } → NO (featureB is absent)
            type Result = ClusterInterface.ApplicableComponents<TestComponents, {}>;
            // Should include ONLY Base
            ({}) as Result satisfies [{ flags: {}; commands: BaseMethods }];
        });
    });

    // ---------------------------------------------------------------------------
    // 4. InterfaceMethodsOf — resolves to the union of matched component methods
    // ---------------------------------------------------------------------------

    describe("InterfaceMethodsOf", () => {
        it("includes all methods when all components match", () => {
            type S = { featureA: true; featureB: false };
            type M = ClusterInterface.InterfaceMethodsOf<TestTyping, S>;
            ({}) as keyof M satisfies "baseCmd" | "featureACmd" | "notFeatureBCmd";
            ({}) as "baseCmd" | "featureACmd" | "notFeatureBCmd" satisfies keyof M;
        });

        it("excludes featureA methods when featureA is false", () => {
            type S = { featureA: false; featureB: false };
            type M = ClusterInterface.InterfaceMethodsOf<TestTyping, S>;
            ({}) as keyof M satisfies "baseCmd" | "notFeatureBCmd";
            ({}) as "baseCmd" | "notFeatureBCmd" satisfies keyof M;
        });

        it("excludes notFeatureB methods when featureB is true", () => {
            type S = { featureA: true; featureB: true };
            type M = ClusterInterface.InterfaceMethodsOf<TestTyping, S>;
            ({}) as keyof M satisfies "baseCmd" | "featureACmd";
            ({}) as "baseCmd" | "featureACmd" satisfies keyof M;
        });
    });

    // ---------------------------------------------------------------------------
    // 5. MethodsOf — the top-level API that extracts features from the typing
    // ---------------------------------------------------------------------------

    describe("MethodsOf", () => {
        it("uses SupportedFeaturesOf default (all-false) when no features selected", () => {
            // TestTyping has no SupportedFeatures → defaults to all-false
            // All-false means Base + NotFeatureB match
            type M = ClusterInterface.MethodsOf<TestTyping>;
            ({}) as keyof M satisfies "baseCmd" | "notFeatureBCmd";
            ({}) as "baseCmd" | "notFeatureBCmd" satisfies keyof M;
        });

        it("includes featureA methods after WithSupportedFeatures", () => {
            type WithA = ClusterNamespace.WithSupportedFeatures<TestTyping, { featureA: true; featureB: false }>;
            type M = ClusterInterface.MethodsOf<WithA>;
            ({}) as keyof M satisfies "baseCmd" | "featureACmd" | "notFeatureBCmd";
            ({}) as "baseCmd" | "featureACmd" | "notFeatureBCmd" satisfies keyof M;
        });
    });

    // ---------------------------------------------------------------------------
    // 6. WithSupportedFeatures — type narrowing preserves ClusterTyping
    // ---------------------------------------------------------------------------

    describe("WithSupportedFeatures", () => {
        it("preserves all original typing fields", () => {
            type WithA = ClusterNamespace.WithSupportedFeatures<TestTyping, { featureA: true; featureB: false }>;
            // Should still have Attributes, Commands, Features
            ({}) as WithA["Attributes"] satisfies { attr1: string };
            ({}) as WithA["Features"] satisfies "FeatureA" | "FeatureB";
        });

        it("satisfies ClusterTyping constraint", () => {
            type WithA = ClusterNamespace.WithSupportedFeatures<TestTyping, { featureA: true; featureB: false }>;
            ({}) as WithA satisfies ClusterTyping;
        });
    });

    // ---------------------------------------------------------------------------
    // 7. State (NsAttributeProperties) — mandatory/optional from attribute components
    // ---------------------------------------------------------------------------

    describe("ClusterState attribute properties", () => {
        /**
         * Typing with two attribute components:
         * - Base: attr1 is mandatory (always)
         * - FeatureA: attr2 is mandatory when featureA is true
         */
        interface StateTestTyping extends ClusterTyping {
            Attributes: { attr1: string; attr2: number };
            Features: "FeatureA" | "FeatureB";
            Components: [
                { flags: {}; attributes: { attr1: string } },
                { flags: { featureA: true }; attributes: { attr2: number } },
            ];
        }

        it("makes base attributes mandatory without features", () => {
            type S = ClusterState.Type<StateTestTyping>;
            ({}) as S satisfies { attr1: string };
        });

        it("makes feature attributes absent without features", () => {
            type S = ClusterState.Type<StateTestTyping>;
            // attr2 should be absent (featureA not selected) — not optional, absent
            type Match<A, B> = A extends B ? true : false;
            ({}) as Match<S, { attr2: number }> satisfies false;
        });

        it("makes feature attributes mandatory when feature selected", () => {
            type WithA = ClusterNamespace.WithSupportedFeatures<StateTestTyping, { featureA: true; featureB: false }>;
            type S = ClusterState.Type<WithA>;
            ({}) as S satisfies { attr1: string; attr2: number };
        });
    });

    // ---------------------------------------------------------------------------
    // 8. Events — attribute change observables from attribute components
    // ---------------------------------------------------------------------------

    describe("ClusterEvents attribute change observables", () => {
        interface EventTestTyping extends ClusterTyping {
            Attributes: { attr1: string; attr2: number };
            Features: "FeatureA";
            Components: [
                { flags: {}; attributes: { attr1: string } },
                { flags: { featureA: true }; attributes: { attr2: number } },
            ];
        }

        it("includes base attribute change events", () => {
            type E = ClusterEvents.Properties<EventTestTyping>;
            ({}) as E satisfies { attr1$Changed: ClusterEvents.ChangedObservable<string> };
            ({}) as E satisfies { attr1$Changing: ClusterEvents.ChangingObservable<string> };
        });

        it("makes feature attribute events absent without features", () => {
            type E = ClusterEvents.Properties<EventTestTyping>;
            // attr2$Changed should be absent (featureA not selected) — not optional, absent
            type Match<A, B> = A extends B ? true : false;
            ({}) as Match<E, { attr2$Changed: any }> satisfies false;
        });

        it("makes feature attribute events mandatory when feature selected", () => {
            type WithA = ClusterNamespace.WithSupportedFeatures<EventTestTyping, { featureA: true }>;
            type E = ClusterEvents.Properties<WithA>;
            ({}) as E satisfies { attr2$Changed: ClusterEvents.ChangedObservable<number> };
        });
    });

    // ---------------------------------------------------------------------------
    // 9. End-to-end: .with() chain produces correct methods/state/events
    // ---------------------------------------------------------------------------

    describe("withFeatures end-to-end", () => {
        /**
         * Mimics the OnOff server pattern:
         * - BehaviorBase = ClusterBehavior.for(NS)       // no features
         * - LogicBase = BehaviorBase.with("FeatureA")     // adds FeatureA
         * - Server extends LogicBase { override featureACmd() {} }
         * - ExportedServer extends Server.with()          // resets to no features
         *
         * The key question: can Server override featureACmd?
         */

        it("allows override of feature-conditional methods after .with()", () => {
            // This is a compile-time test.  If the type of WithA's instance
            // doesn't include featureACmd, the override will fail with TS4113.
            type WithA = ClusterNamespace.WithSupportedFeatures<TestTyping, { featureA: true; featureB: false }>;
            type M = ClusterInterface.MethodsOf<WithA>;
            ({}) as keyof M satisfies "baseCmd" | "featureACmd" | "notFeatureBCmd";
        });

        it("includes negated-flag methods in default (no features) typing", () => {
            // This mirrors the OnOff NotOffOnly pattern.
            // When SupportedFeatures defaults to all-false, { offOnly: false } should match.
            type M = ClusterInterface.MethodsOf<TestTyping>;
            // notFeatureBCmd maps to { featureB: false } which should match { featureA: false, featureB: false }
            ({}) as M satisfies { notFeatureBCmd(): void };
        });
    });

    // ---------------------------------------------------------------------------
    // 10. Real-world: OnOff cluster type-level component matching
    // ---------------------------------------------------------------------------

    describe("OnOff real-world component matching", () => {
        it("resolves OnOff SupportedFeaturesOf to all-false defaults", () => {
            type S = ClusterNamespace.SupportedFeaturesOf<OnOff>;
            ({}) as S satisfies { lighting: false; deadFrontBehavior: false; offOnly: false };
        });

        it("with(Lighting) produces correct feature flags", () => {
            type F = ClusterNamespace.FeaturesAsFlags<OnOff, readonly ["Lighting"]>;
            ({}) as F satisfies { lighting: true; deadFrontBehavior: false; offOnly: false };
        });

        it("base OnOff includes Base and NotOffOnly commands (not Lighting)", () => {
            // OnOff with no features selected defaults to all-false.
            // { lighting: false, ..., offOnly: false } extends { offOnly: false } → YES
            type M = ClusterInterface.MethodsOf<OnOff>;
            ({}) as M satisfies { off(): MaybePromise; on(): MaybePromise; toggle(): MaybePromise };
        });

        it("OnOff with Lighting includes all three command groups", () => {
            type WithLighting = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type M = ClusterInterface.MethodsOf<WithLighting>;
            // Base: off
            // Lighting: offWithEffect, onWithRecallGlobalScene, onWithTimedOff
            // NotOffOnly: on, toggle (offOnly is false)
            ({}) as M satisfies {
                off(): MaybePromise;
                on(): MaybePromise;
                toggle(): MaybePromise;
                offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise;
                onWithRecallGlobalScene(): MaybePromise;
                onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise;
            };
        });

        it("OnOff with Lighting has onOff and globalSceneControl as mandatory attributes", () => {
            type WithLighting = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type S = ClusterState.Type<WithLighting>;
            ({}) as S satisfies { onOff: boolean; globalSceneControl: boolean };
        });

        it("OnOff base has onOff$Changed event", () => {
            // Even without features, onOff is mandatory (base component), so onOff$Changed should exist
            type E = ClusterEvents.Properties<OnOff>;
            ({}) as E satisfies { onOff$Changed: ClusterEvents.ChangedObservable<boolean> };
        });

        it("OnOff with Lighting has onOff$Changed event", () => {
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type E = ClusterEvents.Properties<N>;
            ({}) as E satisfies { onOff$Changed: ClusterEvents.ChangedObservable<boolean> };
        });

        it("full ClusterEvents with OnOff has onOff$Changed", () => {
            // This tests the Omit + re-add pattern in ClusterEvents<N, BaseT>
            type OnOffBehaviorType = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type E = ClusterEvents<N, OnOffBehaviorType>;
            ({}) as E satisfies { onOff$Changed: ClusterEvents.ChangedObservable<boolean> };
        });

        it("ClusterEvents with actual OnOffBehavior has onOff$Changed", () => {
            // Use the real OnOffBehavior type as BaseT, matching how OnOffServer resolves
            const OnOffBeh = ClusterBehavior.for(OnOff);
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type E = ClusterEvents<N, typeof OnOffBeh>;
            ({}) as E satisfies { onOff$Changed: ClusterEvents.ChangedObservable<boolean> };
        });

        it("OnOff.Instance with Lighting includes Lighting methods", () => {
            // This is what ClusterBehavior.Instance<B, N> resolves to for the methods portion.
            // When N = WithSupportedFeatures<OnOff, {lighting:true, ...}>, MethodsOf should include
            // all three command groups.
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type Methods = ClusterInterface.MethodsOf<N>;
            ({}) as "offWithEffect" satisfies keyof Methods;
            ({}) as "onWithRecallGlobalScene" satisfies keyof Methods;
            ({}) as "onWithTimedOff" satisfies keyof Methods;
            ({}) as "off" satisfies keyof Methods;
            ({}) as "on" satisfies keyof Methods;
            ({}) as "toggle" satisfies keyof Methods;
        });

        it("OnOff.Instance without features still includes on/toggle (NotOffOnly)", () => {
            // The base OnOff typing has no SupportedFeatures, which defaults to all-false.
            // The NotOffOnly component has { offOnly: false }, which matches.
            type Methods = ClusterInterface.MethodsOf<OnOff>;
            ({}) as "on" satisfies keyof Methods;
            ({}) as "toggle" satisfies keyof Methods;
            ({}) as "off" satisfies keyof Methods;
        });

        it("OnOff.Instance without features does NOT include Lighting methods", () => {
            type Methods = ClusterInterface.MethodsOf<OnOff>;
            type HasOffWithEffect = "offWithEffect" extends keyof Methods ? true : false;
            ({}) as HasOffWithEffect satisfies false;
        });
    });

    // ---------------------------------------------------------------------------
    // 11. High-level: ClusterBehavior.Type and Instance through for()/with()
    //
    // These test the full pipeline that the generated behaviors use, not just
    // the utility types in isolation.
    // ---------------------------------------------------------------------------

    describe("ClusterBehavior.Type pipeline", () => {
        it("typeof ClusterBehavior satisfies ClusterBehavior.Type", () => {
            ({}) as typeof ClusterBehavior satisfies ClusterBehavior.Type;
        });

        it("for(OnOff) produces a Type", () => {
            // This is the pattern: const XxxBehavior = ClusterBehavior.for(Xxx);
            type ForResult = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            ({}) as ForResult satisfies ClusterBehavior.Type;
        });

        it("for(OnOff) instance has base + NotOffOnly methods", () => {
            type ForResult = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            type Inst = InstanceType<ForResult>;
            ({}) as Inst satisfies { off(): MaybePromise; on(): MaybePromise; toggle(): MaybePromise };
        });

        it("for(OnOff) instance has onOff in state", () => {
            type ForResult = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            type Inst = InstanceType<ForResult>;
            ({}) as Inst satisfies { state: { onOff: boolean } };
        });

        it("for(OnOff) instance has onOff$Changed event", () => {
            type ForResult = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            type Inst = InstanceType<ForResult>;
            ({}) as Inst satisfies { events: { onOff$Changed: ClusterEvents.ChangedObservable<boolean> } };
        });

        it("Type with Lighting features has Lighting methods on instance", () => {
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type WithLighting = ClusterBehavior.Type<typeof ClusterBehavior, N, typeof OnOff>;
            type Inst = InstanceType<WithLighting>;
            ({}) as Inst satisfies {
                off(): MaybePromise;
                on(): MaybePromise;
                toggle(): MaybePromise;
                offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise;
                onWithRecallGlobalScene(): MaybePromise;
                onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise;
            };
        });

        it("Type with Lighting features has Lighting attributes mandatory in state", () => {
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type WithLighting = ClusterBehavior.Type<typeof ClusterBehavior, N, typeof OnOff>;
            type Inst = InstanceType<WithLighting>;
            ({}) as Inst satisfies {
                state: { onOff: boolean; globalSceneControl: boolean; onTime: number; offWaitTime: number };
            };
        });

        it("Instance type for for(OnOff).with(Lighting) supports Lighting overrides", () => {
            // This is the OnOffServer pattern:
            //   const OnOffLogicBase = OnOffBehavior.with(OnOff.Feature.Lighting);
            //   class OnOffBaseServer extends OnOffLogicBase { override offWithEffect() {} }
            //
            // For the override to work, the Instance type must include offWithEffect as a method.
            // We test this by checking the Instance type directly.
            type Base = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            // withFeatures returns Type<Base, WithSupportedFeatures<OnOff, flags>>
            type WithLighting = ClusterBehavior.Type<Base, N>;
            type Inst = InstanceType<WithLighting>;

            // All six commands should be present
            ({}) as Inst satisfies { offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise };
            ({}) as Inst satisfies { onWithRecallGlobalScene(): MaybePromise };
            ({}) as Inst satisfies { onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise };
            ({}) as Inst satisfies { off(): MaybePromise };
            ({}) as Inst satisfies { on(): MaybePromise };
            ({}) as Inst satisfies { toggle(): MaybePromise };
        });

        it("Instance type for for(OnOff).with() (no features) has Base+NotOffOnly", () => {
            // After class XxxServer extends XxxBaseServer.with() {} the type should have
            // base + negated-flag commands but NOT feature-conditional commands.
            type Base = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;
            type N = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: false; deadFrontBehavior: false; offOnly: false }
            >;
            type Reset = ClusterBehavior.Type<Base, N>;
            type Inst = InstanceType<Reset>;

            // Base + NotOffOnly should be present
            ({}) as Inst satisfies { off(): MaybePromise; on(): MaybePromise; toggle(): MaybePromise };

            // Lighting should NOT be present (type-level)
            type HasOffWithEffect = Inst extends { offWithEffect: any } ? true : false;
            ({}) as HasOffWithEffect satisfies false;
        });
    });

    // ---------------------------------------------------------------------------
    // 12. Server pattern: .with(features) enables overrides, .with()/.for() reverts for export
    //
    // The server implementation pattern:
    //   1. const Base = Behavior.with(Feature.A, Feature.B);   // enable features
    //   2. class BaseServer extends Base { override cmdA() {} } // override is valid
    //   3. class Server extends BaseServer.with() {}            // revert for export
    //
    // Step 2 overrides are valid because step 1 enabled the features.
    // Step 3 reverts features so consumers can call Server.with(...) to choose.
    // After step 3, the feature-conditional methods correctly disappear from the
    // exported type (consumers must .with() to get them back).
    // ---------------------------------------------------------------------------

    describe("Server implementation pattern", () => {
        /**
         * Namespace where ALL commands are feature-conditional (like ColorControl).
         */
        interface AllConditionalTyping extends ClusterTyping {
            Attributes: { baseAttr: string };
            Commands: { cmdA(): void; cmdB(): void };
            Features: "FeatureA" | "FeatureB";
            Components: [
                { flags: {}; attributes: { baseAttr: string } },
                { flags: { featureA: true }; commands: { cmdA(): void } },
                { flags: { featureB: true }; commands: { cmdB(): void } },
            ];
        }

        it("with(features) enables feature-conditional methods for override", () => {
            // Step 1: Enable features — this is what makes override legal in step 2
            type N = ClusterNamespace.WithSupportedFeatures<AllConditionalTyping, { featureA: true; featureB: true }>;
            type T = ClusterBehavior.Type<typeof ClusterBehavior, N>;
            type Inst = InstanceType<T>;
            ({}) as Inst satisfies { cmdA(): void; cmdB(): void };
        });

        it("without features, conditional methods are correctly absent", () => {
            // Plain namespace: SupportedFeaturesOf defaults to all-false, so no
            // feature-conditional components match.  This is correct — consumer
            // must call .with() to get them.
            type T = ClusterBehavior.Type<typeof ClusterBehavior, AllConditionalTyping>;
            type Inst = InstanceType<T>;
            type HasCmdA = Inst extends { cmdA: any } ? true : false;
            type HasCmdB = Inst extends { cmdB: any } ? true : false;
            ({}) as HasCmdA satisfies false;
            ({}) as HasCmdB satisfies false;
        });

        it("re-basing after .with(features) correctly removes conditional methods", () => {
            // Step 1: Enable all features
            type N1 = ClusterNamespace.WithSupportedFeatures<AllConditionalTyping, { featureA: true; featureB: true }>;
            type WithAll = ClusterBehavior.Type<typeof ClusterBehavior, N1>;

            // Verify methods are present with features enabled
            type InstWithAll = InstanceType<WithAll>;
            ({}) as InstWithAll satisfies { cmdA(): void; cmdB(): void };

            // Step 3: Re-base removes features — conditional methods correctly disappear
            type Rebased = ClusterBehavior.Type<WithAll, AllConditionalTyping>;
            type InstRebased = InstanceType<Rebased>;
            type RebasedHasCmdA = InstRebased extends { cmdA: any } ? true : false;
            type RebasedHasCmdB = InstRebased extends { cmdB: any } ? true : false;
            ({}) as RebasedHasCmdA satisfies false;
            ({}) as RebasedHasCmdB satisfies false;
        });

        it("OnOff: .with(Lighting) enables Lighting methods for override", () => {
            // This is the OnOffServer step 1:
            //   const OnOffLogicBase = OnOffBehavior.with(OnOff.Feature.Lighting);
            // Lighting methods should be present on the Instance type.
            type NLit = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type WithLit = ClusterBehavior.Type<typeof ClusterBehavior, NLit, typeof OnOff>;
            type InstLit = InstanceType<WithLit>;

            // All six commands should be present
            ({}) as InstLit satisfies {
                off(): MaybePromise;
                on(): MaybePromise;
                toggle(): MaybePromise;
                offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise;
                onWithRecallGlobalScene(): MaybePromise;
                onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise;
            };
        });

        it("OnOff: .with() return type narrows N correctly", () => {
            // Simulate what OnOffBehavior.with(OnOff.Feature.Lighting) does:
            // It calls the `with` method on Type, which returns
            //   Type<This, WithSupportedFeatures<NonNullable<This["cluster"]["Typing"]>, FeaturesAsFlags<..., F>>>
            //
            // This test verifies the return type of `with` by manually resolving
            // the type parameters the way TypeScript should.
            type OnOffBehaviorType = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;

            // Simulate: OnOffBehavior.with("Lighting")
            // This = OnOffBehaviorType
            // FeaturesT = readonly ["Lighting"]
            // NonNullable<This["cluster"]["Typing"]> = NonNullable<typeof OnOff["Typing"]> = OnOff
            // FeaturesAsFlags<OnOff, ["Lighting"]> = { lighting: true; deadFrontBehavior: false; offOnly: false }
            // Return: Type<OnOffBehaviorType, WithSupportedFeatures<OnOff, { lighting: true; ... }>>
            type Flags = ClusterNamespace.FeaturesAsFlags<OnOff, readonly ["Lighting"]>;
            type N = ClusterNamespace.WithSupportedFeatures<OnOff, Flags>;
            type WithLightingType = ClusterBehavior.Type<OnOffBehaviorType, N>;
            type Inst = InstanceType<WithLightingType>;

            // The Instance type must include Lighting methods — this is what
            // makes `override offWithEffect()` legal in OnOffBaseServer.
            ({}) as Inst satisfies {
                off(): MaybePromise;
                on(): MaybePromise;
                toggle(): MaybePromise;
                offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise;
                onWithRecallGlobalScene(): MaybePromise;
                onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise;
            };
        });

        it("OnOff: calling with() through ClusterBehavior.Type interface", () => {
            // This simulates the ACTUAL call: OnOffBehavior.with(OnOff.Feature.Lighting)
            // OnOffBehavior's type is ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>
            // Calling .with("Lighting") should resolve through the Type interface's with method.
            type OnOffBehaviorType = ClusterBehavior.Type<typeof ClusterBehavior, OnOff, typeof OnOff>;

            // Verify the
            // Type interface's `with` return type resolves correctly by constructing
            // the same type that `with` declares it returns.
            type ExpectedN = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                ClusterNamespace.FeaturesAsFlags<OnOff, readonly ["Lighting"]>
            >;
            type ExpectedReturn = ClusterBehavior.Type<OnOffBehaviorType, ExpectedN>;
            type Inst = InstanceType<ExpectedReturn>;

            // Verify the Instance includes Lighting methods
            ({}) as Inst satisfies { offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise };
        });

        it("for() return type has correct Typing", () => {
            // Verify that ClusterBehavior.for(OnOff) produces a Type whose
            // cluster.Typing resolves to OnOff
            const OnOffBeh = ClusterBehavior.for(OnOff);
            type T = typeof OnOffBeh;
            type Cluster = T["cluster"];
            type Typing = NonNullable<Cluster["Typing"]>;

            // Typing should be OnOff
            ({}) as Typing satisfies OnOff;
            ({}) as OnOff satisfies Typing;

            // FeatureSelection should allow "Lighting"
            type Sel = ClusterNamespace.FeatureSelection<Typing>;
            ({}) as readonly ["Lighting"] satisfies Sel;
        });

        it("FeaturesAsFlags with string literal", () => {
            type F = ClusterNamespace.FeaturesAsFlags<OnOff, readonly ["Lighting"]>;
            ({}) as F satisfies { lighting: true; deadFrontBehavior: false; offOnly: false };
        });

        it("FeaturesAsFlags with enum value", () => {
            // String enum values are nominally typed in TypeScript.
            // FeaturesAsFlags uses `${F[number]}` to coerce enum types to their
            // string representation for comparison.
            type F = ClusterNamespace.FeaturesAsFlags<OnOff, readonly [OnOff.Feature.Lighting]>;
            ({}) as F satisfies { lighting: true; deadFrontBehavior: false; offOnly: false };
        });

        it("OnOff: actual .with() call narrows type correctly", () => {
            const OnOffBeh = ClusterBehavior.for(OnOff);
            const WithLighting = OnOffBeh.with(OnOff.Feature.Lighting);
            type Inst = InstanceType<typeof WithLighting>;

            ({}) as Inst satisfies {
                off(): MaybePromise;
                on(): MaybePromise;
                toggle(): MaybePromise;
                offWithEffect(request: OnOff.OffWithEffectRequest): MaybePromise;
                onWithRecallGlobalScene(): MaybePromise;
                onWithTimedOff(request: OnOff.OnWithTimedOffRequest): MaybePromise;
            };
        });

        it("OnOff: actual .with() then class override works", () => {
            const OnOffBeh = ClusterBehavior.for(OnOff);
            const WithLighting = OnOffBeh.with(OnOff.Feature.Lighting);

            void class extends WithLighting {
                override off() {}
                override on() {}
                override toggle() {}
                override offWithEffect() {}
                override onWithRecallGlobalScene() {}
                override onWithTimedOff() {}
            };
        });

        it("OnOff: after re-basing, Lighting methods correctly disappear", () => {
            type NLit = ClusterNamespace.WithSupportedFeatures<
                OnOff,
                { lighting: true; deadFrontBehavior: false; offOnly: false }
            >;
            type WithLit = ClusterBehavior.Type<typeof ClusterBehavior, NLit, typeof OnOff>;

            // Re-base on plain OnOff
            type Rebased = ClusterBehavior.Type<WithLit, OnOff, typeof OnOff>;
            type InstRebased = InstanceType<Rebased>;

            // Lighting methods correctly disappear (consumer must .with(Lighting) to get them)
            type HasOffWithEffect = InstRebased extends { offWithEffect: any } ? true : false;
            ({}) as HasOffWithEffect satisfies false;

            // Base + NotOffOnly methods are still present
            ({}) as InstRebased satisfies { off(): MaybePromise; on(): MaybePromise; toggle(): MaybePromise };
        });
    });
});
