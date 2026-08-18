/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError } from "#general";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { DataModelSyntaxError } from "./errors.js";

/**
 * An element of a CHIP data model document.
 *
 * We parse with a standalone XML parser rather than a DOM implementation because the latter requires a newer Node
 * than we support.
 */
export type XmlElement = Element;

const ELEMENT_NODE = 1;

export function parseXml(text: string, filename: string) {
    let document;
    try {
        document = new DOMParser({ onError: () => {} }).parseFromString(text, "text/xml");
    } catch (cause) {
        throw new DataModelSyntaxError(`${filename}: ${asError(cause).message}`);
    }

    const root = document.documentElement;
    if (root === null) {
        throw new DataModelSyntaxError(`${filename}: no root element`);
    }

    return root;
}

export function children(node: XmlElement, ...names: string[]) {
    const result = new Array<XmlElement>();

    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (child.nodeType !== ELEMENT_NODE) {
            continue;
        }

        const element = child as XmlElement;
        if (!names.length || names.includes(element.tagName)) {
            result.push(element);
        }
    }

    return result;
}

export function child(node: XmlElement, ...names: string[]) {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (child.nodeType !== ELEMENT_NODE) {
            continue;
        }

        const element = child as XmlElement;
        if (names.includes(element.tagName)) {
            return element;
        }
    }
}

export function str(node: XmlElement, name: string) {
    const value = node.getAttribute(name);
    return value === null ? undefined : value;
}

export function num(node: XmlElement, name: string) {
    const value = node.getAttribute(name);
    if (value === null) {
        return undefined;
    }
    const result = Number(value);
    if (Number.isNaN(result)) {
        throw new DataModelSyntaxError(`<${node.tagName} ${name}="${value}"> is not numeric`);
    }
    return result;
}

/** Like {@link num} but ignores a non-numeric value, which CHIP uses where "code" names a feature */
export function maybeNum(node: XmlElement, name: string) {
    const value = node.getAttribute(name);
    if (value === null) {
        return undefined;
    }
    const result = Number(value);
    return Number.isNaN(result) ? undefined : result;
}

export function bool(node: XmlElement, name: string) {
    const value = node.getAttribute(name);
    if (value === null) {
        return undefined;
    }
    switch (value) {
        case "true":
            return true;
        case "false":
            return false;
        default:
            throw new DataModelSyntaxError(`<${node.tagName} ${name}="${value}"> is not boolean`);
    }
}

/** Content of a value-bearing element, either a `value` attribute or the element text. */
export function value(node: XmlElement) {
    const attribute = node.getAttribute("value");
    if (attribute !== null) {
        return attribute;
    }
    const text = node.textContent?.trim();
    return text === "" ? undefined : text;
}
