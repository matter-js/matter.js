/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thrown from terminal methods when process exits with an error code.
 */
export class NonZeroExitError extends Error {
    constructor(
        readonly code: number,
        message?: string,
    ) {
        if (message) {
            message = `: ${message}`;
        } else {
            message = "";
        }
        super(`Process exited with error code ${code}${message}`);
    }
}

/**
 * Thrown when Docker API reports an error.
 */
export class DockerError extends Error {
    constructor(
        message: string,
        readonly code: number,
        readonly textCode: string,
    ) {
        super(message);
    }

    static accept(error: any, ...codes: number[]) {
        if (!(error instanceof DockerError) || !codes.includes(error.code)) {
            throw error;
        }
    }
}

export namespace DockerError {
    export function adapt<T>(source: Promise<T>): Promise<T> {
        return source.catch(e => {
            throw translate(e);
        });
    }

    export function translate(error: unknown): Error {
        if (!(error instanceof Error)) {
            return new Error(`${error}`);
        }
        const parsed = error.message.match(/^\(HTTP code (\d+)\) ([^-]+) - (.*)$/);
        if (parsed === null) {
            return error;
        }
        const [, status, textCode, message] = parsed;
        let text = message.trim();
        if (text === "") {
            text = textCode;
        }
        return new DockerError(`${text} (${status})`, Number.parseInt(status), textCode.replace(" ", "-"));
    }
}
