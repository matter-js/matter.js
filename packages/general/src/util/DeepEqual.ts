/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * An object that supports custom deep equality.
 */
export interface DeepComparable {
    /**
     * Deep-compare this object to another.
     */
    [DeepComparable.equals](other: unknown): boolean;
}

export namespace DeepComparable {
    export const equals = Symbol("deepEquals");
}

// TODO - implement more efficient specialization for Array and ArrayBuffer
// TODO - currently will hang on self-referential data structures
export function isDeepEqual(a: unknown, b: unknown, ignoreUndefinedProperties = false): boolean {
    const aIsObject = typeof a === "object" && a !== null;
    if (aIsObject) {
        if (DeepComparable.equals in a) {
            return (a as DeepComparable)[DeepComparable.equals](b);
        }
    }

    const bIsObject = typeof b === "object" && b !== null;
    if (bIsObject) {
        if (DeepComparable.equals in b) {
            return (b as DeepComparable)[DeepComparable.equals](a);
        }
    }

    if (!aIsObject || !bIsObject) {
        return a === b;
    }

    // Create arrays of property names
    const aProps = Object.getOwnPropertyNames(a);
    const bProps = Object.getOwnPropertyNames(b);

    // If number of properties is different, objects are not equivalent
    if (aProps.length !== bProps.length && !ignoreUndefinedProperties) {
        return false;
    }

    for (let i = 0; i < aProps.length; i++) {
        const propName = aProps[i];

        const aprop = (a as Record<string, unknown>)[propName];
        const bprop = (b as Record<string, unknown>)[propName];

        if (typeof aprop !== typeof bprop) {
            return false;
        }
        if (typeof aprop === "object") {
            if (!isDeepEqual(aprop, bprop)) {
                return false;
            }
        } else {
            // If values of same property are not equal, objects are not equivalent
            if (aprop !== bprop) {
                return false;
            }
        }
    }

    // If we made it this far, objects are considered equal
    return true;
}
