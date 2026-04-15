/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PowerSource } from "#clusters/power-source.js";

describe("ClusterType.Cluster.with() compat shim", () => {
    it("returns a namespace with identity metadata preserved", () => {
        const selected = PowerSource.Cluster.with(PowerSource.Feature.Rechargeable, PowerSource.Feature.Battery);

        expect(selected.name).equal("PowerSource");
        expect(selected.id).equal(PowerSource.id);
        expect(selected.schema).equal(PowerSource.schema);
        expect(selected.revision).equal(PowerSource.revision);
    });

    it("exposes attribute metadata identical to the source namespace", () => {
        const selected = PowerSource.Cluster.with(PowerSource.Feature.Battery);

        expect(selected.attributes.status).equal(PowerSource.attributes.status);
        expect(selected.attributes.order).equal(PowerSource.attributes.order);
    });

    it("records selected features in supportedFeatures with camelCase keys", () => {
        // The shim's return type is intentionally minimal (typing-only SupportedFeatures shift); `supportedFeatures`
        // is a runtime-only marker consumed by ClusterBehaviorType.syncFeatures, so this cast is required.
        const selected = PowerSource.Cluster.with(
            PowerSource.Feature.Rechargeable,
            PowerSource.Feature.Battery,
        ) as unknown as {
            supportedFeatures: Record<string, true>;
        };

        expect(selected.supportedFeatures).deep.equal({
            rechargeable: true,
            battery: true,
        });
    });

    it("returns an empty supportedFeatures record when called without features", () => {
        const selected = PowerSource.Cluster.with() as unknown as { supportedFeatures: Record<string, true> };

        expect(selected.supportedFeatures).deep.equal({});
    });

    it("does not mutate the source namespace", () => {
        PowerSource.Cluster.with(PowerSource.Feature.Rechargeable);

        expect(Object.prototype.hasOwnProperty.call(PowerSource.Cluster, "supportedFeatures")).equal(false);
        expect(Object.prototype.hasOwnProperty.call(PowerSource, "supportedFeatures")).equal(false);
    });

    it("falls through to the source namespace via the prototype chain", () => {
        const selected = PowerSource.Cluster.with(PowerSource.Feature.Battery);

        // Not an own property — resolved via prototype delegation.
        expect(Object.prototype.hasOwnProperty.call(selected, "features")).equal(false);
        expect(selected.features).equal(PowerSource.features);
        expect(selected.events).equal(PowerSource.events);
    });

    it("preserves the Cluster/Complete self-reference invariant on the clone", () => {
        const selected = PowerSource.Cluster.with(PowerSource.Feature.Battery) as unknown as {
            Cluster: { supportedFeatures: Record<string, true> };
            Complete: unknown;
            supportedFeatures: Record<string, true>;
        };

        // `selected.Cluster` must point to the clone itself, not to the source namespace — otherwise the
        // `supportedFeatures` marker is silently dropped for any caller that re-fetches `.Cluster`.
        expect(selected.Cluster).equal(selected);
        expect(selected.Complete).equal(selected);
        expect(selected.Cluster.supportedFeatures).equal(selected.supportedFeatures);
    });

    it("produces a fresh clone per call", () => {
        const a = PowerSource.Cluster.with(PowerSource.Feature.Battery);
        const b = PowerSource.Cluster.with(PowerSource.Feature.Battery);

        expect(a).not.equal(b);
    });
});
