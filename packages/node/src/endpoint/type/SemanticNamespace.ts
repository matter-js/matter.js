/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Namespace, Semtag, VendorId } from "#types";

/**
 * A Matter "semantic namespace" is a discrete set of {@link Semtag} definitions.
 */
export type SemanticNamespace = Record<string, Semtag>;

/**
 * Define a new semantic namespace.
 */
export function SemanticNamespace<const T extends SemanticNamespace.Definition>(definition: T) {
    const result = {} as Record<string, Semtag>;

    const { tags } = definition;
    const namespaceId = definition.id;
    const mfgCode = definition.mfgCode ? VendorId(definition.mfgCode) : null;

    for (const key in tags) {
        const { id: tag, label } = definition.tags[key];

        result[key] = {
            namespaceId,
            mfgCode,
            tag,
            label,
        };
    }

    return result as SemanticNamespace.Of<T>;
}

export namespace SemanticNamespace {
    export interface Definition {
        id: Namespace;
        mfgCode?: number;
        tags: {
            [name: string]: { id: number; label: string };
        };
    }

    export type Of<T extends Definition> = {
        [name in keyof T["tags"]]: Semtag;
    };
}
