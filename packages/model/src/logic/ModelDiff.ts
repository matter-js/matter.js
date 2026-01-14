/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElementTag } from "#common/ElementTag.js";
import { Specification } from "#common/Specification.js";
import { Diagnostic } from "#general";
import { Model } from "#models/Model.js";
import { ModelVariantTraversal, VariantDetail } from "./ModelVariantTraversal.js";

/**
 * A high level summary of changes between two models.
 */
export type ModelDiff = ModelDiff.Add | ModelDiff.Delete | ModelDiff.List | ModelDiff.Summary;

/**
 * Diff two models.
 */
export function ModelDiff(from: Model, to: Model, depth = 2) {
    const traversal = new DiffTraversal(depth);
    return traversal.traverse({ from, to });
}

class DiffTraversal extends ModelVariantTraversal<ModelDiff | undefined> {
    #detailDepth: number;
    #currentDepth = 0;

    constructor(depth: number) {
        super(Specification.REVISION, ["from", "to"]);
        this.#detailDepth = depth;
    }

    protected override visit(variants: VariantDetail, recurse: () => (ModelDiff | undefined)[]): ModelDiff | undefined {
        if (variants.map.to === undefined) {
            if (variants.map.from === undefined) {
                return;
            }
            return {
                kind: "delete",
                tag: variants.tag,
                name: variants.name,
            };
        }

        if (variants.map.from === undefined) {
            return {
                kind: "add",
                tag: variants.tag,
                name: variants.name,
            };
        }

        if (this.#currentDepth >= this.#detailDepth) {
            return;
        }

        this.#currentDepth++;
        const children = recurse().filter(child => child !== undefined);
        this.#currentDepth--;

        if (!children.length) {
            return;
        }

        if (this.#currentDepth < this.#detailDepth - 1) {
            return {
                kind: "list",
                tag: variants.tag,
                name: variants.name,
                children,
            };
        }

        const changes = {} as ModelDiff.Summary["changes"];
        for (const child of children) {
            changes[child.tag] = (changes[child.tag] ?? 0) + 1;
        }

        return {
            kind: "summary",
            tag: variants.tag,
            name: variants.name,
            changes,
        };
    }
}

export namespace ModelDiff {
    /**
     * Convert a diff to a diagnostic for serialization.
     */
    export function diagnosticOf(diff: ModelDiff | undefined): unknown {
        const id = `${diff?.tag}#${diff?.name}`;
        switch (diff?.kind) {
            case "add":
                return Diagnostic.added(id);

            case "delete":
                return Diagnostic.deleted(id);

            case "list":
                if (diff.children.length) {
                    return [id, Diagnostic.list(diff.children.map(diagnosticOf))];
                }
                break;

            case "summary":
                const changes = Object.entries(diff.changes).map(([tag, count]) => {
                    if (count < 0) {
                        return Diagnostic.deleted(`${-count} ${tag}`);
                    }

                    if (count > 0) {
                        return Diagnostic.added(`${count} ${tag}`);
                    }

                    return Diagnostic.weak(`${0} ${tag}`);
                });

                return [`${id}`, ...changes];
        }

        return Diagnostic.weak("(unchanged)");
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

    export interface List extends Identity {
        kind: "list";
        children: ModelDiff[];
    }

    export interface Summary extends Identity {
        kind: "summary";
        changes: Record<ElementTag, number>;
    }
}
