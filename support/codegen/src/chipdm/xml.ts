/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSDOM } from "jsdom";
import { DataModelSyntaxError } from "./errors.js";

const parser = new new JSDOM("").window.DOMParser();

export function parseXml(text: string, filename: string) {
    const document = parser.parseFromString(text, "text/xml");

    const error = document.querySelector("parsererror");
    if (error) {
        throw new DataModelSyntaxError(`${filename}: ${error.textContent}`);
    }

    const root = document.documentElement;
    if (root === null) {
        throw new DataModelSyntaxError(`${filename}: no root element`);
    }

    return root;
}

export function children(node: Element, ...names: string[]) {
    const result = new Array<Element>();
    for (let element = node.firstElementChild; element !== null; element = element.nextElementSibling) {
        if (!names.length || names.includes(element.tagName)) {
            result.push(element);
        }
    }
    return result;
}

export function child(node: Element, ...names: string[]) {
    for (let element = node.firstElementChild; element !== null; element = element.nextElementSibling) {
        if (names.includes(element.tagName)) {
            return element;
        }
    }
}

export function str(node: Element, name: string) {
    const value = node.getAttribute(name);
    return value === null ? undefined : value;
}

export function num(node: Element, name: string) {
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
export function maybeNum(node: Element, name: string) {
    const value = node.getAttribute(name);
    if (value === null) {
        return undefined;
    }
    const result = Number(value);
    return Number.isNaN(result) ? undefined : result;
}

export function bool(node: Element, name: string) {
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
export function value(node: Element) {
    const attribute = node.getAttribute("value");
    if (attribute !== null) {
        return attribute;
    }
    const text = node.textContent?.trim();
    return text === "" ? undefined : text;
}
