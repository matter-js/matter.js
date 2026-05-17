/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientBehavior } from "#behavior/cluster/ClientBehavior.js";
import { OccupancySensingClient } from "#behaviors/occupancy-sensing";
import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { SupportedClientClusters } from "#endpoint/properties/SupportedClientClusters.js";
import { ImplementationError } from "@matter/general";
import { OnOff } from "@matter/types/clusters/on-off";

describe("SupportedClientClusters", () => {
    it("creates empty set", () => {
        const set = SupportedClientClusters();
        expect(Object.keys(set)).deep.equal([]);
    });

    it("indexes entries by id", () => {
        const set = SupportedClientClusters(OnOffClient, OccupancySensingClient);
        expect(set[OnOffClient.id]).equal(OnOffClient);
        expect(set[OccupancySensingClient.id]).equal(OccupancySensingClient);
    });

    it("dedupes by identity via extend()", () => {
        const base = SupportedClientClusters(OnOffClient);
        const extended = SupportedClientClusters.extend(base, [OnOffClient]);
        expect(Object.keys(extended).length).equal(1);
        expect(extended[OnOffClient.id]).equal(OnOffClient);
    });

    it("replaces same id on extend()", () => {
        const OnOffClient2 = ClientBehavior(OnOff);
        const base = SupportedClientClusters(OnOffClient);
        const extended = SupportedClientClusters.extend(base, [OnOffClient2]);
        expect(Object.keys(extended).length).equal(1);
        expect(extended[OnOffClient.id]).equal(OnOffClient2);
        expect(extended[OnOffClient.id]).not.equal(OnOffClient);
    });

    it("rejects non-client behavior", () => {
        expect(() => SupportedClientClusters(OnOffServer as any)).throws(ImplementationError, /not.*ClientBehavior/);
    });
});
