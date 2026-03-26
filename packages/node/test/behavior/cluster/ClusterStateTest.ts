/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterState } from "#behavior/cluster/ClusterState.js";
import { ClusterTyping } from "@matter/types";
import { MyClusterTyping } from "./cluster-behavior-test-util.js";

describe("ClusterState", () => {
    describe("base class", () => {
        it("is an object", () => {
            ({}) as ClusterState<ClusterTyping, Behavior.Type> satisfies {};
        });
    });

    describe("Type", () => {
        type E = ClusterState.Type<MyClusterTyping, Behavior.Type>;

        it("is an object", () => {
            ({}) as E satisfies {};
        });

        it("requires mandatory", () => {
            ({}) as E satisfies { reqAttr: string };
        });

        it("allows optional", () => {
            undefined satisfies E["optAttr"];
            true satisfies E["optAttr"];
        });
    });

    describe("state instance", () => {
        type Si = ClusterState<MyClusterTyping, Behavior.Type>;

        it("requires mandatory", () => {
            ({}) as Si satisfies {
                reqAttr: string;
            };
        });

        it("allows optional", () => {
            undefined satisfies Si["optAttr"];
            true satisfies Si["optAttr"];
        });
    });
});
