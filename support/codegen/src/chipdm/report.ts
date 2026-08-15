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
    [Category.Tolerated]: "Tolerated divergences (CHIP carries less information)",
};

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

    for (const category of [Category.Mismatch, Category.Override, Category.Tolerated]) {
        const matching = findings.filter(finding => finding.category === category);
        if (!matching.length) {
            continue;
        }

        lines.push("");
        lines.push(`${HEADINGS[category]} (${matching.length})`);

        if (category !== Category.Mismatch && !verbose) {
            for (const [subject, count] of summarize(matching)) {
                lines.push(`  ${subject}: ${count}`);
            }
            continue;
        }

        for (const finding of matching) {
            lines.push(`  ${finding.path} ${finding.property}: chip "${finding.chip}", ours "${finding.matter}"`);
            if (finding.override !== undefined) {
                lines.push(`    via ${finding.override}`);
            }
        }
    }

    const mismatches = findings.filter(finding => finding.category === Category.Mismatch).length;

    lines.push("");
    lines.push(
        mismatches
            ? `${mismatches} unexplained difference${mismatches === 1 ? "" : "s"}`
            : "No unexplained differences",
    );

    return { version: dm.version, source: dm.source, findings, text: lines.join("\n"), mismatches };
}

function summarize(findings: Finding[]) {
    const counts = new Map<string, number>();

    for (const finding of findings) {
        const subject = finding.path.split(".")[0];
        counts.set(subject, (counts.get(subject) ?? 0) + 1);
    }

    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}
