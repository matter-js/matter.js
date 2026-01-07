/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type HandlerFunction = (...args: any[]) => any;

export class NamedHandler<H extends Record<keyof H, HandlerFunction>> {
    private handler: { action: keyof H; handler: H[keyof H] }[] = [];

    hasHandler<K extends keyof H>(action: K) {
        return this.handler.some(({ action: a }) => a === action);
    }

    addHandler<K extends keyof H>(action: K, handler: H[K]) {
        this.handler.push({ action, handler });
    }

    async executeHandler<K extends keyof H>(action: K, ...args: Parameters<H[K]>) {
        for (const { action: a, handler } of this.handler) {
            if (a === action) {
                return await handler(...args);
            }
        }
    }

    removeHandler<K extends keyof H>(action: K, handler: H[K]) {
        this.handler = this.handler.filter(({ action: a, handler: h }) => {
            return a !== action && h !== handler;
        });
    }
}

type ExtendPublicHandlerMethods<
    ParentClass extends new (...args: any[]) => any,
    H extends Record<keyof H, HandlerFunction>,
> = ParentClass extends new (...args: infer TArgs) => infer T
    ? new (...args: TArgs) => T & {
          addCommandHandler<K extends keyof H>(action: K, handler: H[K]): void;
          removeCommandHandler<K extends keyof H>(action: K, handler: H[K]): void;
          _executeHandler<K extends keyof H>(action: K, ...args: Parameters<H[K]>): Promise<void>;
      }
    : never;

export function extendPublicHandlerMethods<
    ParentClass extends new (...args: any[]) => any,
    H extends Record<keyof H, HandlerFunction>,
>(parentClass: ParentClass): ExtendPublicHandlerMethods<ParentClass, H> {
    // This is a type-level cheat
    return parentClass as any;
}
