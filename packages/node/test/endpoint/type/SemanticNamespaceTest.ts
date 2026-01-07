/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticNamespace } from "#endpoint/type/SemanticNamespace.js";
import { RefrigeratorTag } from "#tags/RefrigeratorTag.js";
import { Semtag } from "#types";

describe("SemanticNamespace", () => {
    it("defines tags", () => {
        const ns = SemanticNamespace({
            id: 4,
            tags: {
                Foo: { id: 1, label: "Foo" },
                Bar: { id: 2, label: "WAT dunno" },
            },
        });

        ns satisfies SemanticNamespace & {
            Foo: Semtag;
            Bar: Semtag;
        };

        expect(ns).deep.equals({
            Foo: {
                namespaceId: 4,
                tag: 1,
                label: "Foo",
                mfgCode: null,
            },
            Bar: {
                namespaceId: 4,
                tag: 2,
                label: "WAT dunno",
                mfgCode: null,
            },
        });
    });

    it("supports custom namespaces", () => {
        const ns = SemanticNamespace({
            id: 4,
            mfgCode: 17,
            tags: {
                Foo: { id: 1, label: "Foo" },
                Bar: { id: 2, label: "WAT dunno" },
            },
        });

        expect(ns).deep.equals({
            Foo: {
                namespaceId: 4,
                tag: 1,
                label: "Foo",
                mfgCode: 17,
            },
            Bar: {
                namespaceId: 4,
                tag: 2,
                label: "WAT dunno",
                mfgCode: 17,
            },
        });
    });

    it("works IRL", () => {
        RefrigeratorTag satisfies SemanticNamespace & {
            Refrigerator: Semtag;
            Freezer: Semtag;
        };

        expect(RefrigeratorTag).deep.equals({
            Refrigerator: {
                namespaceId: 0x41,
                tag: 0,
                label: "Refrigerator",
                mfgCode: null,
            },
            Freezer: {
                namespaceId: 0x41,
                tag: 1,
                label: "Freezer",
                mfgCode: null,
            },
        });
    });
});
