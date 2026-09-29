/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "#aspects/Conformance.js";
import { ElementTag } from "#common/ElementTag.js";
import { Specification } from "#common/Specification.js";
import { Model } from "#models/Model.js";
import { RequirementModel } from "#models/RequirementModel.js";
import { ValueModel } from "#models/ValueModel.js";
import { FeatureMap } from "#standard/elements/feature-map.element.js";
import { Diagnostic, isDeepEqual, serialize } from "@matter/general";
import { ModelVariantTraversal, VariantDetail } from "./ModelVariantTraversal.js";
import { RequirementResolver } from "./RequirementResolver.js";

/**
 * A high level summary of changes between two models.
 */
export type ModelDiff = ModelDiff.Add | ModelDiff.Delete | ModelDiff.Change | ModelDiff.Summary;

/**
 * Diff two models.
 *
 * Two elements match by ID or name, and a feature requirement matches by the feature it names, so a requirement that
 * names a feature by its title matches one that names it by its code. A matched element is changed if a property other
 * than documentation differs. Spellings of the same conformance compare alike: a feature without conformance and "O",
 * adjacent entries of an otherwise list and their disjunction, and a condition reference in any case and the condition
 * as declared. A change states each property as written.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.3.11
 *
 * Changes below {@link depth} are counted rather than listed.
 */
export function ModelDiff(from: Model, to: Model, depth = 2) {
    const diff = new DiffTraversal().traverse({ from, to });
    return diff === undefined ? undefined : truncated(diff, depth);
}

class DiffTraversal extends ModelVariantTraversal<ModelDiff | undefined> {
    constructor() {
        super(Specification.REVISION, ["from", "to"]);
    }

    protected override getCanonicalName(model: Model) {
        return featureNameOf(model) ?? super.getCanonicalName(model);
    }

    protected override visit(variants: VariantDetail, recurse: () => (ModelDiff | undefined)[]): ModelDiff | undefined {
        const { tag, name } = variants;
        const { from, to } = variants.map;

        if (to === undefined) {
            return from === undefined ? undefined : { kind: "delete", tag, name };
        }

        if (from === undefined) {
            return { kind: "add", tag, name };
        }

        const properties = propertyChangesOf(from, to);
        const children = recurse().filter(child => child !== undefined);

        if (properties === undefined && !children.length) {
            return;
        }

        return { kind: "change", tag, name, properties, children };
    }
}

/** The code of the feature a feature requirement names, which identifies it whether it names the feature by code or title */
function featureNameOf(model: Model) {
    return model instanceof RequirementModel ? RequirementResolver.featureMatching(model)?.name : undefined;
}

function propertyChangesOf(from: Model, to: Model) {
    const fromProperties = comparedPropertiesOf(from);
    const toProperties = comparedPropertiesOf(to);

    let changes: Record<string, ModelDiff.PropertyChange> | undefined;
    if ((featureNameOf(from) ?? from.name) !== (featureNameOf(to) ?? to.name)) {
        changes = { name: { from: from.name, to: to.name } };
    }
    for (const key of new Set([...fromProperties.keys(), ...toProperties.keys()])) {
        const fromProperty = fromProperties.get(key);
        const toProperty = toProperties.get(key);
        if (!isDeepEqual(fromProperty?.compared, toProperty?.compared)) {
            (changes ??= {})[key] = { from: fromProperty?.value, to: toProperty?.value };
        }
    }
    return changes;
}

/** Documentation, how a local override applies, and whether the element came from a seed model */
const IGNORED_PROPERTIES = new Set([
    "tag",
    "name",
    "children",
    "description",
    "details",
    "xref",
    "matchTo",
    "asOf",
    "until",
    "isSeed",
]);

/**
 * A property as written, and the value it compares by.
 */
interface ComparedProperty {
    value?: string;
    compared: unknown;
}

function comparedPropertiesOf(model: Model) {
    const properties = new Map<string, ComparedProperty>();
    for (const [name, value] of Object.entries(model.toElement())) {
        if (IGNORED_PROPERTIES.has(name) || value === undefined || name === "conformance") {
            continue;
        }
        properties.set(name, { value: typeof value === "string" ? value : serialize(value), compared: value });
    }

    const conformance = comparedConformanceOf(model);
    if (conformance !== undefined) {
        properties.set("conformance", conformance);
    }

    return properties;
}

function comparedConformanceOf(model: Model): ComparedProperty | undefined {
    if (!(model instanceof ValueModel || model instanceof RequirementModel)) {
        return undefined;
    }

    const { conformance } = model;
    if (conformance.isEmpty) {
        // 1.6.1 states "O" for every feature earlier revisions left blank
        return isFeature(model) ? { compared: { type: Conformance.Flag.Optional } } : undefined;
    }

    const ast =
        model instanceof RequirementModel
            ? (RequirementResolver.declaredConformanceOf(model) ?? conformance.ast)
            : conformance.ast;

    return { value: conformance.toString(), compared: withJoinedEntries(ast) };
}

function isFeature(model: Model) {
    const { parent } = model;
    return model.tag === ElementTag.Field && parent?.tag === ElementTag.Attribute && parent.id === FeatureMap.id;
}

/**
 * An otherwise list with each run of adjacent conditions joined into one disjunction, and each run of adjacent optional
 * conditions into one optional disjunction.
 *
 * An entry of an otherwise list applies only where no earlier one does, so "A, B" states the same conformance as
 * "A | B", and "[A], [B]" the same as "[A | B]".
 *
 * @see {@link MatterSpecification.v161.Core} § 7.3.11
 */
function withJoinedEntries(ast: Conformance.Ast): Conformance.Ast {
    if (ast.type !== Conformance.Special.Otherwise) {
        return ast;
    }

    const entries = new Array<Conformance.Ast>();
    for (const entry of ast.param) {
        const previous = entries.at(-1);
        if (previous !== undefined && isCondition(previous) && isCondition(entry)) {
            entries[entries.length - 1] = disjunction(previous, entry);
        } else if (
            previous?.type === Conformance.Special.OptionalIf &&
            entry.type === Conformance.Special.OptionalIf &&
            isCondition(previous.param) &&
            isCondition(entry.param)
        ) {
            entries[entries.length - 1] = {
                type: Conformance.Special.OptionalIf,
                param: disjunction(previous.param, entry.param),
            };
        } else {
            entries.push(entry);
        }
    }

    return entries.length === 1 ? entries[0] : { type: Conformance.Special.Otherwise, param: entries };
}

function disjunction(lhs: Conformance.Ast, rhs: Conformance.Ast): Conformance.Ast {
    return { type: Conformance.Operator.OR, param: { lhs, rhs } };
}

function isCondition(ast: Conformance.Ast) {
    return (
        ast.type === Conformance.Special.Name ||
        ast.type === Conformance.Operator.NOT ||
        ast.type === Conformance.Operator.DOT ||
        Conformance.isBinaryOperator(ast.type)
    );
}

/**
 * The diff with every change at {@link depth} summarized.
 */
function truncated(diff: ModelDiff, depth: number): ModelDiff {
    if (diff.kind !== "change" || !diff.children?.length) {
        return diff;
    }

    if (depth > 1) {
        return { ...diff, children: diff.children.map(child => truncated(child, depth - 1)) };
    }

    const summary: ModelDiff.Summary = {
        kind: "summary",
        tag: diff.tag,
        name: diff.name,
        properties: diff.properties,
        added: {},
        deleted: {},
        changed: {},
    };
    for (const child of diff.children) {
        const counts =
            child.kind === "add" ? summary.added : child.kind === "delete" ? summary.deleted : summary.changed;
        counts[child.tag] = (counts[child.tag] ?? 0) + 1;
    }
    return summary;
}

export namespace ModelDiff {
    /**
     * Convert a diff to a diagnostic for serialization.
     */
    export function diagnosticOf(diff: ModelDiff | undefined): unknown {
        if (diff === undefined) {
            return Diagnostic.weak("(unchanged)");
        }

        const id = `${diff.tag}#${diff.name}`;
        switch (diff.kind) {
            case "add":
                return Diagnostic.added(id);

            case "delete":
                return Diagnostic.deleted(id);

            case "change": {
                const details = [...propertyDiagnosticsOf(diff.properties), ...(diff.children ?? []).map(diagnosticOf)];
                return [id, Diagnostic.list(details)];
            }

            case "summary": {
                const counts = new Array<unknown>();
                for (const [tag, count] of Object.entries(diff.added)) {
                    counts.push(Diagnostic.added(`${count} ${tag}`));
                }
                for (const [tag, count] of Object.entries(diff.deleted)) {
                    counts.push(Diagnostic.deleted(`${count} ${tag}`));
                }
                for (const [tag, count] of Object.entries(diff.changed)) {
                    counts.push(`~${count} ${tag}`);
                }
                const properties = propertyDiagnosticsOf(diff.properties);
                return properties.length ? [id, ...counts, Diagnostic.list(properties)] : [id, ...counts];
            }
        }
    }

    function propertyDiagnosticsOf(properties: Record<string, PropertyChange> | undefined) {
        return Object.entries(properties ?? {}).map(([key, { from, to }]) =>
            Diagnostic.weak(`${key}: ${from ?? "(none)"} → ${to ?? "(none)"}`),
        );
    }

    export interface Identity {
        name: string;
        tag: ElementTag;
    }

    export interface Add extends Identity {
        kind: "add";
    }

    export interface Delete extends Identity {
        kind: "delete";
    }

    /**
     * An element in both models whose properties or children differ.
     */
    export interface Change extends Identity {
        kind: "change";
        properties?: Record<string, PropertyChange>;
        children?: ModelDiff[];
    }

    /**
     * An element in both models whose properties or children differ, with changes to its children counted by tag.
     */
    export interface Summary extends Identity {
        kind: "summary";
        properties?: Record<string, PropertyChange>;
        added: Partial<Record<ElementTag, number>>;
        deleted: Partial<Record<ElementTag, number>>;
        changed: Partial<Record<ElementTag, number>>;
    }

    /**
     * A property's value in each model, undefined where the model does not have it.
     */
    export interface PropertyChange {
        from?: string;
        to?: string;
    }
}
