/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isClientBehavior } from "#behavior/cluster/cluster-behavior-utils.js";
import { ChimeClient } from "#behaviors/chime";
import { IdentifyClient, IdentifyServer } from "#behaviors/identify";
import { OccupancySensingClient } from "#behaviors/occupancy-sensing";
import { OnOffServer } from "#behaviors/on-off";
import { WebRtcTransportProviderClient } from "#behaviors/web-rtc-transport-provider";
import { CameraControllerDevice } from "#devices/camera-controller";
import { DoorbellDevice } from "#devices/doorbell";
import { OnOffLightDevice } from "#devices/on-off-light";
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

describe("MutableEndpoint .with() router", () => {
    const base = MutableEndpoint({
        name: "Test",
        deviceType: 0x100,
        deviceRevision: 1,
        behaviors: SupportedBehaviors(OnOffServer),
    });

    it("routes server-only args to behaviors slot", () => {
        const ext = base.with(IdentifyServer);
        expect(ext.behaviors[IdentifyServer.id]).equal(IdentifyServer);
        expect(ext.clientClusters).deep.equal({});
    });

    it("routes client-only args to clientClusters slot", () => {
        const ext = base.with(OccupancySensingClient);
        expect(ext.clientClusters[OccupancySensingClient.id]).equal(OccupancySensingClient);
        expect(ext.behaviors[OnOffServer.id]).equal(OnOffServer);
        expect(ext.behaviors).not.have.property(OccupancySensingClient.id);
    });

    it("routes mixed args correctly", () => {
        const ext = base.with(IdentifyServer, OccupancySensingClient);
        expect(ext.behaviors[IdentifyServer.id]).equal(IdentifyServer);
        expect(ext.clientClusters[OccupancySensingClient.id]).equal(OccupancySensingClient);
    });

    it("routes same cluster server + client in one call to separate slots", () => {
        const ext = base.with(IdentifyServer, IdentifyClient);
        expect(ext.behaviors[IdentifyServer.id]).equal(IdentifyServer);
        expect(ext.behaviors[IdentifyServer.id]).not.equal(IdentifyClient);
        expect(ext.clientClusters[IdentifyClient.id]).equal(IdentifyClient);
        expect(ext.clientClusters[IdentifyClient.id]).not.equal(IdentifyServer);
        expect(isClientBehavior(ext.clientClusters[IdentifyClient.id])).equal(true);
        expect(isClientBehavior(ext.behaviors[IdentifyServer.id])).equal(false);
    });

    it("idempotent on duplicate args", () => {
        const ext = base.with(OccupancySensingClient, OccupancySensingClient);
        expect(Object.keys(ext.clientClusters).length).equal(1);
    });
});

describe("MutableEndpoint .with() routing typing", () => {
    it("type-level: server arg in behaviors, client arg in clientClusters, both for mixed", () => {
        const base = MutableEndpoint({
            name: "Test",
            deviceType: 0x100,
            deviceRevision: 1,
            behaviors: SupportedBehaviors(OnOffServer),
        });

        // server-only
        const sext = base.with(IdentifyServer);
        ((_: typeof IdentifyServer) => _)(sext.behaviors[IdentifyServer.id]);
        // @ts-expect-error - server-only .with() should keep clientClusters at the empty default
        sext.clientClusters[OccupancySensingClient.id];

        // client-only
        const cext = base.with(OccupancySensingClient);
        ((_: typeof OccupancySensingClient) => _)(cext.clientClusters[OccupancySensingClient.id]);
        ((_: typeof OnOffServer) => _)(cext.behaviors[OnOffServer.id]);
        // @ts-expect-error - OccupancySensingClient.id should not be on behaviors
        cext.behaviors[OccupancySensingClient.id];

        // mixed
        const mext = base.with(IdentifyServer, OccupancySensingClient);
        ((_: typeof IdentifyServer) => _)(mext.behaviors[IdentifyServer.id]);
        ((_: typeof OccupancySensingClient) => _)(mext.clientClusters[OccupancySensingClient.id]);

        void sext;
        void cext;
        void mext;
    });
});

describe("MutableEndpoint auto-merge of mandatory client clusters", () => {
    it("auto-registers requirements.client.mandatory entries (doorbell)", () => {
        expect(Object.values(DoorbellDevice.clientClusters)).contain(ChimeClient);
    });

    it("does not auto-register optional client clusters (on-off-light)", () => {
        expect(OnOffLightDevice.clientClusters).deep.equal({});
    });

    it("auto-registers mandatory and leaves optional un-registered (camera-controller)", () => {
        expect(Object.values(CameraControllerDevice.clientClusters)).contain(WebRtcTransportProviderClient);
        expect(Object.values(CameraControllerDevice.clientClusters)).not.contain(OccupancySensingClient);
    });

    it("does not double-add when .with() supplies a mandatory client", () => {
        const ext = DoorbellDevice.with(ChimeClient);
        expect(Object.values(ext.clientClusters)).contain(ChimeClient);
        expect(Object.keys(ext.clientClusters).length).equal(Object.keys(DoorbellDevice.clientClusters).length);
    });
});
