/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, DefinitionError, Matter, ValidateModel } from "@matter/model";
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
 * A behavior keeps internal state in fields of its schema that the specification does not define.  They are no
 * attribute and hold a JavaScript value rather than a Matter type, so validation reports them as a child a cluster may
 * not have and as a value without a type.  Only those two reports, and only for an element the standard cluster lacks,
 * are expected.
 */
function unexpectedErrorsOf(schema: ClusterModel) {
    const standard = Matter.clusters(schema.id);
    const cluster = Matter.withClusters(schema).clusters(schema.id);
    if (standard === undefined || cluster === undefined) {
        return [{ code: "NOT_STANDARD", source: schema.path, message: "Schema implements no standard cluster" }];
    }

    // An element the standard cluster names at all is a specification element, whatever the schema makes of it
    const internal = new Set<string>();
    for (const child of cluster.children) {
        if (!standard.children.some(existing => existing.name === child.name)) {
            internal.add(child.path);
        }
    }

    return ValidateModel(cluster).errors.filter(
        (error: DefinitionError) =>
            !(error.code === "NO_TYPE" && internal.has(error.source)) &&
            !(error.code === "UNACCEPTABLE_TYPE" && [...internal].some(path => error.message.startsWith(`${path} `))),
    );
}

describe("BehaviorSchemaValidation", () => {
    const schemas = behaviorSchemas();

    it("finds the schemas the behaviors implement", () => {
        expect(schemas.size).greaterThan(100);
    });

    for (const [schema, name] of schemas) {
        it(`validates the schema of ${name}`, () => {
            expect(unexpectedErrorsOf(schema)).deep.equals([]);
        });
    }
});
