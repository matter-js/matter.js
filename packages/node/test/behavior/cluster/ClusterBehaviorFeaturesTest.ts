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
import { camelize, ImplementationError, isDeepEqual } from "@matter/general";
import { ClusterModel } from "@matter/model";
import { causeMessagesOf } from "@matter/node/testing";
import { ClusterType } from "@matter/types";
import { LevelControl } from "@matter/types/clusters/level-control";
import { Thermostat } from "@matter/types/clusters/thermostat";
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
    GroupcastServer: ["listener", "sender", "perGroup"],
    GroupsServer: ["groupNames"],
    IcdManagementServer: ["checkInProtocolSupport"],
    ScenesManagementServer: ["sceneNames"],
    TimeFormatLocalizationServer: ["calendarFormat"],
    UnitLocalizationServer: ["temperatureUnit"],
};

/**
 * Defaults a published server sets for an attribute that the plain model behavior with the same features leaves
 * undefined, by "Server.attribute".  A default makes an optional attribute appear in the AttributeList.  A new entry
 * means a default leaks from a server's internal base into the narrowed class; a missing entry means a derivation
 * dropped a server's own default.  Only selections of up to two features are checked.
 */
const SERVER_ONLY_DEFAULTS: Record<string, unknown[]> = {
    "AdministratorCommissioningServer.windowStatus": [0],
    "BasicInformationServer.maxPathsPerInvoke": [0],
    "ColorControlServer.colorLoopActive": [0],
    "ColorControlServer.colorLoopDirection": [1],
    "ColorControlServer.enhancedColorMode": [1],
};

interface FeatureSelectable {
    with(...features: string[]): { defaults: Record<string, unknown> };
    cluster: { features?: Record<string, unknown> };
}

function isFeatureSelectable(type: unknown): type is FeatureSelectable {
    return (
        typeof type === "function" &&
        "with" in type &&
        typeof type.with === "function" &&
        "cluster" in type &&
        typeof type.cluster === "object" &&
        type.cluster !== null
    );
}

/**
 * No feature, each single feature and each pair of features.
 */
function featureSelectionsOf(type: FeatureSelectable) {
    const features = Object.keys(type.cluster.features ?? {});
    const selections: string[][] = [[], ...features.map(feature => [feature])];
    for (let i = 0; i < features.length; i++) {
        for (let j = i + 1; j < features.length; j++) {
            selections.push([features[i], features[j]]);
        }
    }
    return selections;
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

        describe("defaults of an attribute mandatory in the base and optional in the derivative", () => {
            // ThermostatRunningMode conformance is "TEVT & AUTO, [AUTO]" and the base selects both features
            const AutoAndEvents = ThermostatBaseServer.with("Heating", "Cooling", "AutoMode", "Events");

            it("drops the default the schema selected", () => {
                expect(AutoAndEvents.defaults.thermostatRunningMode).equals(Thermostat.ThermostatRunningMode.Off);
                expect(AutoAndEvents.with("Heating", "Cooling", "AutoMode").defaults.thermostatRunningMode).undefined;
            });

            it("does not restore the default the schema selected after a derivative dropped the attribute", () => {
                const Restored = AutoAndEvents.with("Heating").with("Heating", "Cooling", "AutoMode");
                expect(Restored.defaults.thermostatRunningMode).undefined;
            });

            it("keeps a default the application set", () => {
                const Set = AutoAndEvents.set({ thermostatRunningMode: Thermostat.ThermostatRunningMode.Heat });
                expect(Set.with("Heating", "Cooling", "AutoMode").defaults.thermostatRunningMode).equals(
                    Thermostat.ThermostatRunningMode.Heat,
                );
            });

            it("keeps a default the application set to the schema default", () => {
                const Set = AutoAndEvents.set({ thermostatRunningMode: Thermostat.ThermostatRunningMode.Off });
                expect(Set.with("Heating", "Cooling", "AutoMode").defaults.thermostatRunningMode).equals(
                    Thermostat.ThermostatRunningMode.Off,
                );
            });

            it("drops a default the schema selected after the application unset the attribute", () => {
                const Unset = AutoAndEvents.with("Heating", "Cooling", "AutoMode").set({
                    thermostatRunningMode: undefined,
                });
                const Reselected = Unset.with("Heating", "Cooling", "AutoMode", "Events").with(
                    "Heating",
                    "Cooling",
                    "AutoMode",
                );
                expect(Reselected.defaults.thermostatRunningMode).undefined;
            });

            it("restores a default the application set after a derivative dropped the attribute", () => {
                const Set = AutoAndEvents.set({ thermostatRunningMode: Thermostat.ThermostatRunningMode.Heat });
                const Restored = Set.with("Heating").with("Heating", "Cooling", "AutoMode");
                expect(Restored.defaults.thermostatRunningMode).equals(Thermostat.ThermostatRunningMode.Heat);
            });
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
                "events",
                "heating",
                "matterScheduleConfiguration",
                "occupancy",
                "presets",
                "thermostatSuggestions",
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
                await causeMessagesOf(MockEndpoint.create(MockEndpointType.with(PowerSourceServer), { powerSource })),
            ).match(/select at least one of Wired or Battery/);

            expect(
                await causeMessagesOf(
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

        it("set defaults the model leaves undefined only where pinned", () => {
            const actual: Record<string, unknown[]> = {};
            const exportsByName = new Map<string, unknown>(Object.entries(behaviors));

            for (const [name, server] of exportsByName) {
                const model = exportsByName.get(name.replace(/Server$/, "Behavior"));
                if (!name.endsWith("Server") || !isFeatureSelectable(server) || !isFeatureSelectable(model)) {
                    continue;
                }

                for (const features of featureSelectionsOf(server)) {
                    const serverDefaults = server.with(...features).defaults;
                    const modelDefaults = model.with(...features).defaults;

                    for (const [attribute, value] of Object.entries(serverDefaults)) {
                        if (
                            value === undefined ||
                            modelDefaults[attribute] !== undefined ||
                            !(attribute in modelDefaults)
                        ) {
                            continue;
                        }
                        const values = (actual[`${name}.${attribute}`] ??= new Array<unknown>());
                        if (!values.some(known => isDeepEqual(known, value))) {
                            values.push(value);
                        }
                    }
                }
            }

            expect(actual).deep.equals(SERVER_ONLY_DEFAULTS);
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
