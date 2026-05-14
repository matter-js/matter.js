/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IdentifyServer } from "#behaviors/identify";
import { OccupancySensingClient } from "#behaviors/occupancy-sensing";
import { OnOffServer } from "#behaviors/on-off";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { SupportedClientClusters } from "#endpoint/properties/SupportedClientClusters.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";

describe("MutableEndpoint clientClusters slot", () => {
    it("defaults clientClusters to empty when not provided", () => {
        const def = MutableEndpoint({
            name: "Test",
            deviceType: 0x100,
            deviceRevision: 1,
            behaviors: SupportedBehaviors(OnOffServer),
        });
        expect(def.clientClusters).deep.equal({});
    });

    it("accepts an explicit clientClusters slot", () => {
        const def = MutableEndpoint({
            name: "Test",
            deviceType: 0x100,
            deviceRevision: 1,
            behaviors: SupportedBehaviors(OnOffServer),
            clientClusters: SupportedClientClusters(OccupancySensingClient),
        });
        expect(def.clientClusters[OccupancySensingClient.id]).equal(OccupancySensingClient);
    });
});

describe("MutableEndpoint clientClusters typing", () => {
    it("compiles type-level checks", () => {
        // Case 1: no clientClusters → type is assignable to {}
        const _noClientClusters = () =>
            MutableEndpoint({
                name: "Test",
                deviceType: 0x100,
                deviceRevision: 1,
                behaviors: SupportedBehaviors(OnOffServer),
            });
        type NoClientClusters = ReturnType<typeof _noClientClusters>;
        // clientClusters is {} when not supplied
        ({}) as NoClientClusters["clientClusters"] satisfies {};

        // Case 2: explicit clientClusters → key is present at the right type
        const _withOccupancy = () =>
            MutableEndpoint({
                name: "Test",
                deviceType: 0x100,
                deviceRevision: 1,
                behaviors: SupportedBehaviors(OnOffServer),
                clientClusters: SupportedClientClusters(OccupancySensingClient),
            });
        type WithOccupancy = ReturnType<typeof _withOccupancy>;
        // OccupancySensingClient.id key is present and typed as OccupancySensingClient
        ({}) as WithOccupancy["clientClusters"][typeof OccupancySensingClient.id] satisfies typeof OccupancySensingClient;

        // Case 3: base.withClientClusters(...) → returned definition contains the new key
        const base = MutableEndpoint({
            name: "Test",
            deviceType: 0x100,
            deviceRevision: 1,
            behaviors: SupportedBehaviors(OnOffServer),
        });
        const ext = base.withClientClusters(OccupancySensingClient);
        ({}) as (typeof ext)["clientClusters"][typeof OccupancySensingClient.id] satisfies typeof OccupancySensingClient;

        // Case 4: withClientClusters preserves behaviors slot at the type level
        "onOff" satisfies keyof (typeof ext)["behaviors"];

        // Case 5: .withBehaviors(...) preserves clientClusters at the type level
        const ext2 = base.withClientClusters(OccupancySensingClient).withBehaviors(IdentifyServer);
        ({}) as (typeof ext2)["clientClusters"][typeof OccupancySensingClient.id] satisfies typeof OccupancySensingClient;

        void _noClientClusters;
        void _withOccupancy;
        void ext;
        void ext2;
    });

    it("withClientClusters extends the clientClusters slot at runtime", () => {
        const base = MutableEndpoint({
            name: "Test",
            deviceType: 0x100,
            deviceRevision: 1,
            behaviors: SupportedBehaviors(OnOffServer),
        });
        const ext = base.withClientClusters(OccupancySensingClient);
        expect(ext.clientClusters[OccupancySensingClient.id]).equal(OccupancySensingClient);
        expect(base.clientClusters).deep.equal({});
    });
});
