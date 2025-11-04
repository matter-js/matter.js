/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormattedText, InternalError, serialize } from "#general";
import { Specification } from "#model";
import { Package } from "#tools";
import { posix, relative, sep } from "node:path";
import { absolute, readMatterFile, writeMatterFile } from "./file.js";
import { asObjectKey } from "./string.js";

const HEADER = `/**
 * @license
 * Copyright 2022-${new Date().getFullYear()} Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

`;

const GENERATED_WARNING = "/*** THIS FILE IS GENERATED, DO NOT EDIT ***/";
const EDITABLE_WARNING = "/*** THIS FILE WILL BE REGENERATED IF YOU DO NOT REMOVE THIS MESSAGE ***/";

const INDENT = "    ";
const WRAP_WIDTH = 120;

export type Documentation = {
    description?: string;
    details?: string;
    xref?: Specification.CrossReference;
    isDeprecated?: boolean;
};

function mapSpec(xref?: Specification.CrossReference) {
    switch (xref?.document) {
        case "core":
            return "MatterSpecification.v142.Core";

        case "cluster":
            return "MatterSpecification.v142.Cluster";

        case "device":
            return "MatterSpecification.v142.Device";

        case "namespace":
            return "MatterSpecification.v142.Namespace";
    }
}

export abstract class Entry {
    private documentation?: Documentation;
    private docText?: string;
    shouldGroup = false;
    shouldDelimit?: boolean;

    constructor(protected parentBlock: Block | undefined) {}

    get isDocumented() {
        return !!(
            this.documentation?.description ||
            this.documentation?.details ||
            this.documentation?.xref ||
            this.documentation?.isDeprecated ||
            this.docText
        );
    }

    /** Add a TsDoc style comment */
    document(content: string | Documentation, extra?: string) {
        if (typeof content === "string") {
            this.documentation = { details: content };
        } else {
            this.documentation = content;
        }
        this.docText = extra;
        return this;
    }

    toString(linePrefix = "") {
        return `${this.createComment(linePrefix)}${this.serialize(linePrefix)}`;
    }

    protected abstract serialize(linePrefix: string): string;

    private createComment(linePrefix: string) {
        const paragraphs = Array<string>();

        if (this.documentation?.description) {
            paragraphs.push(this.documentation.description);
        }
        if (this.documentation?.details) {
            paragraphs.push(this.documentation.details);
        }

        if (this.docText) {
            paragraphs.push(this.docText);
        }

        // Word wrap documentation
        const lines = FormattedText(paragraphs.join("\n"), WRAP_WIDTH - 3 - linePrefix.length);

        // Add xref after wrapping so we can ensure it never wraps
        const spec = mapSpec(this.documentation?.xref);
        if (spec) {
            if (lines.length) {
                lines.push("");
            }
            lines.push(`@see {@link ${spec}} § ${this.documentation?.xref?.section}`);
        }

        if (this.documentation?.isDeprecated) {
            if (lines.length) {
                lines.push("");
            }
            lines.push("@deprecated");
        }

        if (lines.length) {
            // Remove blank lines between jsdoc directives except for @see
            for (let i = 0; i < lines.length - 1; i++) {
                if (
                    lines[i][0] == "@" &&
                    lines[i + 1] == "" &&
                    lines[i + 2][0] == "@" &&
                    !lines[i + 2].startsWith("@see")
                ) {
                    lines.splice(i + 1, 1);
                }
            }

            return `${linePrefix}/**\n${lines
                .map(l => `${linePrefix} * ${l}`.trimEnd())
                .join("\n")}\n${linePrefix} */\n`;
        }

        return "";
    }
}

class Raw extends Entry {
    text: string;

    constructor(parentBlock: Block, text: any) {
        super(parentBlock);
        this.text = `${text}`;
    }

    serialize(linePrefix: string) {
        if (this.text === undefined) {
            return "";
        }
        return this.text
            .split("\n")
            .map(l => `${linePrefix}${l}`)
            .join("\n");
    }
}

class Atom extends Raw {
    constructor(parentBlock: Block, labelOrText: any, text?: any) {
        if (text === undefined) {
            text = `${labelOrText}`;
        } else {
            text = `${asObjectKey(labelOrText)}: ${text}`;
        }

        super(parentBlock, text);
    }
}

export class Block extends Entry {
    entries = Array<Entry>();
    private addBefore?: Entry;
    private definedNames = new Set<string>();

    protected indent = "";
    protected prefix = "";
    protected suffix = "";

    constructor(parentBlock: Block | undefined) {
        super(parentBlock);
    }

    get length() {
        return this.entries.length;
    }

    indexOf(entry: Entry) {
        return this.entries.indexOf(entry);
    }

    splice(start: number, deleteCount?: number) {
        return this.entries.splice(start, deleteCount);
    }

    get(index: number) {
        return this.entries[index];
    }

    override serialize(linePrefix = "") {
        const childLinePrefix = `${linePrefix}${this.indent}`;
        const serializedEntries = Array<string>();
        const rawEntries = Array<Entry>();
        for (const entry of this.entries) {
            const text = entry.toString(childLinePrefix);
            if (!(entry instanceof Block) || text !== "") {
                serializedEntries.push(text);
                rawEntries.push(entry);
            }
        }
        return this.layOutEntries(linePrefix, serializedEntries, rawEntries);
    }

    layOutEntries(linePrefix: string, serializedEntries: string[], rawEntries: Entry[]) {
        const parts = Array<string>();
        if (this.prefix) {
            parts.push(`${linePrefix}${this.prefix}`);
        }

        let needSpace = false;
        for (let i = 0; i < serializedEntries.length; i++) {
            // Add delimiter to entry if necessary
            const entry = `${serializedEntries[i]}${this.delimiterAfter(rawEntries[i], serializedEntries[i])}`;

            // Separate documented and large elements from their siblings
            if (rawEntries[i].isDocumented || (entry.split("\n").length > 5 && !rawEntries[i].shouldGroup)) {
                if (i) {
                    parts.push("");
                }
                needSpace = true;
            } else if (needSpace) {
                parts.push("");
                needSpace = false;
            }

            if (rawEntries[i].isDocumented) {
                needSpace = true;
            }

            // Add the entry
            parts.push(entry);
        }

        if (this.suffix) {
            parts.push(`${linePrefix}${this.suffix}`);
            if (this.prefix && parts.length === 2) {
                return parts.join("");
            }
        }
        return parts.join("\n");
    }

    /** Access the (required) parent */
    get parent() {
        if (!this.parentBlock) throw new Error("Undefined parent access");
        return this.parentBlock;
    }

    /** Access the file */
    get file() {
        let b: Block = this;
        while (!(b instanceof TsFile)) {
            b = b.parent;
        }
        return b;
    }

    /** Delete from parent */
    remove() {
        if (this.parentBlock) {
            const index = this.parentBlock.indexOf(this);
            if (index !== -1) this.parentBlock.splice(index, 1);
        }
    }

    /**
     * Remove a name from the defined pool.  This is necessary when e.g.
     * defining a type and object with the same name.
     */
    undefine(name: string) {
        this.definedNames.delete(name);
    }

    /** Add entries.  Each entry will be serialized using toString() */
    add(...entries: Entry[]) {
        // Entries usually aren't fully defined when added but they do have
        // their prefix set.  So we can attempt to extract the string name in
        // order to offer lightweight attempt at rejecting duplicate
        // identifiers
        entries.forEach(e => {
            const s = e.toString();
            let m = s.match(/^(\w+):/);
            if (!m) {
                m = s.match(
                    /^\s*(?:(?:export|public|private|const)\s+)*(?:function|enum|class|interface|const|var|let)\s+(\w+)/,
                );
            }
            if (m) {
                this.nameDefined(m[1]);
            }
        });

        if (this.addBefore) {
            const index = this.entries.indexOf(this.addBefore);
            if (index !== -1) {
                this.entries.splice(index, 0, ...entries);
                return this;
            }
        }

        this.entries.push(...entries);
        return this;
    }

    /** Add raw text */
    raw(text: any) {
        return this.add(new Raw(this, `${text}`));
    }

    /** Add a blank line */
    blank() {
        return this.raw("");
    }

    /** Add a save point that allows for out-of-order insertion */
    section() {
        const section = new Block(this);
        this.add(section);
        return section;
    }

    /** Add a block with separate statements terminated by ";" */
    statements(prefix = "", suffix = "") {
        const block = new StatementBlock(this, prefix, suffix);
        this.add(block);
        return block;
    }

    /** Add a comma-delimited block */
    expressions(prefix: string, suffix: string) {
        const block = new ExpressionBlock(this, prefix, suffix);
        this.add(block);
        return block;
    }

    /** Add a builder-style block */
    builder(initialAtom?: string) {
        const block = new BuilderBlock(this);
        if (initialAtom !== undefined) {
            block.atom(initialAtom);
        }
        this.add(block);
        return block;
    }

    /** Add a statement or expression that will be automatically delimited */
    atom(labelOrText: any, text?: any) {
        const atom = new Atom(this, labelOrText, text);
        this.add(atom);
        return atom;
    }

    /** Add an atom or block that recreates the input value */
    value(value: any, prefix = "", suffix = "") {
        if (value === undefined) {
            return;
        }

        if (Array.isArray(value)) {
            const block = this.expressions(`${prefix}[`, `]${suffix}`);
            value.forEach(v => (v === undefined ? block.atom("null") : block.value(v)));
            return block;
        }

        if (serialize.isPrimitive(value)) {
            const serialized = serialize(value);
            if (serialized === undefined) {
                return;
            }
            return this.atom(`${prefix}${serialized}${suffix}`);
        }

        const block = this.expressions(`${prefix}{`, `}${suffix}`);
        for (const k in value) {
            block.value(value[k], `${asObjectKey(k)}: `);
        }
        return block;
    }

    /** Execute logic with block configured for specific insertion point */
    insertingBefore<T>(before: Entry, fn: () => T) {
        const oldAddBefore = this.addBefore;
        try {
            this.addBefore = before;
            return fn();
        } finally {
            this.addBefore = oldAddBefore;
        }
    }

    /** This is just a helper for guarding against duplicate definitions */
    nameDefined(name: string): void {
        if (this.definedNames.has(name)) {
            throw new Error(`Conflicting definitions for ${name} in same scope`);
        }
        this.definedNames.add(name);
    }

    protected delimiterAfter(entry: Entry, serialized: string): string {
        if (
            serialized.match(/^\s*(?:\/\*(?!\*\/)\*\/\s*)?(?:export\s*)?(?:enum|function|namespace|interface|class)\s/m)
        ) {
            // Do not delimit functions structures that eslint will complain about
            return "";
        }

        if (this.isDelimited(entry)) {
            return ";";
        }

        return "";
    }

    protected isDelimited(entry: Entry) {
        return (entry instanceof Atom || entry instanceof NestedBlock) && entry.shouldDelimit !== false;
    }
}

abstract class NestedBlock extends Block {
    /** Add a TsDoc style comment */
    doc?: string | Documentation;

    constructor(parent: Block | undefined, prefix: string, suffix: string) {
        super(parent);
        this.indent = INDENT;
        this.prefix = prefix;
        this.suffix = suffix;
    }
}

class StatementBlock extends NestedBlock {
    constructor(parent: Block | undefined, prefix = "{", suffix = "}") {
        super(parent, prefix, suffix);
    }
}

class BuilderBlock extends NestedBlock {
    constructor(parent: Block | undefined) {
        super(parent, "", "");
    }

    override serialize(linePrefix = "") {
        const first = this.entries[0]?.toString(linePrefix);
        if (first === undefined) {
            return "";
        }
        if (this.entries.length === 1) {
            return first;
        }
        if (this.entries.length === 2 && !first.includes("\n")) {
            const second = this.entries[1]?.toString("");
            if (!second.includes("\n") && first.length + second.length + 1 < WRAP_WIDTH) {
                return `${first}.${second}`;
            }
        }

        // 2+ entries or first two entries don't fit on one line
        const result = [first];

        linePrefix = `${linePrefix}${INDENT}`;
        for (let i = 1; i < this.entries.length; i++) {
            if (this.entries[i].isDocumented) {
                result.push("\n");
            }
            result.push(`${linePrefix}.${this.entries[i].toString(linePrefix).slice(linePrefix.length)}`);
        }

        return result.join("\n");
    }
}

// These are different methods for formatting expression blocks.  We want to
// optimize for (in order of priority) readability and size
enum ExpressionLayout {
    None,
    SingleLine,
    SingleNested,
    MultipleLines,
    Verbose,
}

function chooseExpressionLayout(lineLength: number, prefix: string, serializedEntries: string[]) {
    let currentLayout = ExpressionLayout.None;
    for (const entry of serializedEntries) {
        const multiline = entry.indexOf("\n") !== -1;

        // Any comment or assignment automatically forces verbose layout mode
        if (entry.match(/\/\*|\/\/| = /)) {
            return ExpressionLayout.Verbose;
        }

        switch (currentLayout) {
            case ExpressionLayout.None:
                if (multiline) {
                    if (prefix.endsWith("{")) {
                        // Multiline object entry always forces verbose mode
                        currentLayout = ExpressionLayout.Verbose;
                    } else {
                        // Arrays we will wrap around a single multi-line entry
                        currentLayout = ExpressionLayout.SingleNested;
                    }
                } else {
                    lineLength += entry.trim().length;
                    if (lineLength >= WRAP_WIDTH + INDENT.length) {
                        // If the entry is too long, place on a new line
                        currentLayout = ExpressionLayout.MultipleLines;
                    } else {
                        // Wrap entry on a single line
                        currentLayout = ExpressionLayout.SingleLine;
                    }
                }
                break;

            case ExpressionLayout.SingleNested:
                // If previously we saw multiple lines, any other entry forces verbose mode
                return ExpressionLayout.Verbose;

            case ExpressionLayout.SingleLine:
                if (multiline) {
                    // More than one multi-line entry always forces verbose mode
                    return ExpressionLayout.Verbose;
                }

                lineLength += entry.trim().length + 2;

                if (lineLength >= WRAP_WIDTH) {
                    // Entries do not fit on one line; move to multi-line mode
                    currentLayout = ExpressionLayout.MultipleLines;
                }

                break;

            case ExpressionLayout.MultipleLines:
                if (multiline) {
                    return ExpressionLayout.Verbose;
                }
                break;
        }
    }
    return currentLayout;
}

class ExpressionBlock extends NestedBlock {
    constructor(parent: Block, prefix: string, suffix: string) {
        super(parent, prefix, suffix);
    }

    override layOutEntries(linePrefix: string, serializedEntries: string[], rawEntries: Entry[]) {
        let adornmentLength = linePrefix.length + this.prefix.length + this.suffix.length;
        const isArrayOrObject = this.prefix.match(/[[{]$/);
        if (isArrayOrObject) {
            adornmentLength += 2;
        }

        // Scan the entries to determine how we format the code
        const layout = chooseExpressionLayout(adornmentLength, this.prefix, serializedEntries);

        // Render optimized layouts
        switch (layout) {
            case ExpressionLayout.None:
                return `${linePrefix}${this.prefix}${this.suffix}`;

            case ExpressionLayout.SingleNested: {
                // Need to reserialize with reduced padding
                const line = this.entries[0].toString(linePrefix).trim();
                return `${linePrefix}${this.prefix}${line}${this.suffix}`;
            }

            case ExpressionLayout.SingleLine: {
                let line = serializedEntries.map(e => e.trim()).join(", ");
                if (isArrayOrObject && !this.prefix.endsWith("[") && !line.startsWith("{")) {
                    line = ` ${line} `;
                }
                return `${linePrefix}${this.prefix}${line}${this.suffix}`;
            }

            case ExpressionLayout.MultipleLines:
                return `${linePrefix}${this.prefix}\n${serializedEntries.join(",\n")}\n${linePrefix}${this.suffix}`;
        }

        // "Verbose" layout is the standard provided by super
        return super.layOutEntries(linePrefix, serializedEntries, rawEntries);
    }

    override delimiterAfter(entry: Entry) {
        if (this.isDelimited(entry)) {
            const index = this.entries.indexOf(entry);
            if (index !== -1) {
                for (let i = index + 1; i < this.length; i++) {
                    if (this.isDelimited(this.get(i))) {
                        return ",";
                    }
                }
            }
        }
        return "";
    }
}

/**
 * Quick & dirty support for code gen.  Less cumberson than e.g. TS compiler AST
 */
export class TsFile extends Block {
    #imports = new Map<string, Array<string>>();
    #header!: Block;
    #packageRoot: string;

    constructor(
        public name: string,
        private editable = false,
    ) {
        if (name.match(/\.(?:js|ts)$/)) {
            throw new InternalError(`Filename ${name} should not have an extension`);
        }

        super(undefined);

        this.#header = this.section();

        let header = HEADER;
        if (editable) {
            header += EDITABLE_WARNING;
        } else {
            header += GENERATED_WARNING;
        }
        this.#header.raw(header);

        this.#packageRoot = new Package({ path: absolute(name) }).path;
    }

    get basename() {
        return this.name.replace(/^.*[/\\]/, "");
    }

    addImport(filename: string, name?: string, asExternal?: string) {
        filename = this.#resolveImportPath(filename, asExternal);

        let list = this.#imports.get(filename);
        if (!list) {
            list = new Array<string>();
            this.#imports.set(filename, list);
        }
        if (name?.startsWith("*")) {
            if (list.length) {
                throw new Error(`Cannot import "${name}" because imports individual names`);
            }
            list.push(name);
            this.nameDefined(name.replace(/\* as /, ""));
        } else if (name && !list.includes(name)) {
            if (list[0]?.startsWith("*")) {
                throw new Error(`Cannot import "${name}" because imports *`);
            }

            list.push(name);

            name = name.replace(/^\w+ as /, "");
            this.nameDefined(name);
        }
        return this;
    }

    addReexport(filename: string, ...symbols: string[]) {
        filename = this.#resolveImportPath(filename);

        if (symbols.length) {
            const reexport = this.expressions("export {", `} from ${serialize(filename)}`);
            for (const symbol of symbols) {
                reexport.atom(symbol);
            }
        } else {
            this.atom(`export * from ${serialize(filename)}`);
        }
    }

    save() {
        const filename = `${this.name}.ts`;

        if (this.editable) {
            try {
                const body = readMatterFile(filename);
                if (!body.includes(EDITABLE_WARNING) && !body.includes(GENERATED_WARNING)) {
                    return;
                }
            } catch (e) {
                if ((e as { code?: string }).code !== "ENOENT") {
                    throw e;
                }
            }
        }

        if (this.#imports.size) {
            const importBlock = this.#header.section();
            this.#imports.forEach((symbols, name) => {
                if (symbols[0]?.startsWith("*")) {
                    importBlock.atom(`import ${symbols[0]} from "${name}"`);
                } else if (symbols.length) {
                    const imp = importBlock.expressions("import {", `} from "${name}"`);
                    imp.shouldGroup = true;
                    symbols.forEach(s => imp.atom(s));
                } else {
                    importBlock.atom(`import "${name}"`);
                }
            });
        }

        let body = this.toString();
        if (body[body.length - 1] !== "\n") {
            body += "\n";
        }

        writeMatterFile(filename, body);
        return this;
    }

    #resolveImportPath(filename: string, asExternal?: string) {
        // The set of imports we allow is intentionally restrictive so we can catch errors more easily.  Extend as
        // necessary
        if (filename.startsWith(".") || filename.startsWith("!")) {
            if (!filename.endsWith(".js")) {
                throw new InternalError(`Local import of ${filename} has no .js suffix`);
            }
        } else if (filename.startsWith("#")) {
            return filename;
        } else if (filename.endsWith(".js")) {
            throw new InternalError(`Local import of ${filename} must start with "!", "#" or "."`);
        } else if (filename.startsWith("@project-chip/")) {
            return filename.replace(/^@project-chip\/matter-/, "#");
        } else if (filename.startsWith("@matter/")) {
            // For @matter/package we assume an alias of "#package"; for "@matter/package/submodule" we assume an
            // alias of "#submodule"
            return filename.replace(/^@matter\/[^/]+\//, "#");
        } else {
            throw new InternalError(`Absolute import of ${filename} must start with "@matter"`);
        }

        const suffices = filename.match(/\.([a-z]+)\.[a-z]+$/);
        if (suffices && !["element", "resource"].includes(suffices[1])) {
            throw new InternalError(`Import of ${filename} has multiple suffices`);
        }

        if (filename.startsWith("!")) {
            const to = absolute(filename);
            if (!to.startsWith(this.#packageRoot)) {
                if (asExternal === undefined) {
                    throw new Error(`No external name provided for reference to "${filename}" from "${this.name}"`);
                }
                return asExternal;
            }

            const from = absolute(this.name.replace(/\/[^/]+$/, ""));
            filename = relative(from, to);

            // On Windows, convert all "\\" to "/"
            filename = filename.replaceAll(sep, posix.sep);

            if (!filename.startsWith(".")) {
                filename = `./${filename}`;
            }
        }

        return filename;
    }
}
