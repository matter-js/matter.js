/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const inspect = Symbol.for("nodejs.util.inspect.custom");

/**
 * Customize object inspection using a Node.js-style inspector function.
 */
export function NodeJsStyleInspectable<T extends object>(target: T, inspector: NodeJsStyleInspectable.Inspector<T>) {
    const invokeInspector: NodeJsStyleInspectable.Inspector<T> = function (depth, options, inspect) {
        depth ??= 0;
        options ??= {};
        inspect ??= target => `${target}`;

        inspector.call(this, depth, options, inspect);
    };

    Object.defineProperty(target, inspect, {
        value: invokeInspector,
        enumerable: false,
        configurable: true,
        writable: true,
    });
}

export namespace NodeJsStyleInspectable {
    export interface Inspector<T extends object> {
        (this: T, depth: number, options: Options, inspect: (value: unknown, options?: Options) => string): unknown;
    }

    export interface Options extends Record<string, unknown> {
        color?: boolean;
    }
}
