/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppAddress, isDeepEqual } from "#general";

/**
 * A logical path in the API.
 */
export class ApiPath {
    #segments = Array<string>();

    /**
     * Create a new path from:
     *
     * * An {@link AppAddress#pathname}
     * * A text path, delimited with "/" with URL encoded segments
     * * An array of decoded segments
     *
     * Ignores path segments that are empty or ".".  ".." resolves up one level.
     *
     * So generally normal UNIX/URL semantics.
     */
    constructor(path: AppAddress | string | string[]) {
        if (path instanceof URL) {
            path = path.pathname;
        }

        if (!Array.isArray(path)) {
            path = path.split("/").map(decodeURIComponent);
        }

        for (const segment of path) {
            if (segment === "" || segment === ".") {
                continue;
            }

            if (segment === "..") {
                this.#segments.pop();
                continue;
            }

            this.#segments.push(segment);
        }
    }

    get isEmpty() {
        return !this.#segments.length;
    }

    [Symbol.iterator]() {
        return this.#segments[Symbol.iterator]();
    }

    slice(start?: number, end?: number) {
        return new ApiPath(this.#segments.slice(start, end));
    }

    at(path: AppAddress | string | string[]) {
        if (this.isEmpty) {
            return new ApiPath(path);
        }

        if (path instanceof URL) {
            path = path.pathname;
        }

        if (Array.isArray(path)) {
            path = path.map(encodeURIComponent).join("/");
        }

        if (path.startsWith("/")) {
            return new ApiPath(path);
        }

        // Note - parse combined path as a string so that ".." resolves relative to myself if necessary
        return new ApiPath(`${this.toString()}/${path}`);
    }

    toString() {
        return `${this.#segments.map(encodeURIComponent).join("/")}`;
    }

    includes(other: ApiPath) {
        return isDeepEqual(this.#segments, other.slice(0, this.#segments.length).#segments);
    }

    subpathFor(other: ApiPath) {
        if (!this.#segments.length) {
            return other;
        }

        if (!this.includes(other)) {
            return undefined;
        }

        return other.slice(this.#segments.length);
    }
}
