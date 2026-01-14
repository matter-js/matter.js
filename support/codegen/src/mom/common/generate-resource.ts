/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Model, Resource } from "#model";
import { Block, TsFile } from "#util/TsFile.js";
import { addDetails, addProperties } from "./element-generation.js";

export function generateResource(target: TsFile, element: Model): boolean {
    const patch = generateResourceDefinition(element);
    if (!patch) {
        return false;
    }

    target.addImport("#models/Resource.js", "Resource");
    const expr = target.expressions(`Resource.add(`, ")");

    addResource(expr, patch);

    return true;
}

function addResource(target: Block, definition: Resource.Named) {
    const expr = target.expressions("{", "}");

    let props = { ...definition } as Record<string, unknown>;

    delete props.tag;
    delete props.name;
    delete props.discriminator;
    delete props.children;

    let hasProps = !!Object.keys(props).length;
    const hasChildren = !!definition.children?.length;

    if (!hasProps && !hasChildren) {
        return;
    }

    // Add identifying fields
    if (hasProps || hasChildren) {
        const { tag, name, discriminator } = definition;
        const identity = { tag, name } as Record<string, unknown>;
        if (discriminator) {
            identity.discriminator = discriminator;
        }

        if (hasProps) {
            props = {
                ...identity,
                ...Object.fromEntries(
                    Object.entries(props).sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" })),
                ),
            };
        } else {
            hasProps = true;
            props = identity;
        }
    }

    if (hasProps) {
        delete props.details;

        addProperties(expr, props);
        addDetails(expr, definition);
    }

    if (hasChildren) {
        const children = expr.expressions("children: [", "]");
        for (const child of definition.children!) {
            if (child) {
                addResource(children, child);
            } else {
                children.atom("undefined");
            }
        }
    }

    return true;
}

function generateResourceDefinition(element: Model): Resource.Named | undefined {
    const resources = element.hasLocalResource ? element.resource : undefined;
    const children = element.hasChildren
        ? (element.children.map(generateResourceDefinition).filter(c => c) as Resource.Named[])
        : undefined;

    let definition: Resource.Named | undefined;
    if (resources) {
        const entries = Object.entries(resources).filter(
            ([k, v]) => v !== undefined && k !== "asOf" && k !== "until" && k !== "matchTo" && k !== "errors",
        );
        if (entries.length) {
            definition = { tag: element.tag, name: element.name, ...Object.fromEntries(entries) };
        }
    }

    if (children?.length) {
        if (definition) {
            definition.children = children;
        } else {
            definition = { tag: element.tag, name: element.name, children: children };
        }
    }

    if (definition && (element.parent?.all(element.constructor as Model.Type, definition.name).length ?? 0) > 1) {
        definition.discriminator = Resource.discriminatorFor(element);
    }

    return definition;
}
