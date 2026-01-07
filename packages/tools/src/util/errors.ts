/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

function notCode(code: string | string[], cause: any) {
    const causeCode = cause?.code;
    if (typeof code === "string") {
        return code !== causeCode;
    }
    return !code.includes(causeCode);
}

export async function ignoreError<T>(code: string | string[], fn: () => Promise<T>): Promise<T | undefined> {
    try {
        return await fn();
    } catch (e) {
        if (notCode(code, e)) {
            throw e;
        }
    }
}

export function ignoreErrorSync<T>(code: string | string[], fn: () => T): T | undefined {
    try {
        return fn();
    } catch (e) {
        if (notCode(code, e)) {
            throw e;
        }
    }
}
