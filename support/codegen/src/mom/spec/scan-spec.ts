/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanMarkdownDocument } from "./md/scan-markdown.js";
import { scanDocument } from "./scan-document.js";
import { HtmlReference } from "./spec-types.js";

/**
 * Route spec scanning to the correct backend based on content type.
 *
 * When {@link HtmlReference.markdownContent} is present the markdown scanner is used; otherwise the existing HTML
 * scanner handles the document.
 */
export function* scanSpec(ref: HtmlReference): Generator<HtmlReference> {
    if (ref.markdownContent !== undefined) {
        yield* scanMarkdownDocument(ref, ref.markdownContent);
    } else {
        yield* scanDocument(ref);
    }
}
