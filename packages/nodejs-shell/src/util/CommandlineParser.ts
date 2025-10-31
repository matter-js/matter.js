/**
 * Quote aware Command line parser
 *
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is a Typescript rewrite of https://github.com/cdhowie/shell-parser/
 *
 * Copyright 2019 Chris Howie
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

class StringReader {
    private pos: number;
    public current: string | undefined;

    constructor(private readonly str: string) {
        this.pos = -1;
    }

    next() {
        if (this.pos < this.str.length) {
            this.current = this.str[++this.pos];
        }

        return this.current;
    }
}

function isWhitespace(c: string) {
    return c === " ";
}

function consumeWhitespace(r: StringReader) {
    while (r.current !== undefined && isWhitespace(r.current)) {
        r.next();
    }
}

function escaped(r: StringReader) {
    const n = r.next();
    if (n === undefined) {
        throw new Error("Unterminated escape sequence");
    }

    return n;
}

function quoted(r: StringReader) {
    let s = "";

    const q = r.current;
    const e = q === '"';

    for (let c = r.next(); c !== q; c = r.next()) {
        if (c === undefined) {
            throw new Error(`Unterminated quote: ${q}`);
        }

        if (e && c === "\\") {
            s += escaped(r);
        } else {
            s += c;
        }
    }

    return s;
}

export function commandlineParser(line: string) {
    const args = [];
    let s = "";

    const r = new StringReader(line);
    r.next();
    consumeWhitespace(r);

    // Indicates if we saw a quote in the current argument. This is necessary
    // to allow empty arguments ('' or ""), otherwise we have no way to
    // distinguish this case from nothing.
    let sawQuote = false;

    while (r.current !== undefined) {
        if (isWhitespace(r.current)) {
            args.push(s);
            sawQuote = false;
            s = "";

            consumeWhitespace(r);
        } else if (r.current === "\\") {
            s += escaped(r);
            r.next();
        } else if (r.current === "'" || r.current === '"') {
            s += quoted(r);
            sawQuote = true;
            r.next();
        } else {
            s += r.current;
            r.next();
        }
    }

    if (sawQuote || s.length) {
        args.push(s);
    }

    return args;
}
