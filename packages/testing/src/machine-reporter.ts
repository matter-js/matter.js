/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Progress } from "@matter/tools";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { FailureDetail } from "./failure-detail.js";
import { Reporter, Stats } from "./reporter.js";
import { TestDescriptor } from "./test-descriptor.js";

/**
 * Reporter that produces plain-text hierarchical output optimized for LLM ingestion.
 *
 * No ANSI codes, no spinners, no box drawing. Failure details are written to individual markdown
 * files under build/failures/.
 */
export class MachineReporter implements Reporter {
    #progress: Progress;
    #currentFile: string | undefined;
    #currentSuite: string[] = [];
    #testNumber = 0;
    #failureCount = 0;
    #passCount = 0;
    #failuresDir = "build/failures";
    #currentTest: string | undefined;

    constructor(progress: Progress) {
        this.#progress = progress;
    }

    beginRun(_name: string, _stats?: Stats, _supportsSuites?: boolean): void {
        this.#testNumber = 0;
        this.#failureCount = 0;
        this.#passCount = 0;
        this.#currentFile = undefined;
        this.#currentSuite = [];

        // Clean failures directory
        rmSync(this.#failuresDir, { recursive: true, force: true });
    }

    beginSuite(name: string[], _stats?: Stats, file?: string): void {
        // Convert build path to source path and make relative
        if (file) {
            file = this.#toSourcePath(file);
        }

        // Print file header when the top-level suite or file changes.  The top-level suite name appears first with the
        // file path in parentheses.
        const suitePath = name;
        const topName = suitePath[0];
        if (topName !== undefined && (file !== this.#currentFile || topName !== this.#currentSuite[0])) {
            this.#currentFile = file;
            this.#currentSuite = [];
            if (file) {
                process.stdout.write(`${topName} (${file})\n`);
            } else {
                process.stdout.write(`${topName}\n`);
            }
        }

        // Find common prefix length
        let common = 0;
        while (
            common < this.#currentSuite.length &&
            common < suitePath.length &&
            this.#currentSuite[common] === suitePath[common]
        ) {
            common++;
        }

        // Print new nested suite levels (skip the top-level suite which is part of the file header)
        for (let i = Math.max(common, 1); i < suitePath.length; i++) {
            const indent = "  ".repeat(i);
            process.stdout.write(`${indent}* ${suitePath[i]}\n`);
        }

        this.#currentSuite = suitePath;
    }

    beginTest(name: string, _stats?: Stats): void {
        this.#currentTest = name;
    }

    beginStep(_name: string): void {
        // No-op for machine reporter
    }

    passTest(_name: string): void {
        this.#testNumber++;
        this.#passCount++;
        const indent = "  ".repeat(this.#currentSuite.length);
        process.stdout.write(`${indent}${this.#testNumber}. ${this.#currentTest} PASS\n`);
    }

    failTest(name: string, detail: FailureDetail, descriptor?: TestDescriptor): void {
        this.#testNumber++;
        this.#failureCount++;

        const failureNum = String(this.#failureCount).padStart(3, "0");
        const failurePath = `${this.#failuresDir}/${failureNum}.md`;

        // Ensure failures directory exists
        mkdirSync(this.#failuresDir, { recursive: true });

        // Write failure detail file
        writeFileSync(failurePath, this.#formatFailureFile(name, detail, descriptor));

        // Print test line
        const indent = "  ".repeat(this.#currentSuite.length);
        const code = this.#stripAnsi(detail.id ? detail.id : detail.message.split("\n")[0]);
        process.stdout.write(`${indent}${this.#testNumber}. ${name} FAIL [${code}] (see ./${failurePath})\n`);
    }

    endRun(_stats?: Stats): void {
        process.stdout.write(`--- ${this.#failureCount} failed, ${this.#passCount} passed ---\n`);

        // Update progress status so the runner knows whether tests passed
        if (this.#failureCount > 0) {
            this.#progress.status = Progress.Status.Failure;
        } else if (this.#passCount > 0) {
            this.#progress.status = Progress.Status.Success;
        } else {
            this.#progress.status = Progress.Status.Failure;
        }
    }

    failRun(detail: FailureDetail): void {
        process.stdout.write(`FATAL: ${detail.message}\n`);
        if (detail.stack) {
            process.stdout.write(`${detail.stack}\n`);
        }
        process.exit(1);
    }

    #toSourcePath(buildPath: string): string {
        // Convert build/esm/test/foo.js → test/foo.ts, then make relative to cwd
        let rel = relative(process.cwd(), buildPath);
        rel = rel.replace(/^build\/(?:esm|cjs)\//, "");
        rel = rel.replace(/\.js$/, ".ts");
        if (!rel.startsWith(".")) {
            rel = `./${rel}`;
        }
        return rel;
    }

    #formatFailureFile(name: string, detail: FailureDetail, descriptor?: TestDescriptor): string {
        const suitePath = this.#currentSuite.join(" > ");
        const sections = Array<string>();

        sections.push(`# ${suitePath ? `${suitePath} > ` : ""}${name}`);

        sections.push(`## Error\n\n${this.#stripAnsi(detail.message)}`);

        if (detail.stack) {
            sections.push(`## Stack\n\n${this.#stripAnsi(detail.stack)}`);
        }

        if (detail.actual !== undefined && detail.expected !== undefined) {
            sections.push(
                `## Diff\n\nActual:\n\`\`\`\n${this.#stripAnsi(detail.actual)}\n\`\`\`\n\nExpected:\n\`\`\`\n${this.#stripAnsi(detail.expected)}\n\`\`\``,
            );
        }

        if (detail.cause) {
            const causeStack = detail.cause.stack ? `\n\n${this.#stripAnsi(detail.cause.stack)}` : "";
            sections.push(`## Cause\n\n${this.#stripAnsi(detail.cause.message)}${causeStack}`);
        }

        if (detail.logs) {
            sections.push(`## Logs\n\n${this.#stripAnsi(detail.logs)}`);
        }

        if (detail.diagnostics) {
            sections.push(`## Diagnostics\n\n${detail.diagnostics}`);
        }

        if (descriptor) {
            const meta = Array<string>();
            for (const key of ["kind", "description", "pics", "app", "timeoutMs", "config", "picsValues"] as const) {
                const value = descriptor[key];
                if (value !== undefined) {
                    meta.push(`- **${key}**: ${typeof value === "object" ? JSON.stringify(value) : value}`);
                }
            }
            if (meta.length) {
                sections.push(`## Metadata\n\n${meta.join("\n")}`);
            }
        }

        return sections.join("\n\n") + "\n";
    }

    #stripAnsi(text: string): string {
        // eslint-disable-next-line no-control-regex
        return text.replace(/\x1b\[[0-9;]*m/g, "");
    }
}
