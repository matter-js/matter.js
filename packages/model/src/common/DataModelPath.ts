/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "@matter/general";

/**
 * Utility for tracking location in the Matter data model.  This location is used for diagnostics.
 *
 * The path consists of a sequence of IDs, optionally with type information.
 *
 * Segments with type "marker" attach to the previous segment without an intervening "." separator (used for
 * diagnostic suffixes such as "[ADD]" or "!").
 */
export class DataModelPath implements Diagnostic {
    parent?: DataModelPath;
    id: string | number;
    type?: string;

    constructor(id: string | number, type?: string, parent?: DataModelPath) {
        this.id = id;
        this.type = type;
        this.parent = parent;
    }

    #identity(includeType?: boolean) {
        if (this.type && includeType) {
            return `${this.type}#${this.id}`;
        }
        return this.id;
    }

    toString(includeType?: boolean): string {
        if (this.parent) {
            const sep = this.type === "marker" ? "" : ".";
            return `${this.parent.toString(includeType)}${sep}${this.#identity(includeType)}`;
        }
        return this.#identity(includeType).toString();
    }

    toArray(): (string | number)[] {
        if (this.parent) {
            return [...this.parent.toArray(), this.id];
        }
        return [this.id];
    }

    get [Diagnostic.value](): Diagnostic {
        const result = Array<unknown>();
        this.#appendDiagnostic(result);
        return Diagnostic.squash(result);
    }

    #appendDiagnostic(result: unknown[]) {
        if (this.parent) {
            this.parent.#appendDiagnostic(result);
            if (this.type !== "marker") {
                result.push(".");
            }
        }
        result.push(Diagnostic.strong(this.id));
    }

    at(id: string | number, type?: string): DataModelPath {
        return new DataModelPath(id, type, this);
    }

    static readonly none = new DataModelPath("none");
}
