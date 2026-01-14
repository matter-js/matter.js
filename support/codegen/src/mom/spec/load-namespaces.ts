/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanDocument } from "./scan-document.js";
import { HtmlReference } from "./spec-types.js";

export function* loadNamespaces(namespaces: HtmlReference) {
    let ns: HtmlReference | undefined;

    function* emit() {
        if (ns) {
            yield ns;
            ns = undefined;
        }
    }

    for (const section of scanDocument(namespaces)) {
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
