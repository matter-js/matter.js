/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, InternalError, MatterError } from "../MatterError.js";
import { Bytes } from "../util/Bytes.js";
import { Lifecycle } from "../util/Lifecycle.js";
import { serialize } from "../util/String.js";
import { isObject } from "../util/Type.js";
import { Diagnostic } from "./Diagnostic.js";
import { LogLevel } from "./LogLevel.js";

const INDENT_SPACES = 2;

/**
 * Get a diagnostic formatter for the specified format.
 *
 * A "diagnostic formatter" converts arbitrary values into a formatted string.  Formatting is controlled by type and the
 * {@link Diagnostic.presentation} and {@link Diagnostic.value} properties.
 */
export function LogFormat(format: string | LogFormat.Formatter): LogFormat.Formatter {
    if (typeof format === "function") {
        return format;
    }

    const fn = LogFormat.formats[format];
    if (fn === undefined) {
        throw new ImplementationError(`Unsupported log format "${format}"`);
    }

    return fn;
}

/**
 * Log stylization support.
 */
export namespace LogFormat {
    /**
     * A function that formats a log message.
     */
    export type Formatter = (diagnostic: unknown, indents?: number) => string;

    /**
     * Supported formats.  You may add to this object to register new named formats.
     */
    export const formats: Record<string, Formatter> = {};

    /**
     * Built in formatter that produces plaintext.
     */
    export const PLAIN = "plain";

    /**
     * Built in formatter that produces text styled using ANSI escapes.
     **/
    export const ANSI = "ansi";

    /**
     * Built in formatter that produces HTML.
     */
    export const HTML = "html";
}

export type DiagnosticProducer = () => string;

interface Formatter {
    message(message: Diagnostic.Message): string;
    text(text: string): string;
    indent(producer: DiagnosticProducer): string;
    break(): string;
    key(text: string): string;
    keylike(text: string): string;
    value(producer: DiagnosticProducer): string;
    strong(producer: DiagnosticProducer): string;
    weak(producer: DiagnosticProducer): string;
    error(producer: DiagnosticProducer): string;
    status(status: Lifecycle.Status, producer: DiagnosticProducer): string;
    via(text: string): string;
    added(producer: DiagnosticProducer): string;
    deleted(producer: DiagnosticProducer): string;
}

const LifecycleIcons = {
    [Lifecycle.Status.Unknown]: "?",
    [Lifecycle.Status.Inactive]: "💤",
    [Lifecycle.Status.Initializing]: "⌛",
    [Lifecycle.Status.Active]: "✓",
    [Lifecycle.Status.Crashed]: "✗",
    [Lifecycle.Status.Destroying]: "☠︎",
    [Lifecycle.Status.Destroyed]: "☠︎",
};

/**
 * Create a small utility shared by plain and ansi formats.
 */
function plaintextCreator(indents: number) {
    let broke = false;

    return {
        text(value: string) {
            if (broke) {
                broke = false;
                return `\n${"".padStart(indents * INDENT_SPACES)}${value}`;
            }
            return value;
        },

        break() {
            broke = true;
            return "";
        },

        indent(producer: () => string) {
            indents++;
            const result = producer();
            indents--;
            return result;
        },
    };
}

function statusIcon(status: Lifecycle.Status) {
    return LifecycleIcons[status] ?? LifecycleIcons[Lifecycle.Status.Unknown];
}

LogFormat.formats.plain = function plain(diagnostic: unknown, indents = 0) {
    const creator = plaintextCreator(indents);

    const formatter = {
        ...creator,
        message: message => {
            const formattedValues = ensureIndented(renderDiagnostic(message.values, formatter));

            return `${formatTime(message.now)} ${LogLevel[
                message.level
            ].toUpperCase()} ${message.facility} ${message.prefix}${formattedValues}`;
        },
        key: text => creator.text(`${text}: `),
        keylike: text => creator.text(`${text}`),
        value: producer => creator.text(producer()),
        strong: producer => creator.text(producer()),
        weak: producer => creator.text(producer()),
        error: producer => creator.text(producer()),
        status: (status, producer) => `${creator.text(statusIcon(status))}${producer()}`,
        via: text => creator.text(text),
        added: producer => creator.text(`+${producer()}`),
        deleted: producer => creator.text(`-${producer()}`),
    } satisfies Formatter;

    return renderDiagnostic(diagnostic, formatter);
};

const ANSI_CODES = {
    reset: 0,
    bold: 1,
    dim: 2,
    red: 31,
    green: 32,
    yellow: 33,
    blue: 34,
    magenta: 35,
    cyan: 36,
    white: 37,
    default: 39,
    gray: 90,
};

type AnsiCode = "normal" | keyof typeof ANSI_CODES;

function ansiEscape(...codes: AnsiCode[]) {
    const numbers = [];
    for (const code of codes) {
        if (code === "normal") {
            continue;
        }
        const number = ANSI_CODES[code];
        if (number === undefined) {
            throw new InternalError(`Invalid ANSI code ${code}`);
        }
        numbers.push(number);
    }
    if (!numbers.length) {
        return "";
    }
    return `\u001b[${numbers.join(";")}m`;
}

interface Style {
    color?: "default" | keyof typeof ANSI_CODES;
    dim?: boolean;
    bold?: boolean;
}

const Styles = {
    default: { color: "default" },
    prefix: { color: "default", dim: true },
    facility: { color: "gray", bold: true },
    debug: { color: "gray" },
    info: { color: "default" },
    notice: { color: "green" },
    warn: { color: "yellow" },
    error: { color: "red" },
    fatal: { color: "red", bold: true },
    key: { color: "blue" },
    value: { color: "default", dim: true },
    strong: { bold: true },
    weak: { dim: true },
    ballotCheck: { color: "green" },
    ballotCross: { color: "red" },
    unknown: { color: "gray" },
    inactive: { color: "gray" },
    initializing: { color: "yellow" },
    active: { color: "green" },
    crashed: { color: "red" },
    destroying: { color: "gray" },
    destroyed: { color: "gray" },
    via: { color: "magenta" },
    added: { color: "green" },
    deleted: { color: "red" },
} as const satisfies Record<string, Style>;

type StyleName = keyof typeof Styles;

LogFormat.formats.ansi = function ansi(diagnostic: unknown, indents = 0) {
    let baseStyleChanged = false;
    const creator = plaintextCreator(indents);
    const currentStyle: Style = {
        color: "default",
        dim: false,
        bold: false,
    };
    const styles: StyleName[] = ["default"];

    function normal(text: string) {
        return style(styles[styles.length - 1] ?? "default", text);
    }

    const formatter = {
        message: ({ now, level, facility, prefix: nestPrefix, values }) => {
            baseStyleChanged = true;
            styles[0] = (LogLevel[level] ?? "default").toLowerCase() as StyleName;

            const prefix = style("prefix", `${formatTime(now)} ${LogLevel[level].toUpperCase().padEnd(6)}`);

            facility = style(
                "facility",
                facility.length > 20
                    ? `${facility.slice(0, 10)}~${facility.slice(facility.length - 9)}`
                    : facility.padEnd(20),
            );

            if (nestPrefix) {
                nestPrefix = style("prefix", nestPrefix);
            }

            const formattedValues = ensureIndented(renderDiagnostic(values, formatter));

            return `${prefix} ${facility} ${nestPrefix}${formattedValues}`;
        },

        text: text => creator.text(normal(text)),

        indent: producer => creator.indent(producer),

        break: () => {
            // After the first line revert to default styling so e.g. stack traces aren't all red
            if (baseStyleChanged) {
                baseStyleChanged = false;
                styles[0] = "default";
            }

            return creator.break();
        },

        key: text => creator.text(style("key", `${text}: `)),

        keylike: text => creator.text(style("key", `${text}`)),

        value: producer => {
            styles.push("value");
            const result = producer();
            styles.pop();
            return result;
        },

        strong: producer => {
            styles.push("strong");
            const result = producer();
            styles.pop();
            return result;
        },

        weak: producer => {
            styles.push("weak");
            const result = producer();
            styles.pop();
            return result;
        },

        error: producer => {
            styles.push("error");
            const result = producer();
            styles.pop();
            return result;
        },

        status: (status, producer) => {
            styles.push(status);
            const result = `${creator.text(style(status, statusIcon(status)))}${producer()}`;
            styles.pop();
            return result;
        },

        via: text => creator.text(style("via", text)),

        added: producer => {
            styles.push("added");
            const result = `${creator.text(style("added", "+"))}${producer()}`;
            styles.pop();
            return result;
        },

        deleted: producer => {
            styles.push("deleted");
            const result = `${creator.text(style("deleted", "-"))}${producer()}`;
            styles.pop();
            return result;
        },
    } satisfies Formatter;

    return renderDiagnostic(diagnostic, formatter) + ansiEscape("reset");

    // Convert a style name into a set of escape codes to transition state
    function escapes(styleName: StyleName) {
        const style = Styles[styleName] as Style;
        if (style === undefined) {
            throw new InternalError(`Invalid ANSI style "${styleName}"`);
        }

        const targetDim = !!style.dim;
        const targetBold = !!style.bold;
        let targetColor = style.color;

        // Compute target color from style stack if not explicit
        if (!targetColor) {
            for (let i = styles.length; i > 0; i--) {
                const color = (Styles[styles[i - 1] ?? "default"] as Style).color;
                if (color) {
                    targetColor = color;
                    break;
                }
            }
        }

        const codes = Array<AnsiCode>();

        if ((!targetDim && currentStyle.dim) || (!targetBold && currentStyle.bold)) {
            // Don't think we can reset dim/bold without full reset
            codes.push("reset");
            currentStyle.dim = false;
            currentStyle.bold = false;
            currentStyle.color = "default";
        }

        if (targetDim !== currentStyle.dim) {
            codes.push("dim");
            currentStyle.dim = true;
        }

        if (targetBold !== currentStyle.bold) {
            codes.push("bold");
            currentStyle.bold = true;
        }

        if (targetColor && targetColor !== currentStyle.color) {
            codes.push(targetColor);
            currentStyle.color = targetColor;
        }

        return ansiEscape(...codes);
    }

    // Apply style codes.  Maintains color state (via escapes) so values must be rendered sequentially as they appear
    function style(style: StyleName, text: string) {
        if (text === "") {
            return text;
        }
        const segments = text.match(/[^✓✔✗✘]+|[✓✔✗✘]/g);
        if (segments === null) {
            throw new InternalError("ANSI text processing regex failure");
        }
        return segments
            .map(segment => {
                let esc;
                switch (segment) {
                    case "✓":
                    case "✔":
                        esc = escapes("ballotCheck");
                        break;

                    case "✗":
                    case "✘":
                        esc = escapes("ballotCross");
                        break;

                    default:
                        esc = escapes(style);
                        break;
                }
                return `${esc}${segment}`;
            })
            .join("");
    }
};

function htmlSpan(type: string, inner: string) {
    return `<span class="matter-log-${type}">${inner}</span>`;
}

LogFormat.formats.html = function html(diagnostic: unknown) {
    function escape(text: string) {
        return text.toString().replace(/</g, "&amp").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    const formatter = {
        message: ({ now, level, facility, prefix, values }) => {
            prefix = prefix.replace(/ /g, "&nbsp;");
            const formattedValues = renderDiagnostic(values, formatter);

            return htmlSpan(
                `line ${LogLevel[level].toLowerCase()}`,
                `${htmlSpan("time", formatTime(now))} ${htmlSpan("level", LogLevel[level].toUpperCase())} ${htmlSpan(
                    "facility",
                    facility,
                )} ${prefix}${formattedValues}`,
            );
        },
        text: escape,
        break: () => "<br/>",
        indent: producer => htmlSpan("indent", producer()),
        key: text => htmlSpan("key", `${escape(text)}:`) + " ",
        keylike: text => htmlSpan("key", `${escape(text)}`),
        value: producer => htmlSpan("value", producer()),
        strong: producer => `<em>${producer()}</em>`,
        weak: producer => htmlSpan("weak", producer()),
        error: producer => htmlSpan("error", producer()),
        status: (status, producer) => htmlSpan(`status-${status}`, producer()),
        via: text => htmlSpan("via", escape(text)),
        added: producer => htmlSpan("added", producer()),
        deleted: producer => htmlSpan("deleted", producer()),
    } satisfies Formatter;

    return renderDiagnostic(diagnostic, formatter);
};

/**
 * Render a value based on its JS type.
 */
function renderValue(value: unknown, formatter: Formatter, squash: boolean): string {
    if (value === undefined) {
        return formatter.text("undefined");
    }
    if (value === null) {
        return formatter.text("null");
    }
    if (Bytes.isBytes(value)) {
        return formatter.text(Bytes.toHex(value));
    }
    if (value instanceof Error) {
        return renderDiagnostic(Diagnostic.error(value), formatter);
    }
    if (typeof value === "object" && Symbol.iterator in value && !(value instanceof String)) {
        const list = sequenceToList(value as Iterable<unknown>);
        if (!list.length) {
            return "";
        }
        if (list.length > 1) {
            return renderList(list, formatter);
        }
        const first = valueFor(list[0]) as unknown[];
        return first
            .map(e => {
                if (typeof e === "string" && !squash) {
                    e = e.trim();
                }
                return renderDiagnostic(e, formatter);
            })
            .filter(e => e.length > 0)
            .join(squash ? "" : " ");
    }
    if (value instanceof Date) {
        return formatter.text(formatTime(value));
    }
    if (typeof value === "object") {
        if (value instanceof String) {
            return value.toString();
        }
        return formatter.text(serialize(value) ?? "undefined");
    }
    if (typeof value === "function") {
        return renderDiagnostic(value(), formatter);
    }

    const text = typeof value === "string" || value instanceof String ? value : value.toString().trim();
    if (!text.includes("\n")) {
        return formatter.text(text as string);
    }

    return renderList(text.split("\n"), formatter);
}

function renderList(value: Iterable<unknown>, formatter: Formatter) {
    const parts = Array<string>();

    for (const v of value) {
        parts.push(renderDiagnostic(v, formatter));
        formatter.break();
    }

    return parts.join("");
}

function renderIndentedList(value: Iterable<unknown>, formatter: Formatter) {
    return formatter.indent(() => {
        return renderList(value, formatter);
    });
}

function renderDictionary(value: object, formatter: Formatter) {
    const entries = value instanceof Map ? value.entries() : Object.entries(value);

    const parts = [];
    for (const [k, v] of entries) {
        if (parts.length) {
            parts.push(" ");
        }
        const suppressKey = isObject(v) && Diagnostic.presentationOf(v) === "flag";
        if (!suppressKey) {
            parts.push(formatter.key(k));
        }
        const formattedValue = formatter.value(() => renderDiagnostic(v, formatter));
        if (!suppressKey || formattedValue.length) {
            parts.push(formattedValue);
        } else {
            // if flag but the value is empty we need to remove the last space if added above
            if (parts.length && parts[parts.length - 1] === " ") {
                parts.pop();
            }
        }
    }

    return parts.join("").trim();
}

function valueFor(value: unknown) {
    if (typeof value !== "object" || value === null) {
        return value;
    }
    if (Diagnostic.value in value) {
        const proxied = Diagnostic.valueOf(value);
        if (proxied === value) {
            throw new InternalError("Diagnostic value proxies to itself");
        }
        return proxied;
    }
    return value;
}

function presentationFor(value: unknown) {
    if (typeof value !== "object" || value === null) {
        return;
    }
    if (Diagnostic.presentation in value) {
        return Diagnostic.presentationOf(value);
    }
    const proxied = Diagnostic.valueOf(value);
    if (proxied && proxied !== value) {
        if (proxied === value) {
            throw new InternalError("Diagnostic value proxies to itself");
        }
        return presentationFor(proxied);
    }
}

/**
 * Render a value with presentation support
 */
function renderDiagnostic(value: unknown, formatter: Formatter, ignorePresentation?: boolean): string {
    const presentation = ignorePresentation ? undefined : presentationFor(value);

    const logValue = valueFor(value);
    if (logValue === value) {
        // Ignore presentation when we recurse or it would be an infinite loop
        ignorePresentation = true;
    } else {
        ignorePresentation = undefined;
        value = logValue;
    }

    switch (presentation) {
        case undefined:
            return renderValue(value, formatter, false);

        case "message":
            if (value === undefined || value === null) {
                throw new ImplementationError("Diagnostic message is not an object");
            }
            return formatter.message(Diagnostic.message(value));

        case "list":
            if (typeof (value as Iterable<unknown>)?.[Symbol.iterator] !== "function") {
                throw new ImplementationError("Diagnostic list is not iterable");
            }
            return renderIndentedList(value as Iterable<unknown>, formatter);

        case "squash":
            return renderValue(value, formatter, true);

        case "strong":
            return formatter.strong(() => renderDiagnostic(value, formatter, ignorePresentation));

        case "weak":
            return formatter.weak(() => renderDiagnostic(value, formatter, ignorePresentation));

        case "added":
            return formatter.added(() => renderDiagnostic(value, formatter, ignorePresentation));

        case "deleted":
            return formatter.deleted(() => renderDiagnostic(value, formatter, ignorePresentation));

        case "flag":
            return (value as string).length ? formatter.keylike(value as string) : "";

        case "error":
            return formatter.error(() => renderDiagnostic(value, formatter, ignorePresentation));

        case "via":
            return formatter.via(`${value}`);

        case "dictionary":
            if (typeof value !== "object") {
                throw new ImplementationError("Diagnostic dictionary is not an object");
            }
            return renderDictionary(value as object, formatter);

        case Lifecycle.Status.Unknown:
        case Lifecycle.Status.Inactive:
        case Lifecycle.Status.Initializing:
        case Lifecycle.Status.Active:
        case Lifecycle.Status.Crashed:
        case Lifecycle.Status.Destroyed:
            return formatter.status(presentation, () => renderDiagnostic(value, formatter, ignorePresentation));

        default:
            throw new ImplementationError(`Unsupported diagnostic presentation "${presentation}"`);
    }
}

/**
 * Group items in an iterable based on their presentation.  The result is then
 * appropriate for rendering as a list.
 */
function sequenceToList(sequence: Iterable<unknown>) {
    let group: unknown[] | undefined;
    const list = Array<unknown[]>();
    for (const value of sequence) {
        if (presentationFor(value) === "list") {
            group = undefined;
            list.push(value as unknown[]);
            continue;
        }
        if (!group) {
            list.push((group = [value]));
        } else {
            group.push(value);
        }
    }
    return list;
}

function formatTime(time: Date) {
    return `${time.getFullYear()}-${(time.getMonth() + 1).toString().padStart(2, "0")}-${time
        .getDate()
        .toString()
        .padStart(2, "0")} ${time.getHours().toString().padStart(2, "0")}:${time
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}.${time
        .getMilliseconds()
        .toString()
        .padStart(3, "0")}`;
}

/**
 * Multiline messages should always have whitespace as the first character after newlines.  Ensure this is so.
 */
function ensureIndented(text: string) {
    if (text.match(/\n\S/)) {
        return text.replace(/\n/g, "\n  ");
    }
    return text;
}

if (MatterError.formatterFor === MatterError.defaultFormatterFactory) {
    MatterError.formatterFor = LogFormat;
}

if (typeof MatterHooks !== "undefined") {
    MatterHooks.messageAndStackFor = (error: unknown, parentStack?: string[]) => {
        const { message, stack, stackLines } = Diagnostic.messageAndStackFor(error, parentStack);

        let stackStr;
        if (stack) {
            stackStr = stack.map(frame => LogFormat.formats.ansi(frame).trim()).join("\n");
        }

        return { message, stack: stackStr, stackLines };
    };
}
