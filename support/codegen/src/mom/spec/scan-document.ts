/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname, join } from "node:path";

import { loadHtml, parseHeading } from "./doc-utils.js";
import { looksLikeDatatype, looksLikeField } from "./header-detection-heuristics.js";
import { Str } from "./html-translators.js";
import { scanTables } from "./scan-tables.js";
import { HtmlReference, Table } from "./spec-types.js";

function findNextLink(html: Document) {
    for (const a of html.querySelectorAll(".top_nav a")) {
        if (a.textContent === "Next >") {
            return a as HTMLAnchorElement;
        }
    }
}

// Parses all pages in a specific section
export function* scanDocument(docRef: HtmlReference) {
    // State for scanSection.  We maintain it across calls because some broken pages don't mention their section in the
    // heading, so we simply continue the last known section
    let currentRef: HtmlReference | undefined = undefined;

    // Tables in the current reference
    let tables: HTMLTableElement[] | undefined;

    // State for scanSection.  We need to fake section numbers sometimes. This contains fakery related state
    const fakeSection = {
        faking: false,
        fakingField: false,
        actual: "",
        section: 1,
        subsection: 1,
    };

    // Scan the index page
    let path = docRef.path;
    let html = loadHtml(path);
    yield* scanPage(docRef, html);

    // Scan all subpages referenced from the index page
    while (true) {
        const link = findNextLink(html);
        if (!link) {
            break;
        }
        path = join(dirname(path), link.href);
        html = loadHtml(path);
        yield* scanPage({ ...docRef, path: path }, html);
    }

    // Handle final emit outside of scanPage
    yield* emit();

    // End of logic

    function* emit() {
        if (currentRef) {
            yield currentRef;
            currentRef = tables = undefined;
        }
    }

    // Parse a single page that is confirmed to be part of a "section of interest"
    function* scanPage(ref: HtmlReference, html: Document): Generator<HtmlReference> {
        const elements = html.querySelectorAll("h1, h2, h3, h4, h5, h6, body > p, table");

        for (let i = 1; i < elements.length; i++) {
            const element = elements[i] as HTMLElement;
            switch (element.tagName) {
                case "H1":
                case "H2":
                case "H3":
                case "H4":
                case "H5":
                case "H6":
                    {
                        // New for 1.4.1 notes are formatted such that Acrobat decides the "NOTE" marker is a heading.
                        // Just add to prose
                        const text = Str(element);
                        if (text === "NOTE") {
                            if (currentRef) {
                                if (!currentRef.prose) {
                                    currentRef.prose = [];
                                }
                                currentRef.prose.push(element);
                            }
                            continue;
                        }

                        // If we're lucky, there's actually a header tag
                        const heading = parseHeading(element);
                        if (heading) {
                            yield* emit();
                            currentRef = {
                                ...ref,
                                name: heading.name,
                                xref: { ...ref.xref, section: heading.section },
                            };
                            fakeSection.faking = false;
                            break;
                        }

                        // As of 1.4.1 the "fake headings" without numbers may be in header tags
                        const fakeGen = detectUnnumberedHeading(ref, text);
                        if (fakeGen) {
                            yield* fakeGen();
                            break;
                        }
                    }
                    break;

                case "P":
                    {
                        // Sometimes heading is just in a P so we have to guess as to "headingness".  Most of this code is
                        // heuristics to do that.  Otherwise we just collect as prose associated with the section

                        // Extract text
                        const text = Str(element).replace(/\s*\([^)]+\)\s*/g, " ");

                        // Test for "heading" shapes with a numerical prefix followed by a label
                        if (
                            text?.match(/^\d+\.(\d+\.)+ [ a-z0-9]+$/i) ||
                            text?.match(/^\d+\.(\d+\.)+ .+ \(.+ type\)/i)
                        ) {
                            let possibleHeading = parseHeading(element);

                            // Ignore links elsewhere.  This occurs in TOC entries.  If this gets too fiddly then we can
                            // instead just skip TOC pages
                            const first = element.firstElementChild;
                            if (first?.tagName === "A") {
                                if ((first as HTMLAnchorElement).href?.length) {
                                    possibleHeading = undefined;
                                }
                            }

                            if (possibleHeading?.section.startsWith(ref.xref.section)) {
                                // Yep, looks like a heading
                                yield* emit();
                                currentRef = {
                                    ...ref,
                                    name: possibleHeading.name,
                                    xref: { ...ref.xref, section: possibleHeading.section },
                                };
                                fakeSection.faking = false;
                                break;
                            }
                        }

                        // If there's just a bare name hanging repeating the section name, don't let it confuse us.
                        // Yes, it happens, see v1.1 cluster 6.5.5.2, "OutputTypeEnum"
                        if (currentRef?.name === text) {
                            continue;
                        }

                        // Worst case scenario is a "heading" in a paragraph that doesn't even have a section marker
                        const fakeGen = detectUnnumberedHeading(ref, text);
                        if (fakeGen) {
                            yield* fakeGen();
                            break;
                        }

                        // Not a heading so save as prose
                        if (text && element.className !== "nav" && currentRef) {
                            if (!currentRef.prose) {
                                currentRef.prose = [];
                            }
                            currentRef.prose.push(element);
                        }
                    }
                    break;

                case "TABLE":
                    if (!currentRef) {
                        break;
                    }

                    if (!tables) {
                        tables = initTables(currentRef);
                    }

                    tables.push(element as HTMLTableElement);
                    break;
            }
        }
    }

    // Sometimes there isn't even a section marker.  In this case we generate the missing section number
    function detectUnnumberedHeading(ref: HtmlReference, text: string) {
        if (looksLikeField(text) && fakeSection.faking && !fakeSection.fakingField) {
            // Already faking; treat these like a sub-headings to our fake heading
            return function* () {
                yield* emit();
                fakeSection.subsection++;
                currentRef = {
                    ...ref,
                    name: text,
                    xref: {
                        ...ref.xref,
                        section: `${fakeSection.actual}.${fakeSection.section}.${fakeSection.subsection}`,
                    },
                };
            };
        }

        if (looksLikeDatatype(text)) {
            // Looks like a section
            return function* () {
                const realSection = currentRef ? currentRef.xref.section : ref.xref.section;

                yield* emit();

                if (fakeSection.faking) {
                    fakeSection.section++;
                    fakeSection.subsection = 0;
                } else {
                    fakeSection.faking = true;
                    fakeSection.actual = realSection;
                    fakeSection.section = 1;
                    fakeSection.subsection = 0;
                }

                currentRef = {
                    ...ref,
                    name: text,
                    xref: { ...ref.xref, section: `${fakeSection.actual}.${fakeSection.section}` },
                };

                // Note if we're faking a field or a value so we know not to treat them like subsections when we
                // see the next one
                fakeSection.fakingField = !!text.match(/(?: Field| Value)$/i);
            };
        }
    }
}

/**
 * Add table support to an {@link HtmlReference}.
 *
 * Creates storage for HTML tables and installs a getter on a ref to implement lazy loading of the table.
 */
function initTables(ref: HtmlReference) {
    const tables = [] as HTMLTableElement[];

    let logicalTables: Table[] | undefined;
    let tablesLoaded = false;

    Object.defineProperty(ref, "tables", {
        get() {
            if (!tablesLoaded) {
                tablesLoaded = true;
                logicalTables = [...scanTables(tables)];
                if (!logicalTables.length) {
                    logicalTables = undefined;
                }
            }

            return logicalTables;
        },

        enumerable: true,
    });

    return tables;
}
