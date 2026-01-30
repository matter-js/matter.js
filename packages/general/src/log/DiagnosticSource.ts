/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Note we cannot import diagnostic directly as it causes circular reference
import { Boot } from "#util/Boot.js";
import type { Diagnostic } from "./Diagnostic.js";
import { DiagnosticPresentation } from "./DiagnosticPresentation.js";

let sources = new Set<Diagnostic>();

/**
 * Registry of diagnostic sources.
 */
export const DiagnosticSource = {
    add(source: Diagnostic) {
        sources.add(source);
    },

    delete(source: Diagnostic) {
        sources.delete(source);
    },

    get [DiagnosticPresentation.presentation]() {
        return DiagnosticPresentation.List;
    },

    get [DiagnosticPresentation.value]() {
        const diagnostic = [];
        for (const source of sources) {
            diagnostic.push("", source);
        }
        return diagnostic;
    },
};

Boot.init(() => {
    sources = new Set();
}, "state");
