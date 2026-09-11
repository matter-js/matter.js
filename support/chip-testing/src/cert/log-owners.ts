/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, InternalError } from "@matter/main";
import { LineQueue } from "@matter/testing";

/**
 * Which kind of participant owns a log line, so a destination writes only its own.
 */
export type LogOwnerKind = "device" | "adapter";

/**
 * What a destination does with a message.
 *
 * `foreign` and `unowned` differ: a foreign line belongs to another destination and is already accounted for, while an
 * unowned line has nobody to write it and must still reach the fallback, or a crash reported through the logger
 * disappears.
 */
export type LogRouting = "claimed" | "foreign" | "unowned";

interface Registration {
    kind: LogOwnerKind;
    queue: LineQueue;
}

/**
 * Weak so an owner that is never unregistered — a device whose `initialize()` threw, a run abandoned mid-test — cannot
 * pin its environment graph for the process lifetime.
 */
const registrations = new WeakMap<Diagnostic.Owner, Registration>();

/**
 * Claim every log message `owner` emits for {@link queue}, until the returned function is called.
 *
 * matter.js stamps each message with the environment of the component that wrote it, so a line reaches the right log
 * even when it comes from a socket or timer callback, where no call stack identifies the node.
 */
export function registerLogOwner(owner: Diagnostic.Owner, kind: LogOwnerKind, queue: LineQueue) {
    const existing = registrations.get(owner);
    if (existing !== undefined) {
        throw new InternalError(
            `Log owner "${owner.name}" is already registered as a ${existing.kind}; two owners sharing one ` +
                "environment would misattribute each other's logs",
        );
    }

    const registration: Registration = { kind, queue };
    registrations.set(owner, registration);

    return () => {
        // Only our own registration: a later owner of the same environment keeps its routing
        if (registrations.get(owner) === registration) {
            registrations.delete(owner);
        }
    };
}

/**
 * Write `text` to the log its message belongs to.
 *
 * A node builds services in child environments, so this searches the message owner's ancestors as well.
 */
export function routeOwnedLine(message: Diagnostic.Message, kind: LogOwnerKind, text: string): LogRouting {
    for (let owner = message.owner; owner !== undefined; owner = owner.parent) {
        const registration = registrations.get(owner);
        if (registration === undefined) {
            continue;
        }
        if (registration.kind !== kind) {
            return "foreign";
        }
        registration.queue.push(text);
        return "claimed";
    }

    return "unowned";
}
