/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterType } from "#cluster/ClusterType.js";
import { ClusterComposer, IllegalClusterError } from "#cluster/mutation/ClusterComposer.js";
import { OnOff } from "#clusters/on-off.js";
import {
    ELEMENTS2,
    Elements1ish,
    Elements2ish,
    TestBase,
    TestComposite,
    expectElementCounts,
    expectElements1,
    expectElements2,
} from "./util.js";

const composer = new ClusterComposer(TestComposite);

describe("ClusterComposer", () => {
    describe("composition", () => {
        it("extends cluster when features match", () => {
            const SELECTION = ["Extended", "Fancy", "AbsolutelyFabulous"] as const;
            type SELECTION = typeof SELECTION;
            type SELECTION_FLAGS = {
                extended: true;
                fancy: true;
                absolutelyFabulous: true;
                alsoExtended: false;
                bitterDisappointment: false;
            };

            // Type test: Feature-to-flag conversion
            const flags = {} as ClusterComposer.FeaturesAsFlags<typeof TestComposite, SELECTION>;
            flags satisfies SELECTION_FLAGS;

            // Type test: Selector applicability
            const contribution = {} as ClusterComposer.SelectorContribution<
                SELECTION_FLAGS,
                (typeof TestComposite.extensions)[0]
            >;
            contribution satisfies Elements2ish;

            // Type test: Component selection
            const selected = {} as ClusterComposer.SelectedElements<SELECTION_FLAGS, typeof TestComposite.extensions>;
            selected satisfies Elements2ish;

            // Type test: Overall composition
            type Composed = ClusterComposer.Of<typeof TestComposite, SELECTION>;
            const fakeCluster = {} as Composed;
            fakeCluster satisfies Elements1ish;
            fakeCluster satisfies Elements2ish;

            // Functional
            const cluster = composer.compose(SELECTION);
            expectElements1(cluster);
            expectElements2(cluster);
            expectElementCounts(cluster, 2);
        });

        it("doesn't extend cluster when features don't match", () => {
            const cluster = composer.compose(["Extended"]);

            cluster satisfies Elements1ish;
            cluster satisfies Elements2ish;

            expectElementCounts(cluster, 2);
        });

        it("works with real-world cluster and enum feature identifier", () => {
            type Flags = ClusterComposer.FeaturesAsFlags<OnOff.Cluster, [OnOff.Feature.Lighting]>;
            ({}) as Flags satisfies { lighting: true };

            const cluster = OnOff.Cluster.with(OnOff.Feature.Lighting);

            cluster satisfies typeof OnOff.Base;
            cluster satisfies typeof OnOff.LightingComponent;
        });

        it("treats missing feature as false", () => {
            const cluster = composer.compose(["Extended", "Fancy"]);
            expectElements2(cluster);
            expectElementCounts(cluster, 2);
        });

        // This tests numerous permutations of typing to isolate a TS 5.4 bug.  See comment in
        // ClusterComposer.FeaturesAsFlags
        it("extends with default components", () => {
            const Cluster = ClusterType({
                ...TestBase,
                extensions: [
                    {
                        flags: {
                            extended: false,
                        },
                        component: ELEMENTS2,
                    },
                ],
            });

            // Confirm empty flag set maps correctly
            type EmptyFlags = ClusterComposer.FeaturesAsFlags<typeof TestBase, []>;
            ({}) as EmptyFlags satisfies {
                readonly extended: false;
                readonly fancy: false;
                readonly absolutelyFabulous: false;
                readonly bitterDisappointment: false;
                readonly alsoExtended: false;
            };

            // Confirm extension contributes appropriately
            ({}) as ClusterComposer.SelectorContribution<
                EmptyFlags,
                (typeof Cluster.extensions)[0]
            > satisfies Elements2ish;

            // Confirm extension contributes in list
            type SelectedElements = ClusterComposer.SelectedElements<EmptyFlags, typeof Cluster.extensions>;
            ({}) as SelectedElements satisfies Elements2ish;

            // Test SelectedElements contribution in ExtendedElements
            ({}) as ClusterComposer.ExtendedElements<typeof Cluster, SelectedElements> satisfies Elements2ish;

            // Test WithFeatures
            ({}) as ClusterComposer.WithFeatures<typeof Cluster, []> satisfies Elements2ish;

            // Test ClusterComposer.Of
            ({}) as ClusterComposer.Of<typeof Cluster, []> satisfies Elements2ish;

            // Test ClusterComposer.Of with flags typed by function
            function featureIdentity<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>(flags: T) {
                return flags;
            }
            const flags = featureIdentity([]);
            ({}) as ClusterComposer.Of<typeof Cluster, typeof flags> satisfies Elements2ish;

            // Test empty flags typed by function
            function flagify<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>(_flags: T) {
                return {} as ClusterComposer.FeaturesAsFlags<typeof Cluster, T>;
            }
            const flagified = flagify([]);
            ({}) as ClusterComposer.SelectorContribution<
                typeof flagified,
                (typeof Cluster.extensions)[0]
            > satisfies Elements2ish;

            // Filtering extension type
            type SelectorMatches<
                FlagsT extends ClusterComposer.FeatureFlags,
                SelectorT extends ClusterType.Extension,
            > = FlagsT extends SelectorT["flags"] ? true : false;
            ({}) as SelectorMatches<
                ClusterComposer.FeaturesAsFlags<typeof Cluster, []>,
                (typeof Cluster.extensions)[0]
            > satisfies true;

            // Filtering extension type in a function with manual feature flags
            function selectorMatchesFlags<T extends Record<string, boolean>>() {
                return {} as SelectorMatches<T, (typeof Cluster.extensions)[0]>;
            }
            selectorMatchesFlags<EmptyFlags>() satisfies true;

            // Testing flag match outside of function
            ({}) as ClusterComposer.FeaturesAsFlags<typeof Cluster, []> extends { extended: false }
                ? true
                : false satisfies true;

            // Testing flags in a function with simplified FeaturesAsFlags
            type SimplifiedFeaturesAsFlags<FlagsT extends string[]> = {
                extended: Capitalize<"extended"> extends FlagsT[number] ? true : false;
            };
            function testSimplifiedFlags<const T extends string[]>() {
                return {} as SimplifiedFeaturesAsFlags<T> extends { extended: false } ? true : false;
            }
            testSimplifiedFlags<[]>() satisfies true;

            // Testing flags in a function
            function testFlags<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>() {
                return {} as ClusterComposer.FeaturesAsFlags<typeof Cluster, T> extends { extended: false }
                    ? true
                    : false;
            }
            testFlags<[]>() satisfies true;

            // Filtering extension type in a function with explicit extension definition
            function flagsMatchesSelector<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>() {
                return {} as SelectorMatches<
                    ClusterComposer.FeaturesAsFlags<typeof Cluster, T>,
                    {
                        flags: {
                            extended: false;
                        };
                        component: typeof ELEMENTS2;
                    }
                >;
            }
            flagsMatchesSelector<[]>() satisfies true;

            // Filtering extension type in a function with automatic feature flags and extension's flag definition
            function selectorMatches<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>() {
                return {} as SelectorMatches<
                    ClusterComposer.FeaturesAsFlags<typeof Cluster, T>,
                    (typeof Cluster.extensions)[0]
                >;
            }
            selectorMatches<[]>() satisfies true;

            // SelectorContribution in function
            function selectorContribution<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>(_flags: T) {
                return {} as ClusterComposer.SelectorContribution<
                    ClusterComposer.FeaturesAsFlags<typeof Cluster, T>,
                    (typeof Cluster.extensions)[0]
                >;
            }
            selectorContribution([]) satisfies Elements2ish;

            // WithFeatures in function
            function selectedElements<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>(_flags: T) {
                return {} as ClusterComposer.WithFeatures<typeof Cluster, T>;
            }
            selectedElements([]) satisfies Elements2ish;

            // Test ClusterComposer.Of on a function with manual feature selection
            function compose1<const T extends readonly Capitalize<string & keyof typeof Cluster.features>[]>(
                _flags: T,
            ) {
                return {} as ClusterComposer.Of<typeof Cluster, T>;
            }
            compose1<[]>([]) satisfies Elements2ish;
            compose1([]) satisfies Elements2ish;

            // Test ClusterComposer.Of on a function with ClusterComposer.FeatureSelection
            function compose2<const T extends ClusterComposer.FeatureSelection<typeof Cluster>>(_flags: T) {
                return {} as ClusterComposer.Of<typeof Cluster, T>;
            }
            compose2([]) satisfies Elements2ish;

            // Test ClusterComposer.Of from cluster composer with empty feature list
            const composer = new ClusterComposer(Cluster);
            const cluster1 = composer.compose([]);
            cluster1 satisfies Elements1ish;
            cluster1 satisfies Elements2ish;
            expectElementCounts(cluster1, 2);

            // Test ClusterComposer.Of from cluster composer with non-empty feature list
            const cluster2 = composer.compose(["AlsoExtended"]);
            cluster2 satisfies Elements1ish;
            cluster2 satisfies Elements2ish;
            expectElementCounts(cluster2, 2);
        });
    });

    describe("validation", () => {
        it("accepts a supported feature", () => {
            expect(() => {
                composer.compose(["AbsolutelyFabulous"]);
            }).not.throw(IllegalClusterError);
        });

        it("rejects an unsupported feature", () => {
            expect(() => {
                composer.compose(["SomewhatFabulous"] as any);
            }).throw(IllegalClusterError, '"SomewhatFabulous" is not a valid feature identifier');
        });
    });

    describe("rejection", () => {
        type IsNever<T> = [T] extends [never] ? true : false;

        it("allows legal features", () => {
            expect(() => {
                composer.compose(["Extended"]);
            }).not.throw();
        });

        it("rejects illegal features", () => {
            const SELECTION = ["AbsolutelyFabulous", "BitterDisappointment"] as const;
            type SELECTION = typeof SELECTION;
            type SELECTION_FLAGS = {
                extended: false;
                fancy: false;
                absolutelyFabulous: true;
                alsoExtended: false;
                bitterDisappointment: true;
            };

            // Type test: Selector applicability
            const contribution = {} as ClusterComposer.SelectorContribution<
                SELECTION_FLAGS,
                (typeof TestComposite.extensions)[1]
            >;
            ({}) as IsNever<typeof contribution> satisfies true;

            // Type test: Component selection
            const selected = {} as ClusterComposer.SelectedElements<SELECTION_FLAGS, typeof TestComposite.extensions>;
            ({}) as IsNever<typeof selected> satisfies true;

            // Type test: WithSelected
            const withSelected = {} as ClusterComposer.ExtendedElements<typeof TestComposite, never>;
            withSelected satisfies never;

            // Type test: WithFeatures
            const withFeatures = {} as ClusterComposer.WithFeatures<typeof TestComposite, SELECTION>;
            withFeatures satisfies never;

            // Type test: Overall composition
            type Composed = ClusterComposer.Of<typeof TestComposite, SELECTION>;
            const fakeCluster = {} as Composed;
            fakeCluster satisfies never;

            // Functional
            expect(() => {
                const composed = composer.compose(SELECTION);
                composed satisfies never;
            }).throw(
                IllegalClusterError,
                "Feature combination { absolutelyFabulous: true, bitterDisappointment: true } is disallowed by the Matter specification",
            );
        });
    });
});
