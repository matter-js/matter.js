/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterState } from "#behavior/cluster/ClusterState.js";
import { ClusterType } from "#types";
import { MyCluster } from "./cluster-behavior-test-util.js";

describe("ClusterState", () => {
    describe("base class", () => {
        it("is an object", () => {
            ({}) as ClusterState<ClusterType, Behavior.Type> satisfies {};
        });
    });

    describe("AttributeProperties", () => {
        type Ap = ClusterState.PropertiesOfAttributes<ClusterType.AttributesOf<MyCluster>>;

        it("requires mandatory", () => {
            ({
                reqAttr: "foo",
            }) satisfies Ap;
            ({}) as Ap satisfies {
                reqAttr: string;
            };
        });

        it("allows optional", () => {
            undefined satisfies Ap["optAttr"];
            true satisfies Ap["optAttr"];
        });
    });

    describe("PropertiesOfAttributes", () => {
        type Poa = ClusterState.PropertiesOfAttributes<ClusterType.AttributesOf<MyCluster>>;

        it("requires mandatory", () => {
            ({
                reqAttr: "foo",
            }) satisfies Poa;
            ({}) as Poa satisfies {
                reqAttr: string;
            };
        });

        it("allows optional", () => {
            undefined satisfies Poa["optAttr"];
            true satisfies Poa["optAttr"];
        });
    });

    describe("EndpointProperties", () => {
        type Ep = ClusterState.PropertiesOf<MyCluster>;

        it("requires mandatory", () => {
            ({
                reqAttr: "foo",
            }) satisfies Ep;
            ({}) as Ep satisfies {
                reqAttr: string;
            };
        });

        it("allows optional", () => {
            undefined satisfies Ep["optAttr"];
            true satisfies Ep["optAttr"];
        });
    });

    describe("Endpoint", () => {
        type E = ClusterState.Type<MyCluster, Behavior.Type>;

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
        type Si = ClusterState<MyCluster, Behavior.Type>;

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
