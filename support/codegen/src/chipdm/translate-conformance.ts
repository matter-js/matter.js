/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance, FieldValue } from "#model";
import { DataModelSyntaxError } from "./errors.js";
import { translateValue } from "./values.js";
import { children, num, str, value } from "./xml.js";

const FLAGS: Record<string, Conformance.Ast["type"]> = {
    mandatoryConform: Conformance.Flag.Mandatory,
    optionalConform: Conformance.Flag.Optional,
    provisionalConform: Conformance.Flag.Provisional,
    deprecateConform: Conformance.Flag.Deprecated,
    disallowConform: Conformance.Flag.Disallowed,
    describedConform: Conformance.Special.Desc,
};

const BINARY_OPERATORS: Record<string, Conformance.Operator> = {
    andTerm: Conformance.Operator.AND,
    orTerm: Conformance.Operator.OR,
    equalTerm: Conformance.Operator.EQ,
    notEqualTerm: Conformance.Operator.NE,
    greaterTerm: Conformance.Operator.GT,
    greaterOrEqualTerm: Conformance.Operator.GTE,
    lessTerm: Conformance.Operator.LT,
    lessOrEqualTerm: Conformance.Operator.LTE,
};

/** Elements CHIP uses to express conformance of the element they appear in */
export const CONFORMANCE_TAGS = [...Object.keys(FLAGS), "otherwiseConform"];

/**
 * Translate the conformance of a CHIP data model element.
 *
 * Returns undefined if CHIP defines no conformance, which is not the same as empty conformance.
 */
export function translateConformance(node: Element) {
    const definitions = children(node, ...CONFORMANCE_TAGS);
    if (!definitions.length) {
        return;
    }
    if (definitions.length > 1) {
        throw new DataModelSyntaxError(`<${node.tagName}> has ${definitions.length} conformance definitions`);
    }

    return new Conformance({ ast: astOf(definitions[0]) });
}

function astOf(node: Element): Conformance.Ast {
    if (node.tagName === "otherwiseConform") {
        return {
            type: Conformance.Special.Otherwise,
            param: children(node).map(astOf),
        };
    }

    const flag = FLAGS[node.tagName];
    if (flag === undefined) {
        throw new DataModelSyntaxError(`Unsupported conformance element <${node.tagName}>`);
    }

    const expressions = children(node);
    if (expressions.length > 1) {
        throw new DataModelSyntaxError(`<${node.tagName}> has ${expressions.length} expressions`);
    }

    let ast: Conformance.Ast;
    if (expressions.length === 0) {
        ast = { type: flag } as Conformance.Ast;
    } else if (flag === Conformance.Flag.Mandatory) {
        // Conditional mandatory conformance is the bare expression
        ast = expressionOf(expressions[0]);
    } else if (flag === Conformance.Flag.Optional) {
        ast = { type: Conformance.Special.OptionalIf, param: expressionOf(expressions[0]) };
    } else {
        throw new DataModelSyntaxError(`<${node.tagName}> does not support a conditional expression`);
    }

    return withChoice(node, ast);
}

function withChoice(node: Element, ast: Conformance.Ast): Conformance.Ast {
    const name = str(node, "choice");
    if (name === undefined) {
        return ast;
    }

    const min = num(node, "min");
    const max = num(node, "max");

    // Our conformance states a count with an "or more" or "or less" qualifier, so a range of two different counts has
    // no equivalent
    if (min !== undefined && max !== undefined && min !== max) {
        throw new DataModelSyntaxError(`Choice ${name} states both a minimum of ${min} and a maximum of ${max}`);
    }

    return {
        type: Conformance.Special.Choice,
        param: {
            name: name as Conformance.ChoiceName,
            num: min ?? max ?? 1,
            orMore: str(node, "more") === "true" || undefined,
            orLess: max === undefined || max === min ? undefined : true,
            expr: ast,
        },
    };
}

function expressionOf(node: Element): Conformance.Ast {
    const revision = revisionOf(node);
    if (revision !== undefined) {
        return revision;
    }

    const operator = BINARY_OPERATORS[node.tagName];
    if (operator !== undefined) {
        const operands = children(node).map(expressionOf);
        if (operands.length < 2) {
            throw new DataModelSyntaxError(`<${node.tagName}> has ${operands.length} operands`);
        }
        return operands.reduce((lhs, rhs) => ({ type: operator, param: { lhs, rhs } }) as Conformance.Ast);
    }

    switch (node.tagName) {
        case "notTerm": {
            const operands = children(node);
            if (operands.length !== 1) {
                throw new DataModelSyntaxError(`<notTerm> has ${operands.length} operands`);
            }
            return { type: Conformance.Operator.NOT, param: expressionOf(operands[0]) };
        }

        case "feature":
        case "attribute":
        case "command":
        case "event":
        case "field":
        case "cluster":
        case "condition":
        case "deviceType":
            return { type: Conformance.Special.Name, param: nameOf(node) };

        case "status":
            // A reference to a status enum value such as SUCCESS
            return { type: Conformance.Special.Name, param: statusNameOf(nameOf(node)) };

        case "enum":
            // The name of an enum reference is the type; the value names the entry
            return { type: Conformance.Special.Name, param: valueNameOf(node) };

        case "literal":
        case "number":
        case "value":
            // A named value references an enum entry rather than stating a literal
            if (str(node, "name") !== undefined) {
                return { type: Conformance.Special.Name, param: nameOf(node) };
            }
            return { type: Conformance.Special.Value, param: valueOf(node) };

        default:
            throw new DataModelSyntaxError(`Unsupported conformance expression element <${node.tagName}>`);
    }
}

/**
 * Recognize conformance on the cluster revision, which CHIP writes as a comparison of the current revision against a
 * literal and we model as a dedicated node.
 */
function revisionOf(node: Element): Conformance.Ast | undefined {
    if (node.tagName !== "greaterOrEqualTerm") {
        return;
    }

    const operands = children(node);
    if (operands.length !== 2 || operands.some(operand => operand.tagName !== "revision")) {
        return;
    }

    if (str(operands[0], "value") !== "current") {
        throw new DataModelSyntaxError(`Unsupported revision comparison against "${str(operands[0], "value")}"`);
    }

    const revision = num(operands[1], "value");
    if (revision === undefined) {
        throw new DataModelSyntaxError("Revision conformance without a revision");
    }

    return { type: Conformance.Special.Revision, param: revision };
}

function nameOf(node: Element) {
    const name = str(node, "name") ?? str(node, "code");
    if (name === undefined) {
        throw new DataModelSyntaxError(`<${node.tagName}> in conformance has no name`);
    }
    return name;
}

function statusNameOf(name: string) {
    return name
        .split("_")
        .map(part => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
        .join("");
}

function valueNameOf(node: Element) {
    const name = str(node, "value");
    if (name === undefined) {
        throw new DataModelSyntaxError(`<${node.tagName}> in conformance has no value`);
    }
    return name;
}

function valueOf(node: Element): FieldValue {
    const text = value(node);
    if (text === undefined) {
        throw new DataModelSyntaxError(`<${node.tagName}> in conformance has no value`);
    }
    return translateValue(text);
}
