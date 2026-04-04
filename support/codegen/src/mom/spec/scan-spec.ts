/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanMarkdownDocument } from "./md/scan-markdown.js";
import { SpecReference } from "./spec-types.js";

/**
 * Scan a spec reference and yield section references.
 */
export function* scanSpec(ref: SpecReference): Generator<SpecReference> {
    if (ref.markdownContent === undefined) {
        throw new Error("Only markdown spec input is supported");
    }
    yield* scanMarkdownDocument(ref, ref.markdownContent);
}
