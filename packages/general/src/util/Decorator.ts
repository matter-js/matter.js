/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const isDecorator = Symbol("isDecorator");

/**
 * Mark a function as a decorator.
 */
export function Decorator<T extends Function>(decorate: T): T {
    (decorate as any)[isDecorator] = true;
    return decorate;
}

/**
 * A function that may act as a tc39 decorator.
 */
export type Decorator = Decorator.Class<any> | Decorator.Property<any, any>;

export namespace Decorator {
    /**
     * Determine if a function is marked as a decorator.
     */
    export function is(fn: Function): fn is Decorator {
        return !!(fn as any)[isDecorator];
    }

    export interface Class<T extends abstract new (...args: any) => any = abstract new (...args: any) => any> {
        (target: T, context: ClassDecoratorContext<T>): T | void;
    }

    export interface ClassMethod<
        This = unknown,
        T extends (this: This, ...args: any) => any = (this: This, ...args: any) => any,
    > {
        (target: T, context: ClassMethodDecoratorContext): T | void;
    }

    export interface ClassGetter<This = unknown, Value = unknown, T = (this: This, value: Value) => void> {
        (target: T, context: ClassGetterDecoratorContext<This, Value>): T | void;
    }

    export interface ClassSetter<This = unknown, Value = unknown, T = (this: This) => Value> {
        (target: T, context: ClassSetterDecoratorContext): T | void;
    }

    export interface ClassField<This = unknown, Value = unknown> {
        (target: undefined, context: ClassFieldDecoratorContext<This, Value>): ((initialValue: Value) => Value) | void;
    }

    export type ClassAccessor<This = unknown, Value = unknown> = {
        (
            target: ClassAccessorDecoratorTarget<This, Value>,
            context: ClassAccessorDecoratorContext<This, Value>,
        ): ClassAccessorDecoratorResult<{}, unknown>;
    };

    export type Property<This = unknown, Value = unknown> =
        | ClassGetter<This, Value>
        | ClassSetter<This, Value>
        | ClassField<This, Value>
        | ClassAccessor<This, Value>;

    export type PropertyContext<This = unknown, Value = unknown> =
        | ClassGetterDecoratorContext<This, Value>
        | ClassSetterDecoratorContext<This, Value>
        | ClassFieldDecoratorContext<This, Value>
        | ClassAccessorDecoratorContext<This, Value>;

    export interface ClassCollector {
        (target: NewableFunction, context: ClassDecoratorContext): void;
    }

    export interface MethodCollector {
        (target: CallableFunction, context: ClassMethodDecoratorContext<any, any>): void;
    }

    export interface PropertyCollector {
        (target: CallableFunction | undefined, context: PropertyContext<any, any>): void;
    }

    export interface Collector {
        (target: NewableFunction | CallableFunction | undefined, context: DecoratorContext): void;
    }
}
