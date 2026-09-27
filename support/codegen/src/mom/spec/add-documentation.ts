/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { looksLikeListItem } from "@matter/general";
import { DeviceReference, SpecReference } from "./spec-types.js";

/**
 * Extraction terminates when it encounters these flags.  These are for places where we don't have an elegant way of
 * determining that content is unusable.
 */
export const EndContentFlags = [
    // OnOff cluster state diagram becomes a total mess
    /These concepts are illustrated in Explanation of the Behavior of Store/,

    // Similar issue for thermostat cluster
    /Optional temperature, humidity and occupancy sensors/,
];

/**
 * A light attempt at dropping text to make documentation seem slightly less scavenged.
 */
function extractUsefulDocumentation(text: string) {
    return text
        .replace(/SHALL/g, "shall")
        .replace(/MAY/g, "may")
        .replace(/RECOMMENDED/g, "recommended")
        .replace(/This data type is derived from \S+(?: and has its values listed below)?\./, "")
        .replace(/The data type \S+ is derived from \S+\./, "")
        .replace(/The data type of the(?: \w+)+ is derived from \S+\./, "")
        .replace(/The values of the(?: \w+)+ are listed below\./, "")
        .replace(/(?:The )?\S+ Data Type is derived from \S+\./, "")
        .replace(
            /(?:This\s+(?:command|event)|The\s+\w+\s+(?:command|event))\s+shall\s+have\s+the\s+following\s+data\s+fields:/i,
            "",
        )
        .replace(/The (?:data|arguments) for this command (?:shall be|is|are) as follows:/i, "")
        .replace(/This attribute has the following possible values:/, "")
        .replace(/The \w+ attribute is indicated by an enumeration:/, "")
        .replace(/The data of this event shall contain the following information:/i, "")
        .replace(/The event.s data are as follows:/, "")
        .replace(/ as described in the table below:/, "")
        .replace(/,? using(?: the)? data as follows:$/, ".")
        .replace(/Here are some examples:/, "")
        .replace(/Valid combinations using null fields are shown below:/, "")
        .replace(/,? shown below:$/, "")
        .replace(/ such that:$/, "")
        .replace(/, derived from \w+,/, "")
        .replace(/\([^)]*$/, "")
        .replace(/(\S)\s{2,}/g, "$1 ")
        .replace(/This attribute shall (?:indicate|represent)/, "Indicates")
        .replace(/This attribute shall be null/, "Null")
        .replace(/The following tags are defined in this namespace\./, "")
        .replace(/^The following table .*[.:]$/, "")
        .replace(/This section contains the .* as part of the semantic tag feature\./i, "")
        .replace(
            /The table below lists the changes relative to the Mode Base Cluster for the fields of the ModeOptionStruct type\./,
            "",
        )
        .replace(/. if the AbsolutePosition/, ".\nif the AbsolutePosition")
        .replace(/Optional temperature, humidity and occupancy sensors.*/, "")
        .replace(/Maintenan ce/, "Maintenance")
        .replace(/\.Command not/, ". Command not")
        .replace(/notback-off/, "not back-off")
        .replace(/-(or|and) /, "- $1 ")
        .trim();
}

/**
 * Look for obvious split paragraphs and reassemble.
 */
function mergeSplitParagraphs(paragraphs: string[]) {
    // Merge by identifying sentence splits
    for (let i = 0; i < paragraphs.length - 1; i++) {
        const paragraph = paragraphs[i];
        if (
            paragraph.endsWith(".") ||
            paragraph.endsWith(":") ||
            paragraph.endsWith(".\u201D") ||
            paragraph.endsWith('."') ||
            paragraph.startsWith("###") ||
            // The specification states a list item on one line, so a paragraph that follows one starts a new block
            // rather than continuing it
            looksLikeListItem(paragraph)
        ) {
            continue;
        }

        // If anything in the "paragraph" looks like an equation, merging will likely do more harm than good
        if (looksLikeEquation(paragraph)) {
            continue;
        }

        const sentences = paragraph.split(/[.?!:]\s/);
        while (sentences.length > 1 && !sentences[sentences.length - 1].match(/^[A-Z]/)) {
            sentences[sentences.length - 2] = sentences.splice(sentences.length - 2, 2).join("");
        }
        const lastSentence = sentences[sentences.length - 1];
        if (!lastSentence.match(/^[A-Z]/)) {
            continue;
        }

        const nextParagraph = paragraphs[i + 1];

        // Do not merge list items (including indented nested ones), paragraphs, or embedded headings
        if (
            looksLikeListItem(nextParagraph) ||
            looksLikeListItem(nextParagraph.trimStart()) ||
            nextParagraph.startsWith("###") ||
            looksLikeEquation(nextParagraph)
        ) {
            continue;
        }

        if (nextParagraph)
            if (
                // Starts with number or lowercase letter
                nextParagraph.match(/^[a-z0-9]/i) ||
                // Has an unmatched closing parenthesis
                nextParagraph.match(/^[^(]*\)/) ||
                // Has an unmatched double quotation
                nextParagraph.match(/^[^"]*"/)
            ) {
                if (!nextParagraph.match(/[.?!]\s/) || nextParagraph.match(/[.?!:]$/)) {
                    joinParagraphs(i, " ");
                }
            }
    }

    function joinParagraphs(index: number, separator: string) {
        paragraphs.splice(index, 2, `${paragraphs[index]}${separator}${paragraphs[index + 1]}`);
    }
}

/**
 * Sentences the device library repeats in almost every chapter.  Each one announces the shape of the table that
 * follows, which the generated model already states, so keeping them would put the same text into ninety device types
 * and bury the chapter's own content.
 */
const DeviceBoilerplate = [
    /^Each (?:endpoint|node) supporting .+ device type (?:shall|may) include (?:these clusters|endpoints with these device types) based on the conformance defined below\.$/i,
    /^Each Matter device type implementation shall include these clusters, as a minimum set, based on the conformance defined below\.$/i,
    /^See the Base Device Type definition for (?:additional )?conformance tags\.$/i,
    /^(?:The (?:table below|following table|table)|This) lists\b/i,
    /^A blank (?:table cell means there is no change to that item,? and the value from the cluster specification applies|entry means no change)\.$/i,
];

/**
 * Remove boilerplate sentences from a paragraph.  The specification packages them inconsistently — alone in their own
 * paragraph in most chapters, followed by content in others — so matching whole paragraphs misses half of them.
 */
function withoutBoilerplate(text: string, boilerplate: readonly RegExp[]) {
    return text
        .split(/(?<=\.)\s+(?=[A-Z])/)
        .filter(sentence => !boilerplate.some(pattern => sentence.match(pattern)))
        .join(" ");
}

/**
 * Convert a section's prose strings into paragraphs, dropping content we cannot use.
 */
function collectParagraphs(definition: SpecReference, boilerplate?: readonly RegExp[]) {
    const paragraphs = Array<string>();

    const prose = definition.prose;
    if (!prose) {
        return paragraphs;
    }

    prose: for (let text of prose) {
        // Ignore figure annotations
        if (text.match(/^Figure \d+/)) {
            continue;
        }

        // Admonition blocks are pre-formatted as `> [!NOTE]\n> text` by the scanner
        if (text.startsWith("> [!")) {
            paragraphs.push(extractUsefulDocumentation(text));
            continue;
        }

        // Terminate if flagged
        for (const flag of EndContentFlags) {
            if (text.match(flag)) {
                break prose;
            }
        }

        if (boilerplate) {
            text = withoutBoilerplate(text, boilerplate);
            if (!text) {
                continue;
            }
        }

        // Heading detection — short line that starts with capital and can't be a sentence fragment
        let looksLikeHeading = false;
        if (
            text.length < 50 &&
            text.match(/^[A-Z]/) &&
            !text.match(/[.?!:]$/) &&
            !looksLikeListItem(text) &&
            !looksLikeEquation(text) &&
            !text.includes(" = ") &&
            !text.match(/^This\s+[a-z]/) &&
            !(text.length <= 3 && text === text.toUpperCase()) &&
            !text.match(/^(?:Refer|See|Note|Check)\s/)
        ) {
            looksLikeHeading = true;
        }

        // Add the text
        if (text) {
            if (looksLikeHeading) {
                paragraphs.push(`### ${text}`);
            } else {
                paragraphs.push(text);
            }
        }
    }

    return paragraphs;
}

/**
 * Reassemble split paragraphs and strip the phrasing that reads as scavenged.
 */
function cleanParagraphs(paragraphs: string[]) {
    if (!paragraphs.length) {
        return paragraphs;
    }

    mergeSplitParagraphs(paragraphs);

    return paragraphs.map(extractUsefulDocumentation).filter(p => p !== "" && p !== "###");
}

/**
 * Extract documentation from prose strings produced by the markdown scanner.
 */
export function addDocumentation(target: { details?: string }, definition: SpecReference) {
    const paragraphs = cleanParagraphs(collectParagraphs(definition));
    if (paragraphs.length) {
        target.details = paragraphs.join("\n");
    }
}

/**
 * Extract documentation for a device type.
 *
 * A device type chapter states most of its normative prose below a subsection heading, so documentation built from the
 * lead paragraphs alone loses the namespace-tag requirements, the composition rules and the element requirements.
 * Each subsection contributes under a heading of its own depth, because a chapter may repeat a subsection name — the
 * robotic vacuum cleaner states "Preconditions" once per operation — and a flat heading would make them
 * indistinguishable.
 */
export function addDeviceDocumentation(target: { details?: string }, deviceRef: DeviceReference) {
    const paragraphs = cleanParagraphs(collectParagraphs(deviceRef, DeviceBoilerplate));

    const subsections = deviceRef.subsections ?? [];
    const headed = new Set<string>();

    function addHeading(subsection: SpecReference) {
        const section = subsection.xref.section;
        if (headed.has(section)) {
            return;
        }
        headed.add(section);
        paragraphs.push(`${"#".repeat(Math.min(depthOf(section), 6))} ${subsection.name}`);
    }

    for (const subsection of subsections) {
        const subsectionParagraphs = cleanParagraphs(collectParagraphs(subsection, DeviceBoilerplate));
        if (!subsectionParagraphs.length) {
            continue;
        }

        // A subsection that only heads other subsections has no prose of its own, so its heading appears here or not
        // at all, and without it the nesting below it has nothing to hang from
        for (const ancestor of subsections) {
            if (subsection.xref.section.startsWith(`${ancestor.xref.section}.`)) {
                addHeading(ancestor);
            }
        }

        addHeading(subsection);
        paragraphs.push(...subsectionParagraphs);
    }

    if (paragraphs.length) {
        target.details = paragraphs.join("\n");
    }
}

/**
 * Heading depth for a section, where a device type chapter is depth two and its subsections start at three.
 */
function depthOf(section: string) {
    return section.split(".").length;
}

/**
 * Very simple (currently) heuristics to identify equations so we don't munge them in with other stuff too terribly.
 */
function looksLikeEquation(text: string) {
    // Count mathematical operators
    const operators = text.match(/\s[=x*\-/+÷]\s/g)?.length ?? 0;

    // Count balanced groups
    const groups = Math.max(text.match(/\(/g)?.length ?? 0, text.match(/\)/g)?.length ?? 0);

    // Must have at least one operator and 2+ operators/groups
    return operators && operators + groups > 1;
}
