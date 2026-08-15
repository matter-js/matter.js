/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupsServer } from "#behaviors/groups";
import { LevelControlBaseServer, LevelControlBehavior, LevelControlServer } from "#behaviors/level-control";
import { OnOffBaseServer, OnOffServer } from "#behaviors/on-off";
import { PowerSourceServer } from "#behaviors/power-source";
import { ServiceAreaBaseServer, ServiceAreaServer } from "#behaviors/service-area";
import { ThermostatBaseServer, ThermostatServer } from "#behaviors/thermostat";
import { WindowCoveringBaseServer, WindowCoveringServer } from "#behaviors/window-covering";
import { camelize, ImplementationError, MatterAggregateError } from "@matter/general";
import { ClusterModel } from "@matter/model";
import { ClusterType } from "@matter/types";
import { LevelControl } from "@matter/types/clusters/level-control";
import * as behaviors from "../../../src/behaviors/index.js";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";
import { MockEndpointType } from "../mock-behavior.js";

/**
 * Published behaviors that enable features unconditionally because matter.js implements them for every consumer.  Every
 * other published behavior must enable nothing so consumers select the features their device supports.
 */
const INTENTIONALLY_ENABLED: Record<string, string[]> = {
    AccessControlServer: ["extension"],
    BooleanStateServer: ["changeEvent"],
    GeneralDiagnosticsServer: ["dataModelTest"],
    GroupsServer: ["groupNames"],
    IcdManagementServer: ["checkInProtocolSupport"],
    ScenesManagementServer: ["sceneNames"],
    TimeFormatLocalizationServer: ["calendarFormat"],
    UnitLocalizationServer: ["temperatureUnit"],
};

/**
 * Endpoint construction reports behavior failures as an aggregate, so assert against the whole cause chain.
 */
async function causeChainOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        const messages = new Array<string>();
        const pending = [error];
        while (pending.length) {
            const next = pending.shift();
            if (!(next instanceof Error)) {
                continue;
            }
            messages.push(next.message);
            pending.push(next.cause, ...(next instanceof MatterAggregateError ? next.errors : []));
        }
        return messages.join(" / ");
    }

    throw new Error("Expected endpoint construction to fail");
}

function enabledFeaturesOf(type: { features: Record<string, boolean> }) {
    return Object.entries(type.features)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .sort();
}

describe("cluster behavior feature selection", () => {
    describe("with()", () => {
        it("selects exactly the named features", () => {
            expect(LevelControlBaseServer.with("Lighting", "Frequency").features).deep.equals({
                onOff: false,
                lighting: true,
                frequency: true,
            });
        });

        it("drops all features when invoked with no features", () => {
            expect(LevelControlBaseServer.with().features).deep.equals({
                onOff: false,
                lighting: false,
                frequency: false,
            });
        });

        it("drops elements gated by a dropped feature", () => {
            expect(LevelControlBaseServer.defaults.remainingTime).equals(0);
            expect(LevelControlBaseServer.defaults.startUpCurrentLevel).equals(null);

            const Dropped = LevelControlBaseServer.with();
            expect(Dropped.schema.supportedFeatures.has("LT")).equals(false);
            expect(Dropped.defaults).not.property("remainingTime", 0);
            expect(Dropped.defaults).not.property("startUpCurrentLevel", null);
        });

        it("rejects a feature the cluster does not define", () => {
            expect(() => (LevelControlBaseServer.with as (...features: string[]) => unknown)("Lightning")).throws(
                ImplementationError,
                /no feature "Lightning"/,
            );
        });
    });

    describe("for()", () => {
        // The namespace `with()` shim is a deprecated compat layer with no declared type
        const LegacyLevelControl = LevelControl as ClusterType.WithCompat<typeof LevelControl, LevelControl>;

        it("leaves feature selection alone for a namespace that designates no features", () => {
            expect((LevelControl as { supportedFeatures?: unknown }).supportedFeatures).equals(undefined);
            expect(enabledFeaturesOf(LevelControlBaseServer.for(LevelControl))).deep.equals(
                enabledFeaturesOf(LevelControlBaseServer),
            );
        });

        it("adopts the feature selection a namespace designates", () => {
            const ns = LegacyLevelControl.with("Lighting");

            expect(enabledFeaturesOf(LevelControlBaseServer.for(ns))).deep.equals(["lighting"]);
        });

        it("caches per designated feature selection", () => {
            expect(LegacyLevelControl.with("Lighting")).equals(LegacyLevelControl.with("Lighting"));
            expect(LevelControlBaseServer.for(LegacyLevelControl.with("Lighting"))).equals(
                LevelControlBaseServer.for(LegacyLevelControl.with("Lighting")),
            );
        });
    });

    describe("alter() and enable()", () => {
        it("alter retains feature selection", () => {
            const Altered = LevelControlBaseServer.alter({ attributes: { currentLevel: { min: 1, max: 254 } } });

            expect(Altered.features).deep.equals(LevelControlBaseServer.features);
        });

        it("enable retains feature selection", () => {
            const Enabled = LevelControlBaseServer.enable({ attributes: { onOffTransitionTime: true } });

            expect(Enabled.features).deep.equals(LevelControlBaseServer.features);
        });
    });

    describe("published behaviors", () => {
        it("LevelControl enables nothing, though the spec assigns OnOff a fallback of 1", () => {
            // The model carries the specification's fallback; it conveys no selection
            expect(LevelControl.schema.features.find(feature => feature.name === "OO")?.default).equals(1);

            expect(enabledFeaturesOf(LevelControlBehavior)).deep.equals([]);
            expect(enabledFeaturesOf(LevelControlServer)).deep.equals([]);
        });

        it("publish nothing of what their base implementation enables", () => {
            expect(enabledFeaturesOf(OnOffBaseServer)).deep.equals(["lighting"]);
            expect(enabledFeaturesOf(OnOffServer)).deep.equals([]);

            expect(enabledFeaturesOf(ServiceAreaBaseServer)).deep.equals(["maps", "progressReporting"]);
            expect(enabledFeaturesOf(ServiceAreaServer)).deep.equals([]);

            expect(enabledFeaturesOf(ThermostatBaseServer)).deep.equals([
                "autoMode",
                "cooling",
                "heating",
                "occupancy",
                "presets",
            ]);
            expect(enabledFeaturesOf(ThermostatServer)).deep.equals([]);

            expect(enabledFeaturesOf(WindowCoveringBaseServer)).deep.equals([
                "lift",
                "positionAwareLift",
                "positionAwareTilt",
                "tilt",
            ]);
            expect(enabledFeaturesOf(WindowCoveringServer)).deep.equals([]);
        });

        it("retain features enabled as a matter.js implementation decision", () => {
            expect(enabledFeaturesOf(GroupsServer)).deep.equals(["groupNames"]);
        });

        it("do not serve Lighting elements on an endpoint", async () => {
            const endpoint = await MockEndpoint.create(MockEndpointType.with(LevelControlServer), {
                levelControl: { minLevel: 0, currentLevel: 0 },
            });

            expect(endpoint.state.levelControl.minLevel).equals(0);

            const served = endpoint.behaviors.elementsOf(LevelControlServer).attributes;
            expect(served.has("currentLevel")).equals(true);
            expect(served.has("remainingTime")).equals(false);
            expect(served.has("startUpCurrentLevel")).equals(false);

            await endpoint.close();
        });

        it("are rejected on an endpoint when the selection violates FeatureMap conformance", async () => {
            const powerSource = { status: 1, order: 1, description: "test" };

            expect(
                await causeChainOf(MockEndpoint.create(MockEndpointType.with(PowerSourceServer), { powerSource })),
            ).match(/select at least one of Wired or Battery/);

            expect(
                await causeChainOf(
                    MockEndpoint.create(MockEndpointType.with(PowerSourceServer.with("Wired", "Battery")), {
                        powerSource: {
                            ...powerSource,
                            wiredCurrentType: 0,
                            batChargeLevel: 0,
                            batReplacementNeeded: false,
                            batReplaceability: 0,
                        },
                    }),
                ),
            ).match(/features Wired and Battery cannot be selected together/);

            const endpoint = await MockEndpoint.create(MockEndpointType.with(PowerSourceServer.with("Wired")), {
                powerSource: { ...powerSource, wiredCurrentType: 0 },
            });
            await endpoint.close();
        });

        it("enable only features matter.js implements unconditionally", () => {
            const unexpected = new Array<string>();

            for (const [name, type] of Object.entries(behaviors)) {
                // A *BaseServer carries the features its default logic implements so subclasses may override the
                // corresponding methods.  It is an extension point, not an endpoint-ready export
                if (typeof type !== "function" || name.endsWith("BaseServer")) {
                    continue;
                }

                const schema = (type as { schema?: unknown }).schema;
                if (!(schema instanceof ClusterModel) || schema.id === undefined) {
                    continue;
                }

                const mandatory = schema.features
                    .filter(feature => feature.effectiveConformance.isMandatory)
                    .map(feature => camelize(feature.title ?? feature.name));

                const expected = [...new Set([...(INTENTIONALLY_ENABLED[name] ?? []), ...mandatory])]
                    .map(feature => camelize(feature))
                    .sort();
                const actual = enabledFeaturesOf(type as { features: Record<string, boolean> });

                if (actual.join(",") !== expected.join(",")) {
                    unexpected.push(`${name}: expected [${expected}], got [${actual}]`);
                }
            }

            expect(unexpected).deep.equals([]);
        });
    });
});
