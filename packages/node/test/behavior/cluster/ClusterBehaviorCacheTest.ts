/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LevelControlBaseServer, LevelControlServer } from "#behaviors/level-control";
import { OnOffServer } from "#behaviors/on-off";
import { PowerSourceServer } from "#behaviors/power-source";
import { ClusterModel } from "@matter/model";
import { ClusterType } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { PowerSource } from "@matter/types/clusters/power-source";

// The namespace `with()` shim is a deprecated compat layer with no declared type
const LegacyPowerSource = PowerSource as ClusterType.WithCompat<typeof PowerSource, PowerSource>;

function constraintOf(type: { schema: ClusterModel }) {
    return String(type.schema.attributes.find(attribute => attribute.name === "CurrentLevel")?.constraint);
}

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

    it("doesn't confuse namespaces sharing a schema", () => {
        const variant = Object.create(OnOff) as typeof OnOff;

        const Type1 = OnOffServer.for(OnOff);
        const Type2 = OnOffServer.for(variant);

        expect(Type1).not.equals(Type2);
        expect(Type1.cluster).equals(OnOff);
        expect(Type2.cluster).equals(variant);
    });

    it("caches per namespace", () => {
        expect(OnOffServer.for(OnOff)).equals(OnOffServer.for(OnOff));
    });

    // One schema and one behavior per distinct feature selection.  Losing any of these properties multiplies
    // ClusterModel and RootSupervisor allocations
    describe("sharing", () => {
        it("shares one schema per feature selection", () => {
            expect(LevelControlBaseServer.with("Lighting").schema).equals(
                LevelControlBaseServer.with("Lighting").schema,
            );
        });

        it("shares one behavior per feature selection", () => {
            expect(LevelControlServer.with("Lighting", "OnOff")).equals(LevelControlServer.with("Lighting", "OnOff"));
        });

        it("converges on the original schema when a selection is reapplied to a variant", () => {
            const cleared = LevelControlBaseServer.with();

            expect(cleared.schema).not.equals(LevelControlBaseServer.schema);
            expect(cleared.with("Lighting", "OnOff").schema).equals(LevelControlBaseServer.schema);
        });

        it("shares one behavior across repeated legacy namespace selection", () => {
            const namespaces = new Set<unknown>();
            const types = new Set<unknown>();

            for (let i = 0; i < 100; i++) {
                const ns = LegacyPowerSource.with("Battery");
                namespaces.add(ns);
                types.add(PowerSourceServer.for(ns));
            }

            expect(namespaces.size).equals(1);
            expect(types.size).equals(1);
        });

        it("does not collapse an altered schema into the schema it derives from", () => {
            const altered = LevelControlServer.with("Lighting", "OnOff").alter({
                attributes: { currentLevel: { min: 5, max: 200 } },
            });

            expect(altered.schema).not.equals(LevelControlBaseServer.schema);
            expect(constraintOf(altered)).equals("5 to 200");

            // Convergence on an origin schema must follow feature variants only, never discard alterations
            const roundTripped = altered.with().with("Lighting", "OnOff");

            expect(roundTripped.schema).not.equals(LevelControlBaseServer.schema);
            expect(constraintOf(roundTripped)).equals("5 to 200");
        });
    });
});
