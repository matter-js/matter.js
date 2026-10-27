/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status } from "#globals/Status.js";
import { MatterError, capitalize, decamelize } from "@matter/general";

/**
 * Base class for errors that should produce protocol-facing status codes.
 *
 * A status the peer sent is a {@link ReceivedStatusResponseError} and has {@link received} set.  Each received class
 * extends the local class for the same status, so a check for the local class also matches the received one.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.10
 */
export class StatusResponseError extends MatterError {
    public constructor(
        message: string,
        public readonly code: Status,
        public readonly clusterCode?: number,
    ) {
        super(message);
    }

    /**
     * True if the peer sent this status, false if matter.js produced it.
     */
    get received(): boolean {
        return false;
    }

    get bareMessage() {
        return this.message.replace(/ \(code .+\)$/, "");
    }

    static is(error: unknown, ...codes: Status[]) {
        const sre = this.of(error);
        return !!sre && (!codes.length || codes.includes(sre.code));
    }

    /**
     * The status id for an error of a class that stands for a status, so local and received errors and errors built
     * with {@link create} or a constructor share it.  A subclass with an identity of its own keeps its class id.
     */
    override get id() {
        if (statusClasses.has(this.constructor)) {
            return StatusResponseError.idOf(this.code);
        }
        return super.id;
    }

    /**
     * The id of a {@link Status}: its name in kebab case, for example "constraint-error", or "unknown-<code>" for a
     * code {@link Status} does not name.
     *
     * The static `id` of a class follows its class name, not its status.  Code that needs the id of an error uses the
     * instance `id`.
     */
    static idOf(code: Status): string {
        const name = Status[code];
        return name === undefined ? `unknown-${code}` : decamelize(name);
    }

    /**
     * Create the {@link StatusResponse} specialization for a status matter.js produced itself.
     */
    static create(code: Status, message?: string, clusterCode?: number): StatusResponseError {
        const type = local.index.get(code);

        if (type) {
            return new type(message, clusterCode);
        }

        return new UnknownStatusResponseError(unknownStatusMessage(message, code, clusterCode), code, clusterCode);
    }
}

/**
 * Used for errors that have an unknown {@link Status} code.
 */
export class UnknownStatusResponseError extends StatusResponseError {}

/**
 * A status the peer sent.
 *
 * Received errors extend the local class for their status ({@link ReceivedStatusResponse.NotFoundError} is a
 * {@link StatusResponse.NotFoundError}), so this class cannot be their common base.  `instanceof
 * ReceivedStatusResponseError` therefore tests {@link StatusResponseError.received}.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.10
 */
export class ReceivedStatusResponseError extends StatusResponseError {
    override get received(): true {
        return true;
    }

    static override [Symbol.hasInstance]<T>(this: { prototype: T }, value: unknown): value is T {
        // A subclass inherits this method but must keep the regular prototype check
        if (this.prototype !== ReceivedStatusResponseError.prototype) {
            return Function.prototype[Symbol.hasInstance].call(this, value);
        }
        return value instanceof StatusResponseError && value.received;
    }

    /**
     * Create the {@link ReceivedStatusResponse} specialization for a status the peer sent.
     */
    static override create(code: Status, message?: string, clusterCode?: number): ReceivedStatusResponseError {
        const type = received.index.get(code);

        if (type) {
            return new type(message, clusterCode);
        }

        return new ReceivedUnknownStatusResponseError(
            unknownStatusMessage(message, code, clusterCode),
            code,
            clusterCode,
        );
    }
}

class ReceivedUnknownStatusResponseError extends UnknownStatusResponseError {
    override get received(): true {
        return true;
    }
}

const statusClasses = new WeakSet<Function>([
    StatusResponseError,
    ReceivedStatusResponseError,
    UnknownStatusResponseError,
    ReceivedUnknownStatusResponseError,
]);

export namespace StatusResponseError {
    /**
     * Constructor of a per-status specialization in {@link StatusResponse} or {@link ReceivedStatusResponse}.
     */
    export type Specialization<T extends StatusResponseError = StatusResponseError> = new (
        message?: string,
        clusterCode?: number,
    ) => T;

    /**
     * One specialization per standard {@link Status} code, keyed by the status name with an "Error" suffix.
     */
    export type Specializations<T extends StatusResponseError = StatusResponseError> = Record<
        `${keyof typeof Status}Error`,
        Specialization<T>
    >;
}

function messageWithCode(message: string, code: Status, clusterCode: number | undefined) {
    let codeStr = `code ${code}`;
    if (clusterCode !== undefined) {
        codeStr = `${codeStr}; cluster code ${clusterCode}`;
    }
    return `${message} (${codeStr})`;
}

function unknownStatusMessage(message: string | undefined, code: Status, clusterCode: number | undefined) {
    return messageWithCode(message ?? "Unknown status response", code, clusterCode);
}

interface Family<T extends StatusResponseError> {
    index: Map<Status, StatusResponseError.Specialization<T>>;
    record: StatusResponseError.Specializations<T>;
}

function familyOf<T extends StatusResponseError>(
    members: { name: string; code: Status; type: StatusResponseError.Specialization<T> }[],
): Family<T> {
    return {
        index: new Map(members.map(({ code, type }) => [code, type])),
        record: Object.fromEntries(
            members.map(({ name, type }) => [`${name}Error`, type]),
        ) as StatusResponseError.Specializations<T>,
    };
}

function localSpecializationOf(name: string, code: Status): StatusResponseError.Specialization {
    const { [name]: type } = {
        [name]: class extends StatusResponseError {
            constructor(message?: string, clusterCode?: number) {
                super(
                    messageWithCode(message ?? capitalize(decamelize(name, " ")), code, clusterCode),
                    code,
                    clusterCode,
                );
            }
        },
    };
    Object.defineProperty(type, "name", { value: name });
    statusClasses.add(type);
    return type;
}

function receivedSpecializationOf(
    name: string,
    base: StatusResponseError.Specialization,
): StatusResponseError.Specialization<ReceivedStatusResponseError> {
    const type = class extends base {
        override get received(): true {
            return true;
        }
    };
    Object.defineProperty(type, "name", { value: `Received${name}` });
    statusClasses.add(type);
    return type;
}

const localMembers = Object.entries(Status).flatMap(([name, code]) =>
    typeof code === "number" ? [{ name, code, type: localSpecializationOf(name, code) }] : [],
);

const local = familyOf(localMembers);

const received = familyOf(
    localMembers.map(member => ({ ...member, type: receivedSpecializationOf(member.name, member.type) })),
);

/**
 * A specialized {@link StatusResponseError} class for each standard {@link Status} code.
 */
export const StatusResponse = local.record;

/**
 * A specialized {@link ReceivedStatusResponseError} class for each standard {@link Status} code.  Each one extends the
 * {@link StatusResponse} class for the same status.
 *
 * @see {@link MatterSpecification.v161.Core} § 8.10
 */
export const ReceivedStatusResponse = received.record;
