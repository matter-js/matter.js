/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanSpec } from "./scan-spec.js";
import { SpecReference } from "./spec-types.js";

export function* loadNamespaces(namespaces: SpecReference) {
    let ns: SpecReference | undefined;

    function* emit() {
        if (ns) {
            yield ns;
            ns = undefined;
        }
    }

    for (const section of scanSpec(namespaces)) {
        const depth = section.xref.section.split(".").length;
        switch (depth) {
            case 1:
                yield* emit();
                if (section.name.match(/semantic tag namespace$/i)) {
                    ns = section;
                }
                break;

            case 2:
                if (ns && section.name.match(/ tag$/i)) {
                    if (ns.details) {
                        ns.details.push(section);
                    } else {
                        ns.details = [section];
                    }
                }
                break;
        }
    }

    yield* emit();
}
