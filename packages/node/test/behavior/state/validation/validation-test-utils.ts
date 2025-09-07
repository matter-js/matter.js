/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { Properties } from "#general";
import { AttributeModel, ClusterModel, DataModelPath, FeatureMap, FeatureSet, FieldElement, FieldModel } from "#model";
import { StatusResponseError } from "#types";

export function Fields(
    ...definition: {
        name?: string;
        type?: string;
        conformance?: string;
        constraint?: string;
        quality?: string;
        children?: FieldElement[];
    }[]
): Fields {
    return definition.map(
        f =>
            new FieldModel({
                name: f.name ?? "Test",
                type: f.type ?? "int16",
                ...f,
            }),
    );
}

export function Features(definition: { [code: string]: string }): AttributeModel {
    const result = FeatureMap.clone();

    result.children = Object.entries(definition).map(
        ([name, title], index) =>
            new FieldModel({
                name,
                title,
                constraint: index,
            }),
    );

    return result;
}

export function Tests(...definition: (Fields | Features | Tests["entries"])[]): Tests {
    const result = { [NESTING]: true } as Tests;
    for (const d of definition) {
        if (Array.isArray(d)) {
            result.fields = d;
        } else if (d instanceof AttributeModel) {
            result.features = d;
        } else {
            result.entries = d;
        }
    }
    return result;
}

const NESTING: unique symbol = Symbol("NESTING");

function validate({ fields, features }: ClusterStructure, { supports, record, error }: Test) {
    if (!fields) {
        throw new Error("Validation attempt with no fields defined");
    }

    // Create cluster
    const cluster = new ClusterModel({
        name: "Test",

        children: [features ? features.clone() : FeatureMap.clone(), ...fields.map(field => field.clone())],
    });
    cluster.supportedFeatures = supports;

    // Obtain a manager
    const root = RootSupervisor.for(cluster);
    const manager = root.get(cluster);

    // Perform validation
    try {
        manager.validate?.(record ?? {}, LocalActorContext.ReadOnly, { path: DataModelPath(cluster.path) });
        expect(error, `Expected ${error?.constructor.name} but none thrown`);
    } catch (e) {
        if (!error || (e as any).constructor.name === "AssertionError") {
            throw e;
        }
        expect(e).instanceof(error.type);
        expect((e as Error).message).equals(`${error.message} (${new error.type("", {}).code})`);
    }
}

export function testValidation(description: string, what: Tests | Test, structure: ClusterStructure = {}) {
    const { only, fields, features } = what;
    if (only) {
        structure = { ...structure, only };
    }
    if (fields) {
        structure = { ...structure, fields };
    }
    if (features) {
        structure = { ...structure, features };
    }

    if (what[NESTING]) {
        describe(description, () => {
            for (const k in what.entries) {
                testValidation(k, what.entries[k], structure);
            }
        });
    } else {
        let generator = it;
        if (only) {
            generator = generator.only as Mocha.TestFunction;
        }
        generator(description, () => validate(structure, what));
    }
}

type Fields = FieldModel[];
type Features = AttributeModel;

type ClusterStructure = {
    only?: boolean;
    fields?: Fields;
    features?: Features;
};

type Test = ClusterStructure & {
    [NESTING]?: false;
    only?: boolean;
    supports?: FeatureSet.Definition;
    record?: Properties;
    error?: { type: new (...args: any[]) => StatusResponseError; message?: string };
};

type Tests = ClusterStructure & {
    [NESTING]: true;
    entries: { [description: string]: Tests | Test };
};
