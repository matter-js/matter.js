/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type-level tests that document and verify the type contracts for cluster behaviors.
 *
 * Uses the test cluster from cluster-behavior-test-util.ts:
 * - Base component (flags: {}): reqAttr, optAttr?, condAttr?, condOptAttr1?, condOptAttr2?, optList?,
 *   reqEv, optEv?
 * - AwesomeFeatureComponent (flags: { awesome: true }): awesomeSauce, becameAwesome
 *
 * These tests verify compile-time constraints using `satisfies` assertions and the `Match` helper.
 * No runtime assertions needed — this is purely a type-level test.
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ClusterEvents } from "#behavior/cluster/ClusterEvents.js";
import { ClusterState } from "#behavior/cluster/ClusterState.js";
import { ClusterNamespace } from "@matter/types";
import { My, MyClusterTyping, MySchema } from "./cluster-behavior-test-util.js";

type Match<A, B> = A extends B ? true : false;

type NoFeatures = MyClusterTyping;

type WithAwesome = ClusterNamespace.WithSupportedFeatures<MyClusterTyping, { awesome: true }>;

const MyBehavior = ClusterBehavior.for(My, MySchema);

describe("ClusterBehaviorSemantics", () => {
    // -------------------------------------------------------------------------
    // 1. State types (ClusterState.Type) — feature-filtered
    // -------------------------------------------------------------------------

    describe("state types", () => {
        it("base required attr is present and required", () => {
            type S = ClusterState.Type<NoFeatures>;
            ({}) as S satisfies { reqAttr: string };
            ({}) as Match<S, { reqAttr: string }> satisfies true;
        });

        it("base optional attr is present and optional", () => {
            type S = ClusterState.Type<NoFeatures>;
            undefined satisfies S["optAttr"];
            true satisfies S["optAttr"];
        });

        it("feature attr is absent without feature", () => {
            type S = ClusterState.Type<NoFeatures>;
            ({}) as Match<S, { awesomeSauce: number }> satisfies false;
        });

        it("feature attr is present and required with feature", () => {
            type S = ClusterState.Type<WithAwesome>;
            ({}) as S satisfies { awesomeSauce: number };
            ({}) as Match<S, { awesomeSauce: number }> satisfies true;
        });

        it("base required attr is writable (no readonly)", () => {
            type S = ClusterState.Type<NoFeatures>;
            // If reqAttr were readonly, this assignment would fail
            const s = {} as S;
            s.reqAttr = "test";
        });
    });

    // -------------------------------------------------------------------------
    // 2. Complete state (ClusterState.Complete) — all components
    // -------------------------------------------------------------------------

    describe("complete state", () => {
        it("base required attr is present and required", () => {
            type S = ClusterState.Complete<NoFeatures>;
            ({}) as S satisfies { reqAttr: string };
        });

        it("base optional attr is present and optional", () => {
            type S = ClusterState.Complete<NoFeatures>;
            undefined satisfies S["optAttr"];
        });

        it("feature attr is present and optional (feature not guaranteed)", () => {
            type S = ClusterState.Complete<NoFeatures>;
            undefined satisfies S["awesomeSauce"];
        });
    });

    // -------------------------------------------------------------------------
    // 3. Attribute change observables (ClusterEvents.Properties)
    // -------------------------------------------------------------------------

    describe("attribute change observables", () => {
        it("base required attr $Changed/$Changing are present and required", () => {
            type E = ClusterEvents.Properties<NoFeatures>;
            ({}) as E satisfies { reqAttr$Changed: ClusterEvents.ChangedObservable<string> };
            ({}) as E satisfies { reqAttr$Changing: ClusterEvents.ChangingObservable<string> };
        });

        it("base optional attr $Changed/$Changing are present and optional", () => {
            type E = ClusterEvents.Properties<NoFeatures>;
            undefined satisfies E["optAttr$Changed"];
            undefined satisfies E["optAttr$Changing"];
        });

        it("feature attr observables are absent without feature", () => {
            type E = ClusterEvents.Properties<NoFeatures>;
            ({}) as Match<E, { awesomeSauce$Changed: any }> satisfies false;
            ({}) as Match<E, { awesomeSauce$Changing: any }> satisfies false;
        });

        it("feature attr observables are present with feature", () => {
            type E = ClusterEvents.Properties<WithAwesome>;
            ({}) as E satisfies { awesomeSauce$Changed: ClusterEvents.ChangedObservable<number> };
            ({}) as E satisfies { awesomeSauce$Changing: ClusterEvents.ChangingObservable<number> };
        });
    });

    // -------------------------------------------------------------------------
    // 4. Event observables (ClusterEvents.Properties)
    // -------------------------------------------------------------------------

    describe("event observables", () => {
        it("base required event is present and required", () => {
            type E = ClusterEvents.Properties<NoFeatures>;
            ({}) as Match<E, { reqEv: {} }> satisfies true;
        });

        it("base optional event is present and optional", () => {
            type E = ClusterEvents.Properties<NoFeatures>;
            undefined satisfies E["optEv"];
        });

        it("feature event is absent without feature", () => {
            type E = ClusterEvents.Properties<NoFeatures>;
            ({}) as Match<E, { becameAwesome: any }> satisfies false;
        });

        it("feature event is present with feature", () => {
            type E = ClusterEvents.Properties<WithAwesome>;
            ({}) as Match<E, { becameAwesome: {} }> satisfies true;
        });
    });

    // -------------------------------------------------------------------------
    // 5. Complete events — all events from all components
    // -------------------------------------------------------------------------

    describe("complete events", () => {
        it("all attr observables are present", () => {
            type E = ClusterEvents.Complete<NoFeatures>;
            ({}) as E satisfies {
                reqAttr$Changed: ClusterEvents.ChangedObservable<string>;
                awesomeSauce$Changed: ClusterEvents.ChangedObservable<number>;
            };
        });

        it("all event observables are present", () => {
            type E = ClusterEvents.Complete<NoFeatures>;
            ({}) as E satisfies { reqEv: {}; becameAwesome: {} };
        });
    });

    // -------------------------------------------------------------------------
    // 6. enable() / alter() overrides
    // -------------------------------------------------------------------------

    describe("enable overrides", () => {
        it("optional attr forced to required via enable()", () => {
            type WithEnabled = ClusterNamespace.WithEnabledAttributes<NoFeatures, "optAttr">;
            type S = ClusterState.Type<WithEnabled>;
            // optAttr is now required (not optional)
            ({}) as Match<S, { optAttr: boolean }> satisfies true;
        });

        it("enabled attr $Changed/$Changing are required", () => {
            type WithEnabled = ClusterNamespace.WithEnabledAttributes<NoFeatures, "optAttr">;
            type E = ClusterEvents.Properties<WithEnabled>;
            // Check presence and required-ness (not observable type — variance makes that complex)
            ({}) as Match<E, { optAttr$Changed: {} }> satisfies true;
            ({}) as Match<E, { optAttr$Changing: {} }> satisfies true;
        });
    });

    // -------------------------------------------------------------------------
    // 7. Behavior integration
    // -------------------------------------------------------------------------

    describe("behavior integration", () => {
        it("behavior state has correct types", () => {
            type S = InstanceType<typeof MyBehavior>["state"];
            ({}) as S satisfies { reqAttr: string };
            undefined satisfies S["optAttr"];
        });

        it("behavior events have correct types", () => {
            type E = InstanceType<typeof MyBehavior>["events"];
            ({}) as E satisfies { reqAttr$Changed: ClusterEvents.ChangedObservable<string> };
        });
    });
});
