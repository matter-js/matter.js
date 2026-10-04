/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, DatatypeModel, DefinitionError, DeviceTypeModel, Matter, ValidateModel } from "@matter/model";
import * as behaviors from "../../../src/behaviors/index.js";

/**
 * The elements behaviors add to their schemas to keep internal state, by cluster.
 *
 * Such an element is no specification element: a field holds a JavaScript value rather than a Matter type, and a
 * datatype derives its structure from the one it extends.  Validation reports them as a child a cluster may not have
 * and as a value without a type, and those two reports are expected for exactly these elements.  A behavior that adds
 * internal state adds its element here.
 */
const INTERNAL_ELEMENTS: Record<string, string[]> = {
    ColorControl: ["managedTransitionTimeHandling", "transitionEndTime", "transitionStepInterval"],
    DoorLock: ["credentialKey", "credentials", "holidaySchedules", "users", "weekDaySchedules", "yearDaySchedules"],
    GeneralCommissioning: ["allowCountryCodeChange", "countryCodeWhitelist"],
    GeneralDiagnostics: ["deviceTestEnableKey", "totalOperationalHoursCounter"],
    GroupKeyManagement: ["GroupKeySetStructFS", "groupKeySets"],
    Groupcast: ["groupProperties"],
    IcdManagement: ["icdKeys"],
    Identify: ["isIdentifying"],
    LevelControl: ["managedTransitionTimeHandling", "transitionEndTime", "transitionStepInterval"],
    OperationalCredentials: ["certification"],
    OtaSoftwareUpdateProvider: ["applyDelay"],
    OtaSoftwareUpdateRequestor: [
        "activeOtaProviders",
        "announcedUpdateQueryDelay",
        "canConsent",
        "downloadLocation",
        "minimumApplyDelay",
        "minimumQueryInterval",
        "transferProtocolsSupported",
        "updateInProgressDetails",
        "updateQueryInterval",
    ],
    ScenesManagement: ["sceneTable"],
    Switch: ["debounceDelay", "longPressDelay", "momentaryNeutralPosition", "multiPressDelay", "rawPosition"],
    Thermostat: [
        "PersistedPresets",
        "externalMeasuredIndoorTemperature",
        "externallyMeasuredOccupancy",
        "localIndoorTemperatureMeasurementEndpoint",
        "localOccupancyMeasurementEndpoint",
        "useAutomaticModeManagement",
    ],
    UserLabel: ["maxLabels"],
    WindowCovering: ["supportsMaintenanceMode"],
};

/**
 * The schemas the published behaviors implement, each once.
 *
 * A behavior's schema gains the fields of its state class when the behavior resolves, which building its supervisor
 * does, so the supervisor comes first or the schema depends on which tests used the behavior before.
 */
function behaviorSchemas() {
    const schemas = new Map<ClusterModel, string>();
    for (const [name, type] of Object.entries(behaviors)) {
        if (typeof type === "function") {
            Reflect.get(type, "supervisor");
        }
        const schema: unknown = typeof type === "function" ? Reflect.get(type, "schema") : undefined;
        if (schema instanceof ClusterModel && !schemas.has(schema)) {
            schemas.set(schema, name);
        }
    }
    return schemas;
}

function unexpectedErrorsOf(schema: ClusterModel) {
    const cluster = Matter.withClusters(schema).clusters(schema.id);
    if (Matter.clusters(schema.id) === undefined || cluster === undefined) {
        return [{ code: "NOT_STANDARD", source: schema.path, message: "Schema implements no standard cluster" }];
    }

    const internal = (INTERNAL_ELEMENTS[cluster.name] ?? []).map(name => `${cluster.name}.${name}`);

    return ValidateModel(cluster).errors.filter(
        (error: DefinitionError) =>
            !(error.code === "NO_TYPE" && internal.includes(error.source)) &&
            !(error.code === "UNACCEPTABLE_TYPE" && internal.some(path => error.message.startsWith(`${path} `))),
    );
}

describe("BehaviorSchemaValidation", () => {
    const schemas = behaviorSchemas();

    it("finds the schemas the behaviors implement", () => {
        expect(schemas.size).greaterThan(100);
    });

    it("lists only internal elements the schemas define", () => {
        const defined = new Set<string>();
        for (const schema of schemas.keys()) {
            for (const child of schema.children) {
                defined.add(`${schema.name}.${child.name}`);
            }
        }

        const stale = Object.entries(INTERNAL_ELEMENTS).flatMap(([cluster, names]) =>
            names.map(name => `${cluster}.${name}`).filter(path => !defined.has(path)),
        );
        expect(stale).deep.equals([]);
    });

    it("reports a datatype the schema adds without a type", () => {
        const schema = Matter.clusters("Identify")!.extend({}, new DatatypeModel({ name: "StrayStruct" }));
        schema.finalize();

        expect(unexpectedErrorsOf(schema).map(error => error.code)).contains("NO_TYPE");
    });

    it("reports a child a cluster may not have that is no field", () => {
        const schema = Matter.clusters("Identify")!.extend(
            {},
            new DeviceTypeModel({ name: "Stray", classification: "simple" }),
        );
        schema.finalize();

        expect(unexpectedErrorsOf(schema).map(error => error.code)).contains("UNACCEPTABLE_TYPE");
    });

    for (const [schema, name] of schemas) {
        it(`validates the schema of ${name}`, () => {
            expect(unexpectedErrorsOf(schema)).deep.equals([]);
        });
    }
});
