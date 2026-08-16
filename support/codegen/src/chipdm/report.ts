/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Category, Finding } from "./compare.js";
import { DataModel } from "./data-model.js";

const HEADINGS: Record<Category, string> = {
    [Category.Mismatch]: "Mismatches",
    [Category.Override]: "Intended divergences (LocalMatter overrides)",
    [Category.Informative]: "Known differences (by design)",
    [Category.Tolerated]: "Tolerated divergences (CHIP carries less information)",
};

const ORDER = [Category.Mismatch, Category.Informative, Category.Override, Category.Tolerated];

/** Paths listed for a group of explained differences before the remainder is summarized */
const PATHS_SHOWN = 6;

export interface Report {
    version: string;
    source: string;
    findings: Finding[];
    text: string;
    mismatches: number;
}

export function report(dm: DataModel, findings: Finding[], verbose: boolean): Report {
    const lines = new Array<string>();

    lines.push(`Matter ${dm.version} against ${dm.source}`);
    lines.push(
        `  ${dm.clusters.length} clusters, ${dm.deviceTypes.length} device types, ` +
            `${dm.namespaces.length} namespaces, ${dm.globals.length} global data types`,
    );

    if (dm.globalCommands.length) {
        lines.push(`  not compared: ${dm.globalCommands.map(command => command.name).join(", ")}`);
    }

    for (const category of ORDER) {
        const matching = findings.filter(finding => finding.category === category);
        if (!matching.length) {
            continue;
        }

        const groups = group(matching);

        lines.push("");
        lines.push(`${HEADINGS[category]} — ${matching.length} in ${groups.length} group${plural(groups.length)}`);

        for (const { property, chip, matter, reason, findings: members } of groups) {
            lines.push(`  ${property}: chip "${chip}", ours "${matter}" (${members.length})`);

            if (reason !== undefined) {
                lines.push(`    ${reason}`);
            }

            const paths = members.map(finding => finding.path);

            // A mismatch is what the reader must act on, so it is never summarized away
            const shown = verbose || category === Category.Mismatch ? paths : paths.slice(0, PATHS_SHOWN);
            for (const path of shown) {
                lines.push(`    ${path}`);
            }
            if (shown.length < paths.length) {
                lines.push(`    …and ${paths.length - shown.length} more`);
            }

            const overrides = new Set(members.map(finding => finding.override).filter(override => override));
            for (const override of overrides) {
                lines.push(`    via ${override}`);
            }
        }
    }

    const mismatches = findings.filter(finding => finding.category === Category.Mismatch).length;

    lines.push("");
    lines.push(mismatches ? `${mismatches} unexplained difference${plural(mismatches)}` : "No unexplained differences");

    return { version: dm.version, source: dm.source, findings, text: lines.join("\n"), mismatches };
}

interface Group {
    property: string;
    chip?: string;
    matter?: string;
    reason?: string;
    findings: Finding[];
}

/**
 * Collect findings that state the same difference.
 *
 * One decision usually appears once per cluster that inherits it, so the number of groups is the number of decisions
 * a reader faces.
 */
function group(findings: Finding[]) {
    const groups = new Map<string, Group>();

    for (const finding of findings) {
        const key = `${finding.property}|${finding.chip}|${finding.matter}|${finding.reason ?? ""}`;

        const existing = groups.get(key);
        if (existing === undefined) {
            groups.set(key, {
                property: finding.property,
                chip: finding.chip,
                matter: finding.matter,
                reason: finding.reason,
                findings: [finding],
            });
        } else {
            existing.findings.push(finding);
        }
    }

    return [...groups.values()].sort((a, b) => b.findings.length - a.findings.length);
}

function plural(count: number) {
    return count === 1 ? "" : "s";
}
