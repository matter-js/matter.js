/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#general";

/**
 * Utility for tracking location in the Matter data model.  This location is used for diagnostics.
 *
 * The path consists of a sequence of IDs, optionally with type information.
 */
export interface DataModelPath extends Diagnostic {
    parent?: DataModelPath;

    id: string | number;

    type?: string;

    at(name: string | number, type?: string): DataModelPath;

    toString(includeType?: boolean): string;

    toArray(): (string | number)[];

    [Diagnostic.value]: Diagnostic;
}

/**
 * Create a {@link DataModelPath} rooted at {@link id}.
 */
export function DataModelPath(id: string | number, type?: string): DataModelPath {
    function identity(this: DataModelPath, includeType?: boolean) {
        if (this.type && includeType) {
            return `${this.type}#${this.id}`;
        }
        return this.id;
    }

    function toString(this: DataModelPath, includeType?: boolean) {
        if (this.parent) {
            return `${this.parent}.${identity.call(this, includeType)}`;
        }
        return identity.call(this, includeType).toString();
    }

    function toArray(this: DataModelPath): (string | number)[] {
        if (this.parent) {
            return [...this.parent.toArray(), this.id];
        }
        return [this.id];
    }

    function asDiagnostic(this: DataModelPath) {
        const result = Array<unknown>();
        for (const segment of this.toArray()) {
            if (result.length) {
                result.push(".");
            }
            result.push(Diagnostic.strong(segment));
        }
        return Diagnostic.squash(result);
    }

    function at(this: DataModelPath, id: string | number, type?: string): DataModelPath {
        return {
            parent: this,
            id,
            type,
            at,
            toString,
            toArray,
            get [Diagnostic.value]() {
                return asDiagnostic.apply(this);
            },
        };
    }

    return {
        id,
        type,
        at,
        toString,
        toArray,
        get [Diagnostic.value]() {
            return asDiagnostic.apply(this);
        },
    };
}

export namespace DataModelPath {
    export const none = DataModelPath("none");
}
