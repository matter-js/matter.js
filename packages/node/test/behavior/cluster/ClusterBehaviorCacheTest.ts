/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffServer } from "#behaviors/on-off";

describe("ClusterBehaviorCache", () => {
    it("caches for with", () => {
        const Type1 = OnOffServer.with("Lighting");
        const Type2 = OnOffServer.with("Lighting");
        expect(Type1).equals(Type2);
    });

    it("doesn't confuse base with variant", () => {
        const Type1 = OnOffServer.with("Lighting");
        expect(Type1).not.equals(OnOffServer);
    });

    it("doesn't confuse multiple variants", () => {
        const Type1 = OnOffServer.with("Lighting");
        const Type2 = OnOffServer.with("DeadFrontBehavior");
        expect(Type1).not.equals(Type2);
    });

    it("is not sensitive to feature order", () => {
        const Type1 = OnOffServer.with("Lighting", "DeadFrontBehavior");
        const Type2 = OnOffServer.with("DeadFrontBehavior", "Lighting");
        expect(Type1).equals(Type2);
    });
});
