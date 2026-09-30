/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanSpec } from "./scan-spec.js";
import { SpecReference } from "./spec-types.js";

export function* loadNamespaces(namespaces: SpecReference) {
    let ns: SpecReference | undefined;
    let nsDepth = 0;

    function* emit() {
        if (ns) {
            yield ns;
            ns = undefined;
        }
    }

    // A namespace is a chapter through 1.6.1 and a section of a chapter from 1.7; its tags are one level deeper
    for (const section of scanSpec(namespaces)) {
        const depth = section.xref.section.split(".").length;

        if (section.name.match(/semantic tag namespace$/i)) {
            yield* emit();
            ns = section;
            nsDepth = depth;
            continue;
        }

        if (!ns) {
            continue;
        }

        if (depth <= nsDepth) {
            yield* emit();
        } else if (depth === nsDepth + 1 && section.name.match(/ tag$/i)) {
            if (ns.details) {
                ns.details.push(section);
            } else {
                ns.details = [section];
            }
        }
    }

    yield* emit();
}
