/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Model, RequirementModel, ValueModel } from "#model";

/**
 * What one element of a model contributes to a removal comparison.
 *
 * Only the properties whose loss cannot be recovered from a later regeneration are recorded. An identifier in
 * particular is a reservation: once it leaves the model nothing stops a later revision reusing it for something else,
 * and nothing in the build would notice.
 */
export interface ElementDigest {
    tag: string;
    name: string;
    id?: number;
    constraint?: string;
    default?: string;
    conformance?: string;
    access?: string;
    quality?: string;
    location?: string;
}

export type ModelDigest = Record<string, ElementDigest>;

/**
 * An absent constraint is an empty {@link Constraint} rather than `undefined`, and it renders as "all". Reading it
 * through `toString` alone therefore makes every unconstrained element look constrained, which hides exactly the
 * removal this digest exists to report.
 */
/**
 * A constraint and a default are declared by {@link ValueModel} and, separately, by {@link RequirementModel}, which
 * does not derive from it. Narrowing over both is what avoids asserting a shape onto {@link Model}.
 */
function bounded(model: Model): model is ValueModel | RequirementModel {
    return model instanceof ValueModel || model instanceof RequirementModel;
}

function constraintOf(model: Model) {
    if (!bounded(model) || model.constraint.isEmpty) {
        return;
    }
    const text = model.constraint.toString();
    return text === "" ? undefined : text;
}

/**
 * Render a stated value so that changing any part of it changes the text.
 *
 * Interpolating an object yields "[object Object]", which every device type's DeviceTypeList default is, so altering
 * the device type or revision it names would read as no change at all.
 */
function stateOf(value: unknown): string {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return `[${value.map(stateOf).join(",")}]`;
    }

    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => `${k}=${stateOf(v)}`);
        return `{${entries.join(",")}}`;
    }

    return `${value}`;
}

function defaultOf(model: Model) {
    if (!bounded(model)) {
        return;
    }
    const value = model.default;
    if (value === undefined) {
        return;
    }

    // An explicit null is a stated default.  Reading it as absent makes its removal undetectable.
    return stateOf(value);
}

/**
 * Read an aspect that renders as text and knows whether it states anything.
 *
 * Conformance, access and quality each carry specification content this generator has already been caught losing —
 * the fabric scoping of a command, for one — so the guard has to see them disappear.
 */
function aspectOf(model: Model, name: "conformance" | "access" | "quality") {
    const aspect = (model as Model & Record<string, unknown>)[name];
    if (aspect === undefined || aspect === null) {
        return;
    }
    if (typeof aspect === "object" && "isEmpty" in aspect && aspect.isEmpty) {
        return;
    }
    const text = `${aspect}`;
    return text === "" ? undefined : text;
}

/**
 * Identify an element within its parent.
 *
 * An identifier is what this comparison protects, so it is the identity where the specification states one: renaming
 * an element keeps its reservation, while moving that reservation to a different identifier does not. An element with
 * no identifier has only its name to be known by.
 */
function localKeyOf(model: Model) {
    const identity = model.id === undefined ? `:${model.name}` : `#${model.id}`;

    // Every requirement carries the tag "requirement", so the identifier alone does not tell two of them apart. A
    // device type requiring two Power Sources, or the same cluster as both server and client, states each separately
    // and losing one must not read as losing nothing.
    if (model instanceof RequirementModel) {
        const instance = model.instanceNumber === undefined ? "" : `@${model.instanceNumber}`;
        return `${model.element}${identity}${instance}`;
    }

    return `${model.tag}${identity}`;
}

/**
 * Key an element by where it sits rather than by its identity alone, so two elements alike in different clusters do
 * not collide and a move reads as a removal plus an addition.
 */
function keyOf(path: string[], model: Model) {
    return [...path, localKeyOf(model)].join("/");
}

/**
 * Reduce a model to the facts a removal comparison needs.
 */
export function digestOf(root: Model) {
    const digest: ModelDigest = {};

    function visit(model: Model, path: string[]) {
        const key = keyOf(path, model);

        digest[key] = {
            tag: model.tag,
            name: model.name,
            id: model.id,
            constraint: constraintOf(model),
            default: defaultOf(model),
            conformance: aspectOf(model, "conformance"),
            access: aspectOf(model, "access"),
            quality: aspectOf(model, "quality"),
            location: model instanceof RequirementModel ? model.location : undefined,
        };

        for (const child of model.children) {
            visit(child as Model, [...path, localKeyOf(model)]);
        }
    }

    for (const child of root.children) {
        visit(child as Model, []);
    }

    return digest;
}

export type LossKind = "element" | "id" | "constraint" | "default" | "conformance" | "access" | "quality" | "location";

export interface Loss {
    kind: LossKind;
    key: string;
    was: string;

    /** What the element states instead, where it still states something */
    now?: string;
}

/**
 * Properties whose content the specification states and a regeneration can quietly change.
 */
const STATED = ["constraint", "default", "conformance", "access", "quality", "location"] as const;

/**
 * Report everything {@link previous} states that {@link next} no longer states the same way.
 *
 * A regeneration against a newer specification takes whatever that specification took, and nothing fails. The only
 * signal is a smaller generated file, which is why losses of this kind have gone unnoticed through a whole release.
 *
 * A change counts, not only a disappearance: narrowing a constraint, or dropping the fabric-scoping flag from an
 * access string that still says something else, loses exactly as much as deleting it.
 */
export function findLosses(previous: ModelDigest, next: ModelDigest) {
    const losses = Array<Loss>();

    for (const [key, before] of Object.entries(previous)) {
        const after = next[key];

        if (after === undefined) {
            losses.push({
                kind: "element",
                key,
                was: before.id === undefined ? before.tag : `id 0x${before.id.toString(16)}`,
            });
            continue;
        }

        for (const kind of STATED) {
            const was = before[kind];
            if (was === undefined || was === after[kind]) {
                continue;
            }
            losses.push({ kind, key, was, now: after[kind] });
        }
    }

    return losses;
}
