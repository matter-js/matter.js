/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const utf8 = new TextDecoder();

export function textOf(input: {}) {
    if (typeof input === "string") {
        return input;
    }

    if (ArrayBuffer.isView(input)) {
        return utf8.decode(input);
    }

    return input.toString();
}

export function base64Of(input: string | Uint8Array) {
    if (typeof input === "string") {
        return Buffer.from(input, "utf8").toString("base64");
    }
    return Buffer.from(input).toString("base64");
}

export async function* asyncLinesOf<C, T extends AsyncIterable<C>>(input: T, filter?: (chunk: C) => C | undefined) {
    let partial: undefined | string;

    for await (let chunk of input) {
        if (filter) {
            chunk = filter(chunk) as Awaited<C>;
        }

        if (chunk === undefined || chunk === null) {
            continue;
        }

        const text = textOf(chunk);
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (partial) {
                line = partial + line;
                partial = undefined;
            }
            if (i === lines.length - 1) {
                partial = line;
            } else {
                yield line;
            }
        }
    }

    if (partial !== undefined) {
        yield partial;
    }
}

/**
 * Strip ANSI escape codes from a string.
 */
export function deansify(text: string) {
    // Credit to https://stackoverflow.com/questions/25245716/remove-all-ansi-colors-styles-from-strings
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\u001b\u009b][[()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}
