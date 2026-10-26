/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "@matter/general";

/** One `AttributeStatusIB` of a `WriteResponseMessage` chip-tool decoded into its log. */
export interface LoggedAttributeStatus {
    endpoint: number;
    cluster: number;
    attribute: number;
    status: number;
    clusterStatus?: number;
}

const MESSAGE = "WriteResponseMessage";

/**
 * One line of chip's IM pretty print (`PrettyPrintIM` in `src/app/MessageDef/MessageDefHelper.cpp`): a `Name =`
 * header, an opening or closing bracket (a closing one with or without a comma), a `key = value` field, or anything
 * else, such as `Unknown tag num 5`.
 */
type Token =
    | { kind: "header"; name: string }
    | { kind: "open"; bracket: "{" | "[" }
    | { kind: "close"; bracket: "{" | "[" }
    | { kind: "field"; key: string; value: string }
    | { kind: "text" };

function tokenOf(text: string): Token {
    switch (text) {
        case "{":
        case "[":
            return { kind: "open", bracket: text };
        case "}":
        case "},":
            return { kind: "close", bracket: "{" };
        case "]":
        case "],":
            return { kind: "close", bracket: "[" };
    }
    let match = /^(\S+) =$/.exec(text);
    if (match !== null) {
        return { kind: "header", name: match[1] };
    }
    match = /^([\w-]+) = (.*?),?$/.exec(text);
    if (match !== null) {
        return { kind: "field", key: match[1], value: match[2] };
    }
    return { kind: "text" };
}

/** A `{ }` struct or `[ ]` list of the pretty print, named by the header before it. */
interface Container {
    bracket: "{" | "[";
    name?: string;
    fields: [key: string, value: string][];
    children: Container[];
}

/** How many lines of the message an error quotes. */
const QUOTED_LINES = 40;

function malformed(what: string, lines: readonly string[]) {
    const quoted =
        lines.length > QUOTED_LINES
            ? [...lines.slice(0, QUOTED_LINES), `… ${lines.length - QUOTED_LINES} more lines`]
            : lines;
    return new UnexpectedDataError(
        `chip-tool's decoded ${MESSAGE} is malformed: ${what}, so its statuses would be incomplete: ` +
            JSON.stringify(quoted),
    );
}

/** What `WriteResponseMessage::Parser::PrettyPrint` prints, unindented, for a context tag it does not know. */
const UNKNOWN_TAG = /^Unknown tag num \d+$/;

/** Whether `token` can only be part of a `WriteResponseMessage`, so a message must not have closed before it. */
function belongsToMessage(token: Token) {
    return (
        token.kind === "close" ||
        (token.kind === "header" && /IBs?$/.test(token.name)) ||
        (token.kind === "field" && token.key === "InteractionModelRevision")
    );
}

/**
 * Builds the tree of the message whose header is `lines[start]`, and returns it with the index of the line after its
 * closing brace.
 */
function parseMessage(lines: readonly string[], start: number): { message: Container; next: number } {
    const block = (end: number) => lines.slice(start, end);
    const message: Container = { bracket: "{", name: MESSAGE, fields: [], children: [] };
    const stack = new Array<Container>();
    let pendingName: string | undefined;

    for (let index = start + 1; index < lines.length; index++) {
        const line = lines[index];
        const text = line.trim();
        if (text === "") {
            continue;
        }
        const token = tokenOf(text);

        if (stack.length === 0) {
            if (token.kind !== "open" || token.bracket !== "{") {
                throw malformed(`its header is not followed by "{"`, block(index + 1));
            }
            stack.push(message);
            continue;
        }

        // At message level only the closing brace and an unknown tag are printed unindented; deeper lines never are
        const indented = /^\s/.test(line);
        const messageLevel = stack.length === 1 && (token.kind === "close" || UNKNOWN_TAG.test(text));
        if (!indented && !messageLevel) {
            throw malformed(`"${text}" starts inside it`, block(index + 1));
        }
        if (token.kind === "header" && token.name.endsWith("Message")) {
            throw malformed(`another message "${text}" starts inside it`, block(index + 1));
        }
        if (pendingName !== undefined && token.kind !== "open") {
            throw malformed(`the header "${pendingName} =" is not followed by a bracket`, block(index + 1));
        }

        const top = stack[stack.length - 1];
        switch (token.kind) {
            case "header":
                pendingName = token.name;
                break;

            case "open": {
                const container: Container = { bracket: token.bracket, name: pendingName, fields: [], children: [] };
                pendingName = undefined;
                top.children.push(container);
                stack.push(container);
                break;
            }

            case "close":
                if (token.bracket !== top.bracket) {
                    throw malformed(`"${text}" closes a ${top.bracket === "{" ? "struct" : "list"}`, block(index + 1));
                }
                stack.pop();
                if (stack.length === 0) {
                    const after = lines.slice(index + 1).find(candidate => candidate.trim() !== "");
                    if (after !== undefined && belongsToMessage(tokenOf(after.trim()))) {
                        throw malformed(`"${after.trim()}" follows its closing brace`, block(index + 2));
                    }
                    return { message, next: index + 1 };
                }
                break;

            case "field":
                top.fields.push([token.key, token.value]);
                break;
        }
    }

    throw malformed("the log ends inside it", block(lines.length));
}

/** The one value `container` holds for `key`; `required` rejects its absence, and a repeat always rejects. */
function fieldOf(container: Container, key: string, required: true, lines: readonly string[]): string;
function fieldOf(container: Container, key: string, required: false, lines: readonly string[]): string | undefined;
function fieldOf(container: Container, key: string, required: boolean, lines: readonly string[]) {
    const values = container.fields.filter(([candidate]) => candidate === key).map(([, value]) => value);
    if (values.length > 1) {
        throw malformed(`${container.name} carries ${key} ${values.length} times`, lines);
    }
    if (values.length === 0 && required) {
        throw malformed(`${container.name} carries no ${key}`, lines);
    }
    return values[0];
}

function childOf(container: Container, name: string, bracket: "{" | "[", lines: readonly string[]) {
    const children = container.children.filter(child => child.name === name);
    if (children.length !== 1) {
        throw malformed(`${container.name} carries ${children.length} ${name} where it needs one`, lines);
    }
    if (children[0].bracket !== bracket) {
        throw malformed(`${container.name} carries ${name} as a ${bracket === "[" ? "struct" : "list"}`, lines);
    }
    return children[0];
}

function hexOf(value: string, pattern: RegExp, what: string, lines: readonly string[]) {
    const match = pattern.exec(value);
    if (match === null) {
        throw malformed(`${what} "${value}" is not a number`, lines);
    }
    return Number.parseInt(match.slice(1).join(""), 16);
}

const HEX = /^0x([0-9a-f]+)$/i;
// `ChipLogFormatMEI` renders the id as two 16-bit halves
const MEI = /^0x([0-9a-f]{4})_([0-9a-f]{4})$/i;
// A build without `CHIP_CONFIG_IM_STATUS_CODE_VERBOSE_FORMAT` prints the code without its name
const STATUS = /^0x([0-9a-f]+)(?: \([^)]*\))?$/i;

function statusesOf(message: Container, lines: readonly string[]): LoggedAttributeStatus[] {
    const list = childOf(message, "AttributeStatusIBs", "[", lines);
    if (list.fields.length !== 0) {
        throw malformed("its AttributeStatusIBs list carries a field of its own", lines);
    }

    return list.children.map(entry => {
        if (entry.name !== "AttributeStatusIB") {
            throw malformed(`its AttributeStatusIBs list carries a ${entry.name ?? "nameless"} entry`, lines);
        }
        if (entry.bracket !== "{") {
            throw malformed("its AttributeStatusIBs list carries an AttributeStatusIB as a list", lines);
        }
        const path = childOf(entry, "AttributePathIB", "{", lines);
        const status = childOf(entry, "StatusIB", "{", lines);
        const clusterStatus = fieldOf(status, "cluster-status", false, lines);

        const logged: LoggedAttributeStatus = {
            endpoint: hexOf(fieldOf(path, "Endpoint", true, lines), HEX, "Endpoint", lines),
            cluster: hexOf(fieldOf(path, "Cluster", true, lines), HEX, "Cluster", lines),
            attribute: hexOf(fieldOf(path, "Attribute", true, lines), MEI, "Attribute", lines),
            status: hexOf(fieldOf(status, "status", true, lines), STATUS, "status", lines),
        };
        if (clusterStatus !== undefined) {
            logged.clusterStatus = hexOf(clusterStatus, HEX, "cluster-status", lines);
        }
        return logged;
    });
}

/**
 * The attribute statuses of every `WriteResponseMessage` in `lines`, in the order the device sent them, or `undefined`
 * where `lines` hold no such message.
 *
 * `lines` are one chip-tool command's log lines, without chip's log prefix: the `logs` of an interactive-server reply.
 * chip's `WriteClient` decodes each `WriteResponseMessage` it receives into those lines
 * (`WriteResponseMessage::Parser::PrettyPrint`, one line per field, nested by tabs) in every build with
 * `CHIP_CONFIG_IM_PRETTY_PRINT` and detail logging, which a debug build on Linux or macOS has with the default logging
 * arguments (`chip_logging`, `chip_detail_logging`). Unlike chip-tool's JSON results, which carry only the paths a
 * write failed on, the decoded message names every path with its status.
 *
 * Each message is read as a tree of `{ }` structs and `[ ]` lists, each named by the `Name =` header before it. The
 * message holds one `AttributeStatusIBs` list, which may be empty. Each entry of it is an `AttributeStatusIB` with one
 * `AttributePathIB` (Endpoint, Cluster, Attribute) and one `StatusIB` (status, optionally cluster-status). A message
 * without the list is rejected although chip's `WriteClient` accepts one, because the field is mandatory on the wire.
 *
 * Throws {@link UnexpectedDataError} for a message whose brackets do not balance or do not match, that another message
 * starts inside, that the log ends inside, or that is followed by more of its own content after its closing brace; and
 * for a message without its list, or with an entry that lacks a field or carries one twice. Each means lines are
 * missing, and the statuses would then be incomplete. This detects truncated and unbalanced output; a whole entry
 * missing with its brackets balanced cannot be told from one the device never sent.
 */
export function loggedWriteResponseStatuses(lines: readonly string[]): LoggedAttributeStatus[] | undefined {
    let statuses: LoggedAttributeStatus[] | undefined;

    for (let index = 0; index < lines.length; index++) {
        // A message's own header is unindented unless an earlier pretty print failed part way and left its depth raised
        if (lines[index].trim() !== `${MESSAGE} =`) {
            continue;
        }
        const { message, next } = parseMessage(lines, index);
        statuses = [...(statuses ?? []), ...statusesOf(message, lines.slice(index, next))];
        index = next - 1;
    }

    return statuses;
}
