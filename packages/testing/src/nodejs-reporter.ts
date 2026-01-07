/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Progress, ansi, std } from "#tools";
import { FailureDetail } from "./failure-detail.js";
import { FailureReporter } from "./failure-reporter.js";
import { Failure, Reporter, Stats } from "./reporter.js";

/**
 * Test UI for Node.js.
 */
export abstract class NodejsReporter implements Reporter {
    #run = "";
    #suite = Array<string>();
    #test?: string;
    #step?: string;
    #stats?: Stats;
    #failures = Array<Failure>();
    #lastTitle?: string;

    constructor(private progress: Progress) {}

    beginRun(name: string, stats: Stats | undefined, supportsSuites = true): void {
        this.#run = name;
        this.#suite = [];
        this.#failures = [];
        if (!supportsSuites) {
            this.progress.update(this.#summarize(stats));
        }
    }

    beginSuite(name: string[]): void {
        this.#suite = name;
    }

    beginTest(name: string, stats?: Stats): void {
        this.#test = name;
        this.#stats = stats;
        this.#step = undefined;

        // If not a TTY, only update once per suite to keep the line count down for e.g. GH action logs
        const title = process.stdout.isTTY ? this.#formatName(this.#suite, name) : this.#suite[0];
        this.#updateTitle(title);
    }

    beginStep(name: string): void {
        this.#step = name;

        if (process.stdout.isTTY && this.#test) {
            const title = this.#formatName(this.#suite, this.#test, name);
            this.#updateTitle(title);
        }
    }

    #updateTitle(title: string) {
        if (title === this.#lastTitle) {
            return;
        }
        this.#lastTitle = title;
        this.progress.update(this.#summarize(this.#stats), title);
    }

    failTest(name: string, detail: FailureDetail) {
        this.#failures.push({
            suite: this.#suite,
            test: name,
            step: this.#step,
            detail,
        });
    }

    abstract failRun(detail: FailureDetail): void;

    endRun(stats?: Stats): void {
        if (this.#failures.length) {
            this.progress.failure(this.#summarize(stats));
            this.#dumpFailures();
        } else if (stats && !stats.complete) {
            this.progress.failure("No tests found");
        } else {
            this.progress.success(this.#summarize(stats));
        }
    }

    #summarize(stats?: Stats) {
        let statStr;
        if (stats) {
            const complete = ansi.dim(`${stats.complete}/${stats.total}`);
            const failures = stats.failures ? ansi.bright.red(` ${stats.failures.toString()} failed`) : "";
            statStr = ` ${complete}${failures}`;
        } else {
            statStr = "";
        }

        return `${ansi.bold(this.#run)}${statStr}`;
    }

    #dumpFailures() {
        std.out("\n");
        for (let i = 0; i < this.#failures.length; i++) {
            const failure = this.#failures[i];
            const index = `Failure ${ansi.bold((i + 1).toString())} of ${this.#failures.length}: `;
            const title = `${index}${this.#formatName(failure.suite, failure.test, failure.step)}`;

            FailureReporter.report(std.out, failure.detail, title);
        }
    }

    #formatName(suite: string[], test: string, step?: string) {
        const breadcrumb = [...suite, test];
        if (step) {
            breadcrumb.push(step);
        }
        breadcrumb[breadcrumb.length - 1] = ansi.bold(breadcrumb[breadcrumb.length - 1]).toString();
        return breadcrumb.join(" ➡ ");
    }
}
