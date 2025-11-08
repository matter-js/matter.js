/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status } from "#globals/Status.js";
import { MatterError, capitalize, decamelize } from "@matter/general";

const specializationIndex = {} as Record<Status, new (message?: string, statusCode?: number) => StatusResponseError>;

/**
 * Base class for errors that should produce protocol-facing status codes.
 */
export class StatusResponseError extends MatterError {
    public constructor(
        message: string,
        public readonly code: Status,
        public readonly clusterCode?: number,
    ) {
        super(message);
    }

    get bareMessage() {
        return this.message.replace(/ \(code .+\)$/, "");
    }

    static is(error: unknown, ...codes: Status[]): error is StatusResponseError {
        return error instanceof StatusResponseError && (!codes.length || codes.includes(error.code));
    }

    override get id() {
        const id = super.id;

        if (id === "status-response") {
            const code = Status[this.code];
            if (code) {
                return decamelize(code);
            }
        }

        return id;
    }

    static create(code: Status, message?: string, clusterCode?: number) {
        const type = specializationIndex[code];

        if (type) {
            return new type(message, clusterCode);
        }

        throw new UnknownStatusResponseError(message ?? "Unknown status response", code, clusterCode);
    }
}

/**
 * Thrown for errors that have an unknown {@link Status} code.
 */
export class UnknownStatusResponseError extends StatusResponseError {}

/**
 * A specialized {@link StatusResponseError} class for each standard {@link Status} code.
 */
export const StatusResponse = Object.fromEntries(
    Object.entries(Status)
        .map(([name, code]) => {
            if (typeof code !== "number") {
                return undefined;
            }
            const ct = {
                [name]: class extends StatusResponseError {
                    constructor(message?: string, clusterCode?: number) {
                        if (message === undefined) {
                            message = capitalize(decamelize(name, " "));
                        }

                        super(message, code as Status, clusterCode);

                        let codeStr = `code ${code}`;
                        if (clusterCode !== undefined) {
                            codeStr = `${codeStr}; cluster code ${clusterCode}`;
                        }

                        this.message = `${message} (${codeStr})`;
                    }
                },
            } as const;
            const constructor = ct[name];
            Object.defineProperty(constructor, "name", { value: name });
            specializationIndex[code] = constructor;
            return [`${name}Error`, constructor];
        })
        .filter(e => e) as [string, new (message?: string, clusterCode?: number) => StatusResponseError][],
) as Record<`${keyof typeof Status}Error`, new (message?: string, clusterCode?: number) => StatusResponseError>;

/** Error class for Status response errors that were received from the other node. */
export class ReceivedStatusResponseError extends StatusResponseError {}
