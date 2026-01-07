/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IllegalClusterError } from "#cluster/mutation/ClusterComposer.js";
import { MutableCluster } from "#cluster/mutation/MutableCluster.js";
import { TestComposite, expectElementCounts, expectElements1, expectElements2, expectMetadata } from "./util.js";

const TestMutable = MutableCluster(TestComposite);

describe("MutableCluster", () => {
    describe("BaseClusterComponent", () => {
        it("builds cluster", () => {
            expectMetadata(TestMutable);
            expectElements1(TestMutable);
        });
    });

    describe("a conventional extensible cluster", () => {
        it("creates with no features", () => {
            const cluster = TestMutable.with();
            expectElements1(cluster);
            expectElementCounts(cluster, 1);
        });

        it("creates with a feature", () => {
            const cluster = TestMutable.with("Extended");
            expect(cluster.supportedFeatures).deep.equal({
                extended: true,
                fancy: false,
                absolutelyFabulous: false,
                bitterDisappointment: false,
                alsoExtended: false,
            });
            expectElements1(cluster);
            expectElements2(cluster);
            expectElementCounts(cluster, 2);
        });

        it("rejects unsupported features", () => {
            expect(() => {
                TestMutable.with("AbsolutelyFabulous", "BitterDisappointment");
            }).throw(
                IllegalClusterError,
                "Feature combination { absolutelyFabulous: true, bitterDisappointment: true } is disallowed by the Matter specification",
            );
        });

        it("rejects unsupported features with supported features", () => {
            expect(() => {
                TestMutable.with("Extended", "AbsolutelyFabulous", "BitterDisappointment");
            }).throw(
                IllegalClusterError,
                "Feature combination { absolutelyFabulous: true, bitterDisappointment: true } is disallowed by the Matter specification",
            );
        });
    });
});
