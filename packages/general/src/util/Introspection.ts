/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilities for object introspection.
 */
export namespace Introspection {
    /**
     * Obtain a {@link PropertyDescriptor} from any level in {@link subject}'s
     * prototype chain.
     */
    export function propertyDescriptorOf(subject: object, name: string): PropertyDescriptor | undefined {
        const descriptor = Reflect.getOwnPropertyDescriptor(subject, name);
        if (descriptor) {
            return descriptor;
        }
        const prototype = Reflect.getPrototypeOf(subject);
        if (prototype !== null) {
            return Introspection.propertyDescriptorOf(prototype, name);
        }
    }

    /**
     * Obtain {@link PropertyDescriptor}s from properties in any level of
     * {@link subject}'s prototype chain.
     */
    export function propertyDescriptorsOf(subject: object) {
        const descriptors = {} as Record<string, PropertyDescriptor>;

        function addDescriptors(subject: object) {
            const localDescriptors = Object.getOwnPropertyDescriptors(subject);

            for (const name in localDescriptors) {
                if (descriptors[name] === undefined) {
                    descriptors[name] = localDescriptors[name];
                }
            }

            const prototype = Reflect.getPrototypeOf(subject);
            if (prototype !== null) {
                addDescriptors(prototype);
            }
        }

        addDescriptors(subject);

        return descriptors;
    }

    /**
     * Determine whether a single property of {@link subject} is readable
     * and/or writable.
     */
    export function propertyAccessibilityOf(subject: object, name: string) {
        const pd = propertyDescriptorOf(subject, name);
        if (pd) {
            return propertyDescriptorToAccessibility(pd);
        }
        return { readable: true, writable: true };
    }

    /**
     * Obtain properties from {@link subject} and whether they're readable
     * and/or writable.
     */
    export function objectAccessibilityOf(subject: object) {
        const accessibilty = {} as ObjectAccessibilty;

        const propertyDescriptors = Introspection.propertyDescriptorsOf(subject);
        for (const name in propertyDescriptors) {
            accessibilty[name] = propertyDescriptorToAccessibility(propertyDescriptors[name]);
        }

        return accessibilty;
    }

    export function propertyDescriptorToAccessibility(pd: PropertyDescriptor): PropertyAccessibility {
        return {
            readable: !!(pd.set && !pd.get),
            writable: !!(pd.set || pd.writable),
        };
    }

    export interface PropertyAccessibility {
        readable: boolean;
        writable: boolean;
    }

    export interface ObjectAccessibilty extends Record<string, PropertyAccessibility> {}
}
