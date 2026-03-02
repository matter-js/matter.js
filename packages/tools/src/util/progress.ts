/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { stderr, stdout } from "node:process";
import { screen } from "../ansi-text/screen.js";
import { std } from "../ansi-text/std.js";
import { ansi } from "../ansi-text/text-builder.js";
import { Package } from "./package.js";

export const STATUS_ICON_SUCCESS = ansi.green("✓");
export const STATUS_ICON_FAILURE = ansi.bright.red("✗");
export const STATUS_ICON_SKIPPED = ansi.dim.white("⁃");

const SPINNER = "◐◓◑◒"; //"⡜⠔⠢⢣"; //["⚫︎", "⚪︎"]; "⡈⠔⠢⢁";
const SPINNER_INTERVAL = 100;

function packageIdentity(pkg: Package) {
    let identity = ansi.bold(pkg.name).toString();
    if (pkg.json.version) {
        identity = `${identity}@${pkg.json.version}`;
    }
    return identity;
}

/**
 * Intercept writes to stderr and stdout so we can ensure our updates appear on different lines from other output.
 */
const writeStatus = (() => {
    let lastStatus: undefined | string;
    let needNewline = false;
    let needsClear = false;

    function intercept(stream: NodeJS.WriteStream) {
        const actualWrite = stream.write;
        stream.write = (payload: Uint8Array | string, ...params: any[]) => {
            if (lastStatus) {
                if (payload[0] !== "\n" && payload[0] !== 0xa && needNewline) {
                    actualWrite.call(stream, "\n");
                }
                lastStatus = undefined;
            }

            if (!payload.length) {
                return true;
            }

            // Require a newline for status updates any time the cursor does not end at the beginning of a line
            switch (payload[payload.length - 1]) {
                case "\n":
                case 0xa:
                case "\r":
                case 0xd:
                    needNewline = false;
                    break;

                default:
                    needNewline = true;
                    break;
            }

            if (needsClear) {
                if (stdout.isTTY) {
                    actualWrite.call(stream, screen.erase.toEol);
                }
                needsClear = false;
            }

            return actualWrite.call(stream, payload, ...params);
        };
    }

    intercept(stdout);
    intercept(stderr);

    return function writeStatus(text: string, willOverwrite = false) {
        const eol = stdout.isTTY ? screen.erase.toEol : "";
        if (!stdout.isTTY) {
            willOverwrite = false;
        }
        text += willOverwrite ? `${eol}\r` : `${eol}\n`;
        if (text === lastStatus) {
            return;
        }

        std.out.state({ buffer: true }, () => {
            if (lastStatus) {
                lastStatus = undefined;
            } else if (needNewline && !text.startsWith("\n")) {
                std.out("\n");
            }

            std.out.writeTruncated(text);
        });

        lastStatus = text;
        needsClear = willOverwrite;
    };
})();

export class Progress {
    status = Progress.Status.Startup;
    #ongoing?: { text: string; extra?: string };
    #start?: number;
    #spinner = "⧗";
    #refreshInterval?: ReturnType<typeof setInterval>;
    #spinnerPosition = 0;
    #spinnerWindow?: number;
    #subtasks = Array<string>();

    constructor() {}

    emphasize(text: unknown) {
        return ansi.bold(`${text}`);
    }

    deemphasize(text: unknown) {
        return ansi.dim(`${text}`);
    }

    skip(why: string, pkg: Package) {
        std.out.write(ansi.dim(`Skip ${packageIdentity(pkg)}: ${why}\n\n`));
    }

    startup(what: string, pkgOrOverwrite?: Package | boolean) {
        if (process.stdout.isTTY) {
            this.#updateSpinner();
            this.#refreshInterval = setInterval(this.refresh.bind(this), SPINNER_INTERVAL);
        }

        this.status = Progress.Status.Startup;
        if (pkgOrOverwrite === undefined || typeof pkgOrOverwrite === "boolean") {
            writeStatus(what, pkgOrOverwrite ?? true);
        } else {
            writeStatus(`${what} ${packageIdentity(pkgOrOverwrite)}`);
        }
    }

    update(text: string, extra?: string) {
        this.status = Progress.Status.Ongoing;
        if (this.#start === undefined) {
            this.#start = new Date().getTime();
        }
        extra = extra === undefined ? "" : ` ${extra}`;
        this.#ongoing = { text, extra };
        this.#writeOngoing();
    }

    #writeOngoing() {
        if (!this.#ongoing) {
            return;
        }

        const extra = this.#ongoing.extra ? ` ${this.#ongoing.extra}` : "";
        const message = `${this.#ongoing.text} ${this.#duration}${extra}`;

        const subtask = this.#subtasks.length ? ansi.dim(` (${this.#subtasks[this.#subtasks.length - 1]})`) : "";

        writeStatus(`  ${ansi.yellow(this.#spinner)} ${message}${subtask}`, true);
    }

    success(text: string) {
        this.status = Progress.Status.Success;
        writeStatus(`  ${STATUS_ICON_SUCCESS} ${text} ${this.#duration}`);
        this.#start = this.#ongoing = undefined;
    }

    failure(text: string) {
        this.status = Progress.Status.Failure;
        writeStatus(`  ${STATUS_ICON_FAILURE} ${text} ${this.#duration}`);
        this.#start = this.#ongoing = undefined;
    }

    info(label: string, value?: any) {
        if (value) {
            label = `${ansi.dim(label)} ${value}`;
        }
        writeStatus(`  ${ansi.dim("‣")} ${label}`);
    }

    warn(text: string) {
        std.out.write(`    ${ansi.yellow("Warning:")} ${text}\n`);
    }

    close() {
        if (this.#refreshInterval) {
            clearInterval(this.#refreshInterval);
            this.#refreshInterval = undefined;
        }
        writeStatus("");
    }

    [Symbol.dispose]() {
        this.close();
    }

    refresh() {
        if (this.#updateSpinner()) {
            this.#writeOngoing();
        }
    }

    async subtask(text: string, fn: () => Promise<void>) {
        this.#subtasks.push(text);
        this.#writeOngoing();

        try {
            await fn();
        } finally {
            this.#subtasks.pop();
        }
    }

    #updateSpinner() {
        if (!stdout.isTTY) {
            return false;
        }

        const window = Math.floor(new Date().getTime() / SPINNER_INTERVAL);
        if (this.#spinnerWindow === window) {
            return false;
        }
        this.#spinnerWindow = window;

        this.#spinnerPosition = (this.#spinnerPosition + 1) % SPINNER.length;
        this.#spinner = SPINNER[this.#spinnerPosition];

        return true;
    }

    async run<T>(what: string, fn: () => T | Promise<T>) {
        this.update(what);
        let result: T;
        try {
            result = await fn();
        } catch (e) {
            this.failure(what);
            throw e;
        }
        this.success(what);
        return result;
    }

    get #duration() {
        const duration = this.#start ? new Date().getTime() - this.#start : 0;
        return Progress.formatDuration(duration);
    }
}

export namespace Progress {
    export enum Status {
        Startup = "startup",
        Ongoing = "ongoing",
        Success = "success",
        Failure = "failure",
    }

    export function formatDuration(duration: number) {
        duration /= 1000;
        let time;
        if (duration < 10) {
            time = duration.toPrecision(2);
            if (time.startsWith("0.")) {
                time = time.slice(1);
            }
            if (time.endsWith(".")) {
                if (time.length === 1) {
                    time = "0";
                } else {
                    time = time.slice(0, time.length - 1);
                }
            }
            time += "s";
        } else if (duration < 60) {
            time = `${Math.trunc(duration)}s`;
        } else {
            time = `${Math.trunc(duration / 60)}m ${Math.trunc(duration) % 60}s`;
        }
        return `${ansi.dim.yellow}(${time})${ansi.not.dim.not.yellow}`;
    }
}
