/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import { Lexer } from "#parser/Lexer.js";
import { BasicToken } from "#parser/Token.js";
import { TokenStream } from "#parser/TokenStream.js";
import { FieldValue } from "../common/index.js";
import { Aspect } from "./Aspect.js";

namespace Functions {
    export function minOf(args: unknown[]) {
        return Math.min(...args.filter(arg => typeof arg === "number"));
    }

    export function maxOf(args: unknown[]) {
        return Math.max(...args.filter(arg => typeof arg === "number"));
    }
}

function isFunction(name: string): name is keyof typeof Functions {
    return Object.hasOwn(Functions, name);
}

/**
 * An operational view of constraints as defined by the Matter specification.
 *
 * A "constraint" limits possible data values.
 */
export class Constraint extends Aspect<Constraint.Definition> implements Constraint.Ast {
    desc?: boolean;
    value?: Constraint.Expression;
    min?: Constraint.Expression;
    max?: Constraint.Expression;
    in?: FieldValue;
    entry?: Constraint;
    cpMax?: number;
    parts?: Constraint[];

    /**
     * Initialize from a Constraint.Definition or the constraint DSL defined by the Matter Specification.
     */
    constructor(definition: Constraint.Definition) {
        super(definition);

        let ast;
        switch (typeof definition) {
            case "string":
                // The spec designates a "0b000xxxxx" syntax for specifying constraints as bitmasks.  Through 1.3 we
                // only see this on bitmaps which constrain fine using the bit definitions.  So just ignore it. We also
                // handle one invalid case where there is no "0b" or "0x" prefix on a mask
                if (
                    // Mask
                    definition.match(/^0b[0x ]+$/) ||
                    // Hack to identify mask without 0b prefix
                    (definition.startsWith("00") && definition.includes("x") && definition.match(/^[0x ]+$/))
                ) {
                    break;
                }
                ast = Parser.parse(this, definition);
                break;

            case "number":
                ast = { value: definition };
                break;

            default:
                ast = definition;
                if (ast?.definition) {
                    this.definition = ast.definition;
                }
                break;
        }

        if (!ast) {
            this.isEmpty = true;
            return;
        }

        this.desc = ast.desc;
        this.value = ast.value;
        this.min = ast.min;
        this.max = ast.max;
        this.in = ast.in;
        this.entry = ast.entry === undefined ? undefined : new Constraint(ast.entry);
        this.cpMax = ast.cpMax;
        this.parts = ast.parts?.length ? ast.parts.map(p => new Constraint(p)) : undefined;

        this.isEmpty =
            this.desc === undefined &&
            this.value === undefined &&
            this.min === undefined &&
            this.max === undefined &&
            this.in === undefined &&
            this.entry === undefined &&
            this.cpMax === undefined &&
            this.parts === undefined;

        this.freeze();
    }

    override extend(other: Constraint) {
        if (other.isEmpty) {
            return this;
        }

        if (this.isEmpty) {
            return other;
        }

        return new Constraint({
            desc: other.desc ?? this.desc,
            value: other.value ?? this.value,
            min: other.min ?? this.min,
            max: other.max ?? this.max,
            in: other.in ?? this.in,
            entry: other.entry ?? this.entry,
            cpMax: other.cpMax ?? this.cpMax,
            parts: other.parts ?? this.parts,
        });
    }

    /**
     * Test a value against a constraint.  Does not recurse into arrays.
     */
    test(value: FieldValue, nameResolver?: (name: string) => unknown): boolean {
        // Expression evaluator.  This is for constraints such as "min FieldName"
        function valueOf(value: Constraint.Expression | undefined, raw = false): FieldValue | undefined {
            if (!raw && (typeof value === "string" || Array.isArray(value))) {
                return value.length;
            }
            if (typeof value === "object" && value !== null && "type" in value) {
                const { type } = value;
                switch (type) {
                    case FieldValue.reference:
                        if (typeof value.name === "string") {
                            value = FieldValue(nameResolver?.(camelize(value.name)));
                        }
                        break;

                    case "+": {
                        const lhs = valueOf(value.lhs);
                        const rhs = valueOf(value.rhs);
                        if (typeof lhs === "number" && typeof rhs === "number") {
                            return lhs + rhs;
                        }
                        return undefined;
                    }

                    case "-": {
                        const lhs = valueOf(value.lhs);
                        const rhs = valueOf(value.rhs);
                        if (typeof lhs === "number" && typeof rhs === "number") {
                            return lhs - rhs;
                        }
                        return undefined;
                    }

                    case "maxOf":
                    case "minOf": {
                        Functions[type](value.args.map(value => valueOf(value)));
                        return undefined;
                    }
                }
            }

            return value;
        }

        if (value === undefined) {
            return false;
        }

        if (this.in) {
            let set = valueOf(this.in, true);
            if (!Array.isArray(set)) {
                set = set === undefined ? [] : [set];
            }
            return (set as unknown[]).indexOf(value) !== -1;
        }

        const v = valueOf(this.value);
        if (v === value) {
            return true;
        }

        if (v !== undefined || value === null) {
            return false;
        }

        if (this.min !== undefined && this.min !== null) {
            const min = valueOf(this.min);
            if (min !== undefined && min !== null && min > value) {
                return false;
            }
        }

        if (this.max !== undefined && this.max !== null) {
            const max = valueOf(this.max);
            if (max !== undefined && max !== null && max < value) {
                return false;
            }
        }

        if (this.parts?.every(part => part.test(value, nameResolver) === false)) {
            return false;
        }

        return true;
    }

    override toString() {
        if (!this.valid && this.definition) {
            return this.definition.toString();
        }
        return Serializer.serialize(this);
    }

    protected override freeze() {
        if (this.parts) {
            Object.freeze(this.parts);
        }
        super.freeze();
    }
}

export namespace Constraint {
    export type NumberOrIdentifier = number | string;

    export const KEYWORDS = ["in", "min", "max", "to", "all", "desc", "true", "false"] as const;

    export const keywords = new Set<string>(KEYWORDS);

    /**
     * Parsed constraint.
     */
    export type Ast = {
        /**
         * Indicates constraint is defined in prose and cannot be enforced automatically.
         */
        desc?: boolean;

        /**
         * Constant value.
         */
        value?: Expression;

        /**
         * Lower bound on value or sequence length.
         */
        min?: Expression;

        /**
         * Upper bound on value or sequence length.
         */
        max?: Expression;

        /**
         * Require set membership for the value.
         */
        in?: FieldValue;

        /**
         * Constraint on list child element.
         */
        entry?: Ast;

        /**
         * Constraint on codepoints in a string.
         */
        cpMax?: number;

        /**
         * List of sub-constraints in a sequence.
         */
        parts?: Ast[];
    };

    /**
     * Parsed binary operator.
     */
    export interface BinaryOperator {
        type: "+" | "-";

        lhs: Expression;

        rhs: Expression;
    }

    /**
     * Parsed function.
     */
    export interface Function {
        type: "maxOf" | "minOf";

        args: Expression[];
    }

    /**
     * Parsed expression.
     */
    export type Expression = FieldValue | BinaryOperator | Function;

    /**
     * These are all ways to describe a constraint.
     */
    export type Definition = (Ast & { definition?: Definition }) | string | number | undefined;
}

namespace Serializer {
    export function serialize(ast: Constraint.Ast): string {
        if (ast.parts) {
            return ast.parts.map(serialize).join(", ");
        }
        if (ast.entry) {
            return `${serializeAtom(ast)}[${serialize(ast.entry)}]`;
        }
        if (ast.cpMax) {
            return `${serializeAtom(ast)}{${ast.cpMax}}`;
        }
        return serializeAtom(ast);
    }

    function serializeValue(value: Constraint.Expression, inExpr = false): string {
        if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Date) {
            return FieldValue.serialize(value);
        }

        switch (value.type) {
            case "+":
            case "-":
                const sum = `${serializeValue(value.lhs, true)} ${value.type} ${serializeValue(value.rhs, true)}`;
                if (inExpr) {
                    // Ideally only add parenthesis if precedence requires.  But nested expressions are not used
                    // anywhere as yet (and probably won't be) so don't try to be fancy, just correct
                    return `(${sum})`;
                }
                return sum;

            default:
                if (isFunction(value.type)) {
                    return `${value.type}(${(value as Constraint.Function).args.map(value => serializeValue(value)).join(", ")})`;
                }

                return FieldValue.serialize(value as FieldValue);
        }
    }

    function serializeAtom(ast: Constraint.Ast) {
        if (ast.desc) {
            return "desc";
        }

        if (ast.value !== undefined && ast.value !== null) {
            return `${serializeValue(ast.value)}`;
        }

        if (ast.min !== undefined && ast.min !== null) {
            if (ast.max === undefined || ast.max === null) {
                return `min ${serializeValue(ast.min)}`;
            }
            return `${serializeValue(ast.min)} to ${serializeValue(ast.max)}`;
        }

        if (ast.max !== undefined && ast.max !== null) {
            return `max ${serializeValue(ast.max)}`;
        }

        if (ast.in !== undefined) {
            return `in ${serializeValue(ast.in)}`;
        }

        return "all";
    }
}

namespace Parser {
    const lexer = new Lexer(Constraint.KEYWORDS);

    export function parse(constraint: Constraint, definition: string): Constraint.Ast {
        const tokens = TokenStream(lexer.lex(definition, (code, message) => constraint.error(code, message)));

        const result = parseParts();

        if (tokens.token && tokens.token?.type !== ",") {
            unexpected();
        }

        return result;

        function unexpected() {
            constraint.error("UNEXPECTED_CONSTRAINT_TOKEN", `Unexpected ${tokens.description}`);
        }

        function parseParts(): Constraint.Ast {
            const parts = Array<Constraint.Ast>();

            while (true) {
                const part = parsePart();

                if (part !== undefined) {
                    parts.push(part);
                }

                if (tokens.done) {
                    break;
                }

                if (tokens.token?.type !== ",") {
                    break;
                }

                tokens.next();
            }

            if (!parts.length) {
                return {};
            }

            if (parts.length === 1) {
                return parts[0];
            }

            return { parts };
        }

        function parsePart(): Constraint.Ast | undefined {
            const result = parsePartWithoutSubconstraint();

            if (result === undefined) {
                return result;
            }

            switch (tokens.token?.type) {
                case "[":
                    {
                        tokens.next();

                        const entry = parseParts();

                        if (tokens.token?.type !== ("]" as any)) {
                            constraint.error("MISSING_ENTRY_END", 'Entry constraint does not end with "]"');
                        }

                        tokens.next();

                        if (entry !== undefined) {
                            result.entry = entry;
                        }
                    }
                    break;

                case "{":
                    {
                        tokens.next();

                        if (tokens.token?.type !== ("value" as any)) {
                            constraint.error(
                                "MISSING_CODEPOINT_MAX",
                                "Codepoint constraint does not specify maximum codepoint length",
                            );
                            if (tokens.peeked?.type === "}") {
                                tokens.next();
                            }
                        } else {
                            result.cpMax = FieldValue.numericValue(
                                (tokens.token as unknown as BasicToken.Number).value,
                            );
                            tokens.next();
                        }

                        if (tokens.token?.type !== ("}" as any)) {
                            constraint.error("MISSING_CODEPOINT_END", 'Codepoint constraint does not end with "}"');
                        }

                        tokens.next();
                    }
                    break;
            }

            return result;
        }

        function parsePartWithoutSubconstraint(): Constraint.Ast | undefined {
            const { token } = tokens;

            if (!token) {
                return;
            }

            switch (token.type) {
                case "desc":
                    tokens.next();
                    return { desc: true };

                case "all":
                    tokens.next();
                    return {};

                case "min":
                case "max":
                    tokens.next();
                    return parseSingleBound(token.type);

                case "in":
                    tokens.next();
                    if (tokens.token?.type === "word") {
                        const name = tokens.token.value;
                        tokens.next();
                        return { in: FieldValue.Reference(name) };
                    }
                    constraint.error("MISSING_IN_FIELD", 'Expected field name to follow "in"');
                    break;
            }

            const value = parseExpression();

            if (value === undefined || tokens.token?.type !== "to") {
                return { value };
            }

            tokens.next();

            const max = parseExpression();
            if (max === undefined) {
                constraint.error("MISSING_UPPER_BOUND", `"to" must be followed by upper boundary value`);
                return;
            }

            return {
                min: value,
                max,
            };
        }

        function parseSingleBound(kind: "min" | "max"): Constraint.Ast | undefined {
            const bound = parseExpression();
            if (bound === undefined) {
                constraint.error("MISSING_SINGLE_BOUND", `"${kind}" must be followed by boundary value`);
                return;
            }
            return { [kind]: bound };
        }

        function parseExpression(): Constraint.Expression | undefined {
            const value = parseValueExpression();

            if (value === undefined) {
                return value;
            }

            switch (tokens.token?.type) {
                case "+":
                case "-":
                    const type = tokens.token.type;
                    tokens.next();
                    const rhs = parseValueExpression();
                    if (rhs === undefined) {
                        constraint.error("MISSING_RIGHT_OPERAND", `Missing operand after "${type}"`);
                        return;
                    }

                    return {
                        type,
                        lhs: value,
                        rhs,
                    };

                case "(":
                    const args = Array<Constraint.Expression>();
                    tokens.next();

                    const functionName = FieldValue.referenced(value);
                    if (functionName === undefined) {
                        unexpected();
                        return;
                    }
                    if (!isFunction(functionName)) {
                        constraint.error("UNKNOWN_FUNCTION", `Unknown function "${functionName}"`);
                        return;
                    }

                    while ((tokens.token?.type as BasicToken.Operator) !== ")") {
                        const expr = parseValueExpression();
                        if (expr === undefined) {
                            return;
                        }
                        args.push(expr);
                        switch (tokens.token?.type as BasicToken.Operator) {
                            case ",":
                                tokens.next();
                                break;

                            case ")":
                                break;

                            default:
                                unexpected();
                                return;
                        }
                    }
                    tokens.next();
                    return {
                        type: functionName,
                        args,
                    };
            }

            return value;
        }

        function parseValueExpression(): Constraint.Expression | undefined {
            const { token } = tokens;

            if (token === undefined) {
                return;
            }

            switch (token.type) {
                case "value":
                    tokens.next();
                    return token.value;

                case "true":
                    tokens.next();
                    return true;

                case "false":
                    tokens.next();
                    return false;

                case "word":
                    const ref = FieldValue.Reference(camelize(token.value));
                    tokens.next();
                    return ref;

                case "-":
                case "+": {
                    tokens.next();

                    let number = tokens.token?.type === "value" ? tokens.token.value : undefined;

                    if (number !== undefined) {
                        tokens.next();

                        if (token.type === "-") {
                            if (typeof number === "number") {
                                number *= -1;
                            } else if (
                                FieldValue.is(number, FieldValue.percent) ||
                                FieldValue.is(number, FieldValue.celsius)
                            ) {
                                (number as FieldValue.Percent | FieldValue.Celsius).value *= -1;
                            } else {
                                number = undefined;
                            }
                        }
                    }

                    if (number === undefined) {
                        constraint.error("MISSING_NUMBER", `Unary "${token.type}" not followed by numeric value`);
                        return;
                    }

                    return number;
                }

                case "(": {
                    tokens.next();

                    const result = parseExpression();
                    if (tokens.token?.type !== ")") {
                        constraint.error("MISSING_GROUP_END", 'Group does not end with ")"');
                    }

                    tokens.next();

                    return result;
                }
            }
        }
    }
}
