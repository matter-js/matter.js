/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterInterface } from "#behavior/cluster/ClusterInterface.js";
import { MaybePromise } from "@matter/general";
import { MyClusterTyping } from "./cluster-behavior-test-util.js";

type FeaturesInterface = {
    SupportedFeatures: { foo: true };
    Commands: {
        Components: [
            {
                flags: {};
                methods: {
                    unconditionalMethod(value: string): boolean;
                };
            },
            {
                flags: { foo: true };
                methods: {
                    fooMethod(value: number): number;
                };
            },
            {
                flags: { bar: true };
                methods: {
                    barMethod(value: boolean): string;
                };
            },
        ];
    };
};

describe("ClusterInterface", () => {
    describe("MethodsOf", () => {
        it("includes interface", () => {
            type Mo = ClusterInterface.MethodsOf<FeaturesInterface>;
            ({}) as keyof Mo satisfies "unconditionalMethod" | "fooMethod";
            ({}) as "unconditionalMethod" | "fooMethod" satisfies keyof Mo;
        });

        it("resolves commands from namespace typing", () => {
            type Mo = ClusterInterface.MethodsOf<MyClusterTyping>;
            ({}) as keyof Mo satisfies "optCmd" | "reqCmd";
            ({}) as "optCmd" | "reqCmd" satisfies keyof Mo;
        });
    });

    describe("InterfaceMethodsOf", () => {
        it("includes unconditional", () => {
            type Imo = ClusterInterface.InterfaceMethodsOf<FeaturesInterface, {}>;
            ({}) as keyof Imo satisfies "unconditionalMethod";
            ({}) as "unconditionalMethod" satisfies keyof Imo;
        });

        it("includes conditional", () => {
            type Imo = ClusterInterface.InterfaceMethodsOf<FeaturesInterface, { foo: true }>;
            ({}) as keyof Imo satisfies "unconditionalMethod" | "fooMethod";
            ({}) as "unconditionalMethod" | "fooMethod" satisfies keyof Imo;
        });

        it("allows override via standard method", () => {
            class Ignored implements ClusterInterface.InterfaceMethodsOf<FeaturesInterface, { foo: true }> {
                unconditionalMethod(_value: string): boolean {
                    throw new Error("Method not implemented.");
                }

                fooMethod(_value: number): number {
                    throw new Error("Method not implemented.");
                }
            }
            Ignored;
        });
    });

    describe("AppliedMethodsOf", () => {
        type Amo = ClusterInterface.AppliedMethodsOf<ClusterInterface.ComponentsOf<MyClusterTyping>>;

        it("supports mandatory", () => {
            ({}) as Amo satisfies {
                reqCmd(request: string): MaybePromise<string>;
            };
        });

        it("supports optional", () => {
            ({}) as Amo satisfies {
                optCmd(request: boolean): MaybePromise<boolean>;
            };
        });
    });
});
