/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClusterModel,
    DatatypeModel,
    DefinitionError,
    DeviceTypeModel,
    FieldModel,
    Matter,
    ValidateModel,
} from "@matter/model";
import * as behaviors from "../../../src/behaviors/index.js";

/**
 * The schemas the published behaviors implement, each once.
 */
function behaviorSchemas() {
    const schemas = new Map<ClusterModel, string>();
    for (const [name, type] of Object.entries(behaviors)) {
        const schema: unknown = typeof type === "function" ? Reflect.get(type, "schema") : undefined;
        if (schema instanceof ClusterModel && !schemas.has(schema)) {
            schemas.set(schema, name);
        }
    }
    return schemas;
}

/**
 * A behavior keeps internal state in fields of its schema that the specification does not define, and derives datatypes
 * for them by extending a specification datatype.  A field is no attribute and holds a JavaScript value rather than a
 * Matter type, so validation reports it as a child a cluster may not have and as a value without a type; a derived
 * datatype takes its structure from the datatype it extends rather than from a type, so validation reports it as a value
 * without a type.  Only those reports, and only for an element whose name the standard cluster does not use, are
 * expected.
 */
function unexpectedErrorsOf(schema: ClusterModel) {
    const standard = Matter.clusters(schema.id);
    const cluster = Matter.withClusters(schema).clusters(schema.id);
    if (standard === undefined || cluster === undefined) {
        return [{ code: "NOT_STANDARD", source: schema.path, message: "Schema implements no standard cluster" }];
    }

    // An element the standard cluster names at all is a specification element, whatever the schema makes of it
    const fields = new Set<string>();
    const internal = new Set<string>();
    for (const child of cluster.children) {
        if (standard.children.some(existing => existing.name === child.name)) {
            continue;
        }
        if (child instanceof FieldModel) {
            fields.add(child.path);
            internal.add(child.path);
        } else if (child instanceof DatatypeModel && child.operationalBase !== undefined) {
            internal.add(child.path);
        }
    }

    return ValidateModel(cluster).errors.filter(
        (error: DefinitionError) =>
            !(error.code === "NO_TYPE" && internal.has(error.source)) &&
            !(error.code === "UNACCEPTABLE_TYPE" && [...fields].some(path => error.message.startsWith(`${path} `))),
    );
}

describe("BehaviorSchemaValidation", () => {
    const schemas = behaviorSchemas();

    it("finds the schemas the behaviors implement", () => {
        expect(schemas.size).greaterThan(100);
    });

    it("reports a datatype the schema adds without a type", () => {
        const identify = Matter.clusters("Identify")!;
        const schema = identify.extend({}, new DatatypeModel({ name: "StrayStruct" }));

        expect(unexpectedErrorsOf(schema).map(error => error.code)).contains("NO_TYPE");
    });

    it("reports a child a cluster may not have that is no field", () => {
        const identify = Matter.clusters("Identify")!;
        const schema = identify.extend({}, new DeviceTypeModel({ name: "Stray", classification: "simple" }));

        expect(unexpectedErrorsOf(schema).map(error => error.code)).contains("UNACCEPTABLE_TYPE");
    });

    for (const [schema, name] of schemas) {
        it(`validates the schema of ${name}`, () => {
            expect(unexpectedErrorsOf(schema)).deep.equals([]);
        });
    }
});
