/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointBehaviorNotClusterError, EndpointBehaviorNotPresentError } from "#endpoint/errors.js";
import { camelize } from "@matter/general";
import { AttributeId, CommandId } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { MockSite } from "../node/mock-site.js";
import { subscribedPeer } from "../node/node-helpers.js";

describe("Client cluster feature access on a commissioned peer endpoint", () => {
    let site: MockSite;
    let peer1: Endpoint;
    let ep1: Endpoint;

    before(() => {
        MockTime.init();
    });

    // Each test starts from a fresh commissioned OnOffLight mock device. The device activates
    // `OnOffServer.with("Lighting")` so the client side must reflect Lighting (and only Lighting) as enabled.
    beforeEach(async () => {
        site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        peer1 = await subscribedPeer(controller, "peer1");
        ep1 = peer1.parts.get("ep1")!;
    });

    afterEach(async () => {
        await site.close();
    });

    describe("underlying access paths", () => {
        it("typeFor(OnOffClient).features mirrors remote-supported features (camelized titles)", () => {
            const onOffType = ep1.behaviors.typeFor(OnOffClient);
            expect(onOffType, "OnOffClient must be installed on the device endpoint").not.undefined;

            const features = onOffType!.features as Record<string, boolean>;
            expect(features.lighting, "Lighting must be active per OnOffLight device definition").to.equal(true);
            expect(features.deadFrontBehavior).to.equal(false);
            expect(features.offOnly).to.equal(false);
        });

        // Documents that `schema.supportedFeatures` is a FeatureSet keyed by schema field NAMES (short codes
        // "LT"/"DF"/"OFFONLY"), not the long titles. This is the trap motivating the helper API.
        it("typeFor(OnOffClient).schema.supportedFeatures contains short codes (not titles)", () => {
            const supported = ep1.behaviors.typeFor(OnOffClient)!.schema.supportedFeatures;
            expect(supported.has("LT"), "LT (Lighting) must be active").to.equal(true);
            expect(supported.has("DF")).to.equal(false);
            expect(supported.has("OFFONLY")).to.equal(false);
            expect(supported.has("Lighting")).to.equal(false);
        });

        // Cross-check that both access paths agree for every feature in the schema's featureMap. This is the
        // contract any feature accessor on Endpoint must honor.
        it("`.features` map and `schema.supportedFeatures` agree for every feature in featureMap", () => {
            const onOffType = ep1.behaviors.typeFor(OnOffClient)!;
            const features = onOffType.features as Record<string, boolean>;
            const supported = onOffType.schema.supportedFeatures;

            for (const child of onOffType.schema.featureMap.children) {
                const shortName = child.name; // e.g. "LT"
                const camelName = camelize(child.title ?? child.name); // e.g. "lighting"
                expect(
                    features[camelName],
                    `features.${camelName} should match supportedFeatures.has("${shortName}")`,
                ).to.equal(supported.has(shortName));
            }
        });
    });

    describe("featuresOf / maybeFeaturesOf", () => {
        it("featuresOf(type) returns the camelCased feature map for an installed client behavior", () => {
            const features = ep1.featuresOf(OnOffClient);
            expect(features.lighting).to.equal(true);
            expect(features.deadFrontBehavior).to.equal(false);
            expect(features.offOnly).to.equal(false);
        });

        it("featuresOf(string) returns the camelCased feature map by behavior id", () => {
            expect(ep1.featuresOf("onOff").lighting).to.equal(true);
        });

        it("featuresOf(type) and featuresOf(string) return identical maps", () => {
            expect(ep1.featuresOf("onOff")).to.deep.equal(ep1.featuresOf(OnOffClient));
        });

        it("maybeFeaturesOf(type) and maybeFeaturesOf(string) return identical maps", () => {
            expect(ep1.maybeFeaturesOf("onOff")).to.deep.equal(ep1.maybeFeaturesOf(OnOffClient));
        });

        it("featuresOf(type) matches typeFor(type).features exactly", () => {
            expect(ep1.featuresOf(OnOffClient)).to.deep.equal(ep1.behaviors.typeFor(OnOffClient)!.features);
        });

        it("featuresOf only contains the cluster's own features (no cross-cluster keys)", () => {
            const features = ep1.featuresOf(OnOffClient) as Record<string, boolean>;
            // Positive: known OnOff feature names.
            expect(Object.keys(features).sort()).to.deep.equal(["deadFrontBehavior", "lighting", "offOnly"].sort());
            // Negative: keys from unrelated clusters must not appear.
            expect("presets" in features, "Thermostat key must not leak").to.be.false;
            expect("matter" in features, "made-up key must not appear").to.be.false;
        });

        it("featuresOf throws EndpointBehaviorNotPresentError for an unknown behavior", () => {
            expect(() => ep1.featuresOf("clusterThatDoesNotExistXyz")).to.throw(EndpointBehaviorNotPresentError);
        });

        it("maybeFeaturesOf returns undefined for an unknown behavior", () => {
            expect(ep1.maybeFeaturesOf("clusterThatDoesNotExistXyz")).to.equal(undefined);
        });
    });

    describe("globalsOf / maybeGlobalsOf", () => {
        it("globalsOf(type) exposes clusterRevision, featureMap and the spec global attribute lists", () => {
            const globals = ep1.globalsOf(OnOffClient);

            expect(globals.clusterRevision).to.equal(OnOff.revision);
            // Per-cluster narrowed featureMap shape - same content as featuresOf.
            expect(globals.featureMap.lighting).to.equal(true);
            expect(globals.featureMap.deadFrontBehavior).to.equal(false);
            expect(globals.featureMap.offOnly).to.equal(false);

            expect(Array.isArray(globals.attributeList)).to.be.true;
            expect(Array.isArray(globals.acceptedCommandList)).to.be.true;
            expect(Array.isArray(globals.generatedCommandList)).to.be.true;
        });

        it("globalsOf(string) returns the same shape as the typed variant", () => {
            expect(ep1.globalsOf("onOff")).to.deep.equal(ep1.globalsOf(OnOffClient));
        });

        it("globalsOf.featureMap matches featuresOf for the same behavior", () => {
            expect(ep1.globalsOf(OnOffClient).featureMap).to.deep.equal(ep1.featuresOf(OnOffClient));
        });

        it("globalsOf.attributeList contains expected and excludes non-OnOff ids", () => {
            const ids = new Set(ep1.globalsOf(OnOffClient).attributeList);
            // Positive: mandatory + Lighting-feature-gated attributes.
            expect(ids.has(AttributeId(0x0000)), "OnOff (0x0000)").to.be.true;
            expect(ids.has(AttributeId(0x4000)), "GlobalSceneControl (0x4000) gated on Lighting").to.be.true;
            expect(ids.has(AttributeId(0x4001)), "OnTime (0x4001) gated on Lighting").to.be.true;
            expect(ids.has(AttributeId(0x4002)), "OffWaitTime (0x4002) gated on Lighting").to.be.true;
            expect(ids.has(AttributeId(0x4003)), "StartUpOnOff (0x4003) gated on Lighting").to.be.true;
            // Positive: mandatory globals.
            expect(ids.has(AttributeId(0xfffc)), "FeatureMap").to.be.true;
            expect(ids.has(AttributeId(0xfffd)), "ClusterRevision").to.be.true;

            // Negative: ids that must NOT be present.
            expect(ids.has(AttributeId(0x0001)), "0x0001 not part of OnOff").to.be.false;
            expect(ids.has(AttributeId(0x4042)), "0x4042 made up").to.be.false;
            expect(ids.has(AttributeId(0xfffa)), "EventList (0xfffa) is deprecated, must not appear").to.be.false;
        });

        it("globalsOf.acceptedCommandList contains Lighting-gated commands and excludes unknown ids", () => {
            const ids = new Set(ep1.globalsOf(OnOffClient).acceptedCommandList);
            // Positive: base OnOff commands + Lighting-gated ones.
            expect(ids.has(CommandId(0x00)), "Off (0x00)").to.be.true;
            expect(ids.has(CommandId(0x01)), "On (0x01) — present because OFFONLY is not active").to.be.true;
            expect(ids.has(CommandId(0x02)), "Toggle (0x02) — present because OFFONLY is not active").to.be.true;
            expect(ids.has(CommandId(0x40)), "OffWithEffect (0x40) gated on Lighting").to.be.true;
            expect(ids.has(CommandId(0x41)), "OnWithRecallGlobalScene (0x41) gated on Lighting").to.be.true;
            expect(ids.has(CommandId(0x42)), "OnWithTimedOff (0x42) gated on Lighting").to.be.true;

            // Negative.
            expect(ids.has(CommandId(0x03)), "0x03 unused in OnOff").to.be.false;
            expect(ids.has(CommandId(0xff)), "0xff outside OnOff scope").to.be.false;
        });

        it("globalsOf.generatedCommandList is empty for OnOff (cluster has no responses)", () => {
            expect(ep1.globalsOf(OnOffClient).generatedCommandList).to.deep.equal([]);
        });

        it("globalsOf.featureMap negative: every false flag corresponds to an unselected feature in the schema", () => {
            const featureMap = ep1.globalsOf(OnOffClient).featureMap as Record<string, boolean>;
            // Lighting active, others not — assert each false flag exists as a key but resolves to false.
            expect(featureMap.deadFrontBehavior).to.equal(false);
            expect(featureMap.offOnly).to.equal(false);
            // Negative: an unrelated key must not appear at all (would indicate cross-cluster leakage).
            expect("presets" in featureMap, "Thermostat-only feature must not appear on OnOff").to.be.false;
            expect("matter" in featureMap, "made-up key must not appear").to.be.false;
        });

        it("globalsOf throws EndpointBehaviorNotPresentError for an unknown behavior", () => {
            expect(() => ep1.globalsOf("clusterThatDoesNotExistXyz")).to.throw(EndpointBehaviorNotPresentError);
        });

        it("maybeGlobalsOf returns undefined for an unknown behavior", () => {
            expect(ep1.maybeGlobalsOf("clusterThatDoesNotExistXyz")).to.equal(undefined);
        });
    });

    describe("commandsOf", () => {
        it("commandsOf(string) returns a proxy with the same keys as commandsOf(type)", () => {
            const byType = ep1.commandsOf(OnOffClient);
            const byString = ep1.commandsOf("onOff") as Record<string, unknown>;
            expect(Object.keys(byString).sort()).to.deep.equal(Object.keys(byType).sort());
        });

        it("commandsOf(string) commands are callable functions", () => {
            const cmds = ep1.commandsOf("onOff") as Record<string, unknown>;
            expect(typeof cmds.off).to.equal("function");
            expect(typeof cmds.on).to.equal("function");
            expect(typeof cmds.toggle).to.equal("function");
        });

        it("commandsOf(string) throws EndpointBehaviorNotPresentError for an unknown behavior", () => {
            expect(() => ep1.commandsOf("clusterThatDoesNotExistXyz")).to.throw(EndpointBehaviorNotPresentError);
        });
    });

    // featuresOf / globalsOf only make sense on cluster behaviors. State accessors must still work for non-cluster
    // behaviors (e.g. `network` on ClientNode) since those carry plain state.
    describe("non-cluster behaviors", () => {
        it("stateOf works for a non-cluster behavior on the root endpoint", () => {
            const state = peer1.stateOf("network");
            expect(state).to.be.an("object");
        });

        it("featuresOf throws EndpointBehaviorNotClusterError for a present non-cluster behavior", () => {
            expect(() => peer1.featuresOf("network")).to.throw(EndpointBehaviorNotClusterError);
        });

        it("globalsOf throws EndpointBehaviorNotClusterError for a present non-cluster behavior", () => {
            expect(() => peer1.globalsOf("network")).to.throw(EndpointBehaviorNotClusterError);
        });

        it("maybeFeaturesOf returns undefined for a present non-cluster behavior", () => {
            expect(peer1.maybeFeaturesOf("network")).to.equal(undefined);
        });

        it("maybeGlobalsOf returns undefined for a present non-cluster behavior", () => {
            expect(peer1.maybeGlobalsOf("network")).to.equal(undefined);
        });
    });
});
