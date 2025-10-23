/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, InternalError } from "#general";
import { type Model } from "#models/Model.js";
import { type ValueModel } from "#models/ValueModel.js";
import { FeatureSet, FieldValue, Metatype } from "../common/index.js";
import { BasicToken, Lexer, TokenStream } from "../parser/index.js";
import { Aspect } from "./Aspect.js";

/**
 * An operational view of conformance as defined by the Matter Specification.
 *
 * We extend the specification's syntax to add ">", "<", ">=" and "<=".  These are required to encode some portions of
 * the specification that are described in prose.
 *
 * "Conformance" controls when a data field or cluster element is allowed or required.
 */
export class Conformance extends Aspect<Conformance.Definition> {
    ast: Conformance.Ast;

    get type() {
        return this.ast.type;
    }

    /**
     * Initialize from a Conformance.Definition or the conformance DSL defined by the Matter Specification.
     */
    constructor(definition: Conformance.Definition) {
        super(definition);

        if (definition === undefined) {
            this.ast = { type: Conformance.Special.Empty };
        } else {
            let ast: Conformance.Ast;
            if (typeof definition === "string") {
                ast = ParsedAst(this, definition);
            } else if (Array.isArray(definition)) {
                const asts = definition.map(def => ParsedAst(this, def));
                if (asts.length === 1) {
                    ast = asts[0];
                } else {
                    ast = {
                        type: Conformance.Special.Otherwise,
                        param: asts,
                    };
                }
            } else {
                ast = definition.ast;
            }
            this.ast = ast;
        }

        this.isEmpty = this.type === Conformance.Special.Empty;

        this.freeze();
    }

    override extend(other: Conformance) {
        return other.isEmpty ? this : other;
    }

    validateReferences(errorTarget: Conformance.ErrorTarget, lookup: Conformance.ReferenceResolver) {
        return Conformance.validateReferences(this, this.ast, errorTarget, lookup);
    }

    validateComputation(errorTarget: Conformance.ErrorTarget, featuresAvailable?: FeatureSet) {
        try {
            // This validation only confirms we can perform computation; we ignore the result
            this.applicabilityOf(featuresAvailable ?? new Set(), new Set());
        } catch (e) {
            errorTarget.error("CANNOT_COMPUTE_CONFORMANCE", `Error computing conformance: ${asError(e).message}`);
        }
    }

    /**
     * Is the associated element mandatory?
     *
     * This supports a limited subset of conformance and is only appropriate for field and requirement conformance.
     */
    get isMandatory() {
        const conformance = this.ast;
        if (conformance.type === Conformance.Flag.Mandatory) {
            return true;
        }
        if (conformance.type === Conformance.Special.Otherwise) {
            for (const c of conformance.param) {
                if (c.type === Conformance.Flag.Provisional) {
                    return false;
                }
                if (c.type === Conformance.Flag.Mandatory) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Perform limited conformance evaluation to determine whether this conformance is applicable given a feature
     * combination.
     *
     * This is useful for filtering elements at compile time.  For complete accuracy you then need to filter at runtime
     * once field values are known.
     */
    applicabilityOf(features: Iterable<string>, supportedFeatures: Iterable<string>) {
        const fset = features instanceof Set ? (features as Set<string>) : new Set(features);
        const sfset =
            supportedFeatures instanceof Set ? (supportedFeatures as Set<string>) : new Set(supportedFeatures);
        return computeApplicability(fset, sfset, this);
    }

    override toString() {
        return Conformance.serialize(this.ast);
    }

    protected override freeze() {
        freezeAst(this.ast);
        super.freeze();
    }
}

export namespace Conformance {
    export enum Applicability {
        None = 0,
        Optional = 1,
        Conditional = 2,
        Mandatory = 3,
    }

    export type AstParam =
        | Ast.Name
        | Ast.Value
        | Ast.Option
        // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
        | Ast.UnaryOperand
        | Ast.BinaryOperands
        | Ast.Otherwise
        | Ast.Choice;

    export type Ast =
        | {
              type: Special.Empty | Special.Desc | Flag;
          }
        | {
              type: Special.Name;
              param: Ast.Name;
          }
        | {
              type: Special.Value;
              param: Ast.Value;
          }
        | {
              type: Special.Choice;
              param: Ast.Choice;
          }
        | {
              type: Special.Otherwise;
              param: Ast.Otherwise;
          }
        | {
              type: Special.OptionalIf;
              param: Ast.Option;
          }
        | {
              type:
                  | Operator.AND
                  | Operator.OR
                  | Operator.XOR
                  | Operator.EQ
                  | Operator.NE
                  | Operator.LT
                  | Operator.GT
                  | Operator.LTE
                  | Operator.GTE;
              param: Ast.BinaryOperands;
          }
        | {
              type: Operator.NOT;
              param: Ast.UnaryOperand;
          };

    export namespace Ast {
        export type Name = string;
        export type Value = FieldValue;
        export type Option = Ast;
        export type UnaryOperand = Ast;
        export type BinaryOperands = {
            lhs: Ast;
            rhs: Ast;
        };
        export type Otherwise = Ast[];
        export type Choice = {
            name: ChoiceName;
            num: number;
            orMore?: boolean;
            orLess?: boolean;
            expr: Ast;
        };
    }

    export enum Special {
        Empty = "empty",
        Desc = "desc",
        Name = "name",
        Value = "value",
        Choice = "choice",
        Otherwise = "otherwise",
        OptionalIf = "optionalIf",
    }

    export enum Flag {
        Mandatory = "M",
        Optional = "O",
        Provisional = "P",
        Deprecated = "D",
        Disallowed = "X",
    }

    export enum Operator {
        NOT = "!",
        EQ = "==",
        NE = "!=",
        OR = "|",
        XOR = "^",
        AND = "&",
        DOT = ".",
        GT = ">",
        LT = "<",
        GTE = ">=",
        LTE = "<=",
    }

    export const M = Flag.Mandatory;
    export const O = Flag.Optional;
    export const P = Flag.Provisional;
    export const D = Flag.Deprecated;
    export const X = Flag.Disallowed;
    export const EQ = Operator.EQ;
    export const NE = Operator.NE;
    export const OR = Operator.OR;
    export const XOR = Operator.XOR;
    export const AND = Operator.AND;
    export const DOT = Operator.DOT;
    export const GT = Operator.GT;
    export const LT = Operator.LT;
    export const GTE = Operator.GTE;
    export const LTE = Operator.LTE;

    export type Name = string;

    export type Number = number;

    export type ChoiceName =
        | "a"
        | "b"
        | "c"
        | "d"
        | "e"
        | "f"
        | "g"
        | "h"
        | "i"
        | "j"
        | "k"
        | "l"
        | "m"
        | "n"
        | "o"
        | "p"
        | "q"
        | "r"
        | "s"
        | "t"
        | "u"
        | "v"
        | "w"
        | "x"
        | "y"
        | "z";

    export type ReferenceResolver = (name: string) => Model | undefined;
    export type ErrorTarget = { error(code: string, message: string): void };

    /**
     * Supported ways of expressing conformance (conceptually union should include Flag but that is covered by string).
     */
    export type Definition = string | string[] | { ast: Conformance.Ast } | undefined;

    // Serialize with parenthesis if necessary to make the expression atomic
    function serializeAtomic(ast: Ast, otherOperator?: Operator) {
        const serialized = serialize(ast);
        if (otherOperator !== undefined && isHigherPrecedence(otherOperator, ast.type)) {
            return `(${serialized})`;
        }
        return serialized;
    }

    export function validateReferences(
        conformance: Conformance,
        ast: Ast,
        errorTarget: ErrorTarget,
        resolver: ReferenceResolver,
    ) {
        switch (ast.type) {
            case Operator.OR:
            case Operator.XOR:
            case Operator.AND:
            case Operator.EQ:
            case Operator.NE:
            case Operator.GT:
            case Operator.LT:
            case Operator.GTE:
            case Operator.LTE:
                validateReferences(conformance, ast.param.lhs, errorTarget, resolver);

                // Special case for binary operators -- if LHS references an enum, RHS may reference enum values using
                // unqualified names
                let operatorResolver = resolver;
                if (ast.param.lhs.type === "name") {
                    const referenced = resolver(ast.param.lhs.param);
                    if ((referenced as ValueModel)?.effectiveMetatype === Metatype.enum) {
                        operatorResolver = (name: string) => {
                            const enumValue = (referenced as ValueModel).member(name);
                            if (enumValue) {
                                return enumValue as ValueModel;
                            }
                            return resolver(name);
                        };
                    }
                }

                validateReferences(conformance, ast.param.rhs, errorTarget, operatorResolver);
                break;

            case Operator.NOT:
                validateReferences(conformance, ast.param, errorTarget, resolver);
                break;

            case Special.Otherwise:
                for (const a of ast.param) {
                    validateReferences(conformance, a, errorTarget, resolver);
                }
                break;

            case Special.Name:
                if (!resolver(ast.param)) {
                    errorTarget.error(
                        `UNRESOLVED_CONFORMANCE_${ast.type.toUpperCase()}`,
                        `Conformance ${ast.type} reference "${ast.param}" does not resolve`,
                    );
                }
                break;
        }
    }

    export function serialize(ast: Ast): string {
        switch (ast.type) {
            case Operator.OR:
            case Operator.XOR:
            case Operator.AND:
            case Operator.EQ:
            case Operator.NE:
            case Operator.GT:
            case Operator.LT:
            case Operator.GTE:
            case Operator.LTE:
                const lhs = serializeAtomic(ast.param.lhs, ast.type);
                const rhs = serializeAtomic(ast.param.rhs, ast.type);
                return `${lhs} ${ast.type} ${rhs}`;

            case Operator.NOT:
                return `!${serializeAtomic(ast.param)}`;

            case Special.Empty:
                return "";

            case Special.Desc:
                return "desc";

            case Special.Choice:
                let result = `${serializeAtomic(ast.param.expr)}.${ast.param.name}`;
                if (ast.param.num > 1) {
                    result = `${result}${ast.param.num}`;
                }
                if (ast.param.orMore) {
                    if (!ast.param.orLess) {
                        result = `${result}+`;
                    }
                } else if (ast.param.orLess) {
                    result = `${result}-`;
                }
                return result;

            case Special.Otherwise:
                return ast.param.map(d => serialize(d)).join(", ");

            case Special.OptionalIf:
                return `[${serialize(ast.param)}]`;

            case Special.Name:
            case Special.Value:
                // Name or value
                return FieldValue.serialize(ast.param);

            default:
                // Flag
                return ast.type;
        }
    }

    export function isBinaryOperator(type: Ast["type"] | Operator): type is Operator {
        return Parser.BinaryOperators.has(type as any);
    }

    export function precedenceOf(operator: Ast["type"] | Operator) {
        const index = Parser.BinaryOperatorPrecedence.findIndex(ops => ops.indexOf(operator as any) != -1);
        return index === -1 ? undefined : index;
    }

    export function isHigherPrecedence(operator: Ast["type"] | Operator, other: Ast["type"] | Operator) {
        const precedence1 = precedenceOf(operator);
        if (precedence1 === undefined) {
            return false;
        }

        const precedence2 = precedenceOf(other);
        if (precedence2 === undefined) {
            return false;
        }

        return precedence1 < precedence2;
    }
}

const flags = new Set(Object.values(Conformance.Flag));

function ParsedAst(conformance: Conformance, definition: string): Conformance.Ast {
    definition = definition.replace(" or ", " | ");
    const tokens = TokenStream(Lexer.Basic.lex(definition, (code, message) => conformance.error(code, message)));

    const otherwise = [] as Conformance.Ast[];

    while (!tokens.done) {
        // Optional brackets are only allowed at top-level of expressions
        const optional = atOperator("[");

        if (optional) {
            tokens.next();
            let expr: Conformance.Ast = {
                type: Conformance.Special.OptionalIf,
                param: parseExpression(),
            };
            if (atOperator("]")) {
                tokens.next();
            } else {
                conformance.error("UNTERMINATED_CONFORMANCE_OPTIONAL", "Unterminated optional conformance group");
            }
            expr = parseChoice(expr);
            otherwise.push(expr);
        } else {
            const expr = parseExpression();
            if (expr) {
                otherwise.push(expr);
            }
        }

        // We allow "," or whitespace as separator; whitespace because spec specifies "top-to-bottom" which presumably
        // means newline
        if (atOperator(",")) {
            tokens.next();
        }
    }

    if (otherwise.length === 1) {
        return otherwise[0];
    }

    return {
        type: Conformance.Special.Otherwise,
        param: otherwise,
    };

    function atOperator(operator: BasicToken.Operator) {
        const { token } = tokens;
        return token && token.type === operator;
    }

    function parseExpression() {
        const elements = [] as (BasicToken.Operator | Conformance.Ast | string)[];

        // Collect binary expressions into an array so we can back up and
        // apply operator precedence
        let expr = parseAtomicExpression();
        if (expr) {
            elements.push(expr);
        }
        while (tokens.token && Parser.BinaryOperators.has(tokens.token.type)) {
            elements.push(tokens.token.type);
            tokens.next();
            expr = parseAtomicExpression();
            if (expr) {
                elements.push(expr);
            }
        }

        // Convert binary operators into AST nodes in order of precedence
        Parser.BinaryOperatorPrecedence.forEach(operators => {
            for (let i = 0; i < elements.length; i++) {
                if (operators.indexOf(elements[i + 1] as BasicToken.Operator) !== -1) {
                    const [lhs, op, rhs] = elements.splice(i, 3);
                    elements.splice(i, 0, {
                        type: op,
                        param: { lhs, rhs },
                    } as Conformance.Ast);
                    i--;
                }
            }
        });

        return elements[0] as Conformance.Ast;
    }

    function extractChoiceNameAndNumber(text: string): { name: Conformance.ChoiceName; num: number } {
        let name = text[0];
        let num;
        if (name[0] < "a" || name[0] > "z") {
            conformance.error("INVALID_CHOICE", "Choice indicator is not a lowercase letter");
            name = "?";
            num = 1;
        } else if (text.length > 1) {
            num = Number.parseInt(text[1]);
            if (!Number.isFinite(num) || num < 0 || num > 9) {
                conformance.error("INVALID_CHOICE", "Choice indicator may only be a single lowercase letter");
                name = "?";
                num = 1;
            } else if (name.length > 2) {
                conformance.error("INVALID_CHOICE", "Choice number followed by unexpected word characters");
                name = "?";
            }
        } else {
            num = 1;
        }

        return { name: name as Conformance.ChoiceName, num };
    }

    function parseChoice(expr: Conformance.Ast): Conformance.Ast {
        if (!atOperator(".")) {
            return expr;
        }

        tokens.next();

        let name, num;
        if (tokens.token?.type !== "word") {
            conformance.error("INVALID_CHOICE", 'Choice indicator (".") not followed by identifier');
            name = "?" as Conformance.ChoiceName;
            num = 1;
        } else {
            ({ name, num } = extractChoiceNameAndNumber(tokens.token.value));
            tokens.next();
        }

        const choice: Conformance.Ast.Choice = { name, expr, num };
        if (atOperator("+")) {
            choice.orMore = true;
            tokens.next();
        }
        if (atOperator("-")) {
            choice.orLess = true;
            tokens.next();
        }

        return {
            type: Conformance.Special.Choice,
            param: choice,
        };
    }

    function parseAtomicExpression(): Conformance.Ast | undefined {
        const expr = parseAtomicExpressionWithoutChoice();
        if (!expr) {
            return;
        }

        return parseChoice(expr);
    }

    function parseAtomicExpressionWithoutChoice(): Conformance.Ast | undefined {
        if (!tokens.token) {
            conformance.error("PREMATURE_CONFORMANCE_TERMINATION", "Terminated with expression expected");
            return;
        }

        if (tokens.token.type === "word") {
            const name = tokens.token.value;
            tokens.next();

            if (flags.has(name as Conformance.Flag)) {
                return { type: name as Conformance.Flag };
            }

            if (name.toLowerCase() === "desc") {
                return { type: Conformance.Special.Desc };
            }

            if (name.toLowerCase() === "null") {
                return { type: Conformance.Special.Value, param: null };
            }

            return { type: Conformance.Special.Name, param: name };
        }

        if (tokens.token.type === "value") {
            const value = tokens.token.value;
            tokens.next();
            return { type: Conformance.Special.Value, param: value };
        }

        if (atOperator("!")) {
            tokens.next();
            return { type: Conformance.Operator.NOT, param: parseAtomicExpression() as Conformance.Ast };
        }

        if (atOperator("(")) {
            tokens.next();
            const expr = parseExpression();
            if (atOperator(")")) {
                tokens.next();
            } else {
                conformance.error("UNTERMINATED_PARENTHETICAL_GROUP", `Unterminated parenthetical group`);
            }
            return expr;
        }

        conformance.error("UNEXPECTED_CONFORMANCE_TOKEN", `Unexpected "${tokens.token.type}"`);
        tokens.next();
    }
}

namespace Parser {
    // Highest precedence first
    export const BinaryOperatorPrecedence = [[">", "<", ">=", "<="], ["&"], ["|", "^"], ["==", "!="]];

    export const BinaryOperators = new Set(BinaryOperatorPrecedence.flat());
}

const operators = new Set<string>(Object.values(Conformance.Operator));

function computeApplicability(features: Set<string>, supportedFeatures: Set<string>, conformance: Conformance) {
    const { None, Optional, Conditional, Mandatory } = Conformance.Applicability;

    // Handle otherwise lists (must be at top level)
    const { ast } = conformance;
    if (ast.type === Conformance.Special.Otherwise) {
        let fallback = None;

        for (const node of ast.param) {
            switch (assessOuterExpression(node)) {
                case Conditional:
                    fallback = Conditional;
                    break;

                case Optional:
                    if (fallback !== Conditional) {
                        fallback = Optional;
                    }
                    break;

                case Mandatory:
                    return Mandatory;
            }
        }

        return fallback;
    }

    // Not grouped
    return assessOuterExpression(conformance.ast);

    function assessOuterExpression(ast: Conformance.Ast): Conformance.Applicability {
        // Handle optionality and other constructs which may only appear here
        switch (ast.type) {
            case Conformance.Special.Choice:
                // For these purposes we ignore choice conformance
                return assessOuterExpression(ast.param.expr);

            case Conformance.Flag.Optional:
            case Conformance.Special.Empty:
                return Optional;

            case Conformance.Special.OptionalIf:
                const applicability = assessInnerExpression(ast.param);
                if (applicability === Mandatory) {
                    return Optional;
                }
                return applicability;

            case Conformance.Flag.Disallowed:
            case Conformance.Flag.Deprecated:
            case Conformance.Flag.Provisional:
                return None;

            case Conformance.Flag.Mandatory:
                return Mandatory;

            case Conformance.Special.Desc:
                return Conditional;
        }

        return assessInnerExpression(ast);
    }

    function assessInnerExpression(ast: Conformance.Ast): Conformance.Applicability {
        switch (ast.type) {
            case Conformance.Special.Name:
                // Assess features based on configured flags
                if (features.has(ast.param)) {
                    return supportedFeatures.has(ast.param) ? Mandatory : None;
                }

                // This is a field name so test is indeterminate
                return Conditional;

            case Conformance.Operator.NOT:
                // Invert None/Mandatory, pass Conditional
                switch (assessInnerExpression(ast.param)) {
                    case None:
                        return Mandatory;

                    case Conditional:
                        return Conditional;

                    case Mandatory:
                        return None;
                }
                break;

            case Conformance.Operator.AND: {
                const lhs = assessInnerExpression(ast.param.lhs);
                const rhs = assessInnerExpression(ast.param.rhs);
                if (lhs === None || rhs === None) {
                    return None;
                }
                if (lhs === Conditional || rhs === Conditional) {
                    return Conditional;
                }
                return Mandatory;
            }

            case Conformance.Operator.OR: {
                const lhs = assessInnerExpression(ast.param.lhs);
                const rhs = assessInnerExpression(ast.param.rhs);
                if (lhs === None && rhs === None) {
                    return None;
                }
                if (lhs === Mandatory || rhs === Mandatory) {
                    return Mandatory;
                }
                break;
            }

            default:
                if (operators.has(ast.type)) {
                    return Optional;
                }
        }

        throw new InternalError(`Conformance ${conformance}: Invalid node type ${ast.type} in inner expression`);
    }
}

function freezeAst(ast: Conformance.Ast) {
    switch (ast.type) {
        case Conformance.Operator.OR:
        case Conformance.Operator.XOR:
        case Conformance.Operator.AND:
        case Conformance.Operator.EQ:
        case Conformance.Operator.NE:
        case Conformance.Operator.GT:
        case Conformance.Operator.LT:
        case Conformance.Operator.GTE:
        case Conformance.Operator.LTE:
            freezeAst(ast.param.lhs);
            freezeAst(ast.param.rhs);
            Object.freeze(ast.param);
            break;

        case Conformance.Operator.NOT:
        case Conformance.Special.OptionalIf:
            freezeAst(ast.param);
            break;

        case Conformance.Special.Value:
            if (typeof ast.param === "object" && ast.param !== null) {
                Object.freeze(ast.param);
            }
            break;

        case Conformance.Special.Choice:
            freezeAst(ast.param.expr);
            Object.freeze(ast.param);
            break;

        case Conformance.Special.Otherwise:
            for (const entry of ast.param) {
                freezeAst(entry);
            }
            Object.freeze(ast.param);
            break;
    }

    Object.freeze(ast);
}
