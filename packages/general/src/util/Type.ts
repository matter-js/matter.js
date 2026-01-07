/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type Properties = { [key: string]: any };

/** Merges two types into one. */
export type Merge<A extends Properties, B extends Properties> = {
    [K in keyof A as K extends keyof B ? never : K]: A[K];
} & B;

export function Merge<A extends Properties, B extends Properties>(a: A, b: B): Merge<A, B> {
    return { ...a, ...b };
}

/** Type that represents a class constructor of a defined type or extend of it */
export type ClassExtends<C> = { new (...args: any[]): C };

/** Merge an array of objects into one.  Currently assumes unique elements */
export type MergeAll<T> = T extends [infer O extends Properties | undefined, ...infer R]
    ? O extends undefined
        ? MergeAll<R>
        : O & MergeAll<R>
    : T extends []
      ? {}
      : never;

export function MergeAll<T extends (Properties | undefined)[]>(...objects: readonly [...T]): MergeAll<T> {
    return Object.assign({}, ...objects);
}

/** Pluck an item from an array of objects if present */
export type Pluck<K, T extends readonly [...any]> = T extends [infer O, ...infer R]
    ? K extends keyof O
        ? [O[K], ...Pluck<K, R>]
        : Pluck<K, R>
    : T extends []
      ? T
      : never;

export function Pluck<T extends Properties[], K extends keyof T[number]>(
    key: K,
    ...objects: readonly [...T]
): Pluck<K, T> {
    return objects.map(o => (o as any)[key]).filter(o => o !== undefined) as any;
}

/** Same as "a == undefined" but keeps the kids happy */
export function isNullish(a: any) {
    return a === undefined || a === null;
}

export type MakeMandatory<T> = Exclude<T, undefined>;

/** Create a branded type */
declare const __brand: unique symbol;
// Don't think it should be necessary to export Brand<B> but it will cause
// the following error under some circumstances:
//
//   Exported variable 'XXX' has or is using name '__brand' from external
//   module "../src/util/Type" but cannot be named.ts(4023)
//
// Specifically this occurs with the reference to Cluster.id in the "complete"
// cluster definitions
export type Brand<B> = { [__brand]: B };
export type Branded<T, B> = T & Brand<B>;

/**
 * Make a type immutable.
 *
 * TODO - might need to extend depending type (e.g. doesn't handle Maps, Sets or Promises yet)
 *
 * Good reference implementation here:
 *
 *     https://github.com/ts-essentials/ts-essentials/blob/master/lib/deep-readonly/index.ts
 */
export type Immutable<T> = T extends (...args: any[]) => any
    ? T
    : T extends number // Necessary for our "branded" IDs
      ? T
      : T extends bigint
        ? T
        : T extends object
          ? { readonly [K in keyof T]: Immutable<T[K]> }
          : T;

export type Mutable<T> = T extends (...args: any[]) => any
    ? T
    : T extends number // Necessary for our "branded" IDs
      ? T
      : T extends bigint
        ? T
        : T extends object
          ? { -readonly [K in keyof T]: Mutable<T[K]> }
          : T;

export function Mutable<T>(value: Immutable<T>): Mutable<T> {
    return value as Mutable<T>;
}

/**
 * Convert a union to an interface.
 *
 * @see {@link https://stackoverflow.com/questions/50374908}
 */
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/**
 * An identity type.
 *
 * You can't do:
 *
 *     interface Foo extends typeof Bar {}
 *
 * But you can do:
 *
 *     interface Foo extends Identity<typeof Bar> {}
 *
 * Without this type you'd have to do:
 *
 *     interface FooType = typeof Bar;
 *     interface Foo extends FooType {};
 *
 * We have to do this a lot because we generate complex objects with detailed
 * type information.  When exported, TS (as of 5.2) inlines the type of these
 * objects in declarations which makes our declarations massive.  To avoid this
 * we create an interface from the type then cast to the interface for export.
 */
export type Identity<T> = T;

/**
 * Tests whether the given variable is a real object and not an Array
 * @param it The variable to test
 * @returns true if it is Record<string, any>
 */
export function isObject(it: unknown): it is Record<string, unknown> {
    // This is necessary because:
    // typeof null === 'object'
    // typeof [] === 'object'
    // [] instanceof Object === true
    return Object.prototype.toString.call(it) === "[object Object]"; // this code is 25% faster than below one
    // return it && typeof it === 'object' && !(it instanceof Array);
}
