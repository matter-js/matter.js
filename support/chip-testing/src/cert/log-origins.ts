/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, InternalError, LogDestination, LogFormat, LogLevel } from "@matter/main";
import { LineQueue } from "@matter/testing";

/**
 * Which kind of participant a log belongs to, so a destination writes only its own.
 */
export type LogOriginKind = "device" | "adapter";

interface Registration {
    kind: LogOriginKind;
    queue: LineQueue;
}

/**
 * Weak so an origin that is never released — a device whose `initialize()` threw, a run abandoned mid-test — cannot
 * pin what it names for the life of the process.  This also makes the module safe across `Boot.reboot()`, which
 * replaces the destinations below but leaves module state alone: a registration whose environment is gone is
 * unreachable rather than stale.
 */
const registrations = new WeakMap<Diagnostic.Origin, Registration>();

/**
 * Claim every log message originating at `origin` for {@link queue}, until the returned function is called.
 *
 * matter.js stamps each message with the environment of the component that wrote it, so a line reaches the right log
 * even when it comes from a socket or timer callback, where no call stack identifies the node.
 */
export function registerLogOrigin(origin: Diagnostic.Origin, kind: LogOriginKind, queue: LineQueue) {
    const existing = registrations.get(origin);
    if (existing !== undefined) {
        throw new InternalError(
            `Log origin "${origin.name}" is already registered as a ${existing.kind}; two participants sharing one ` +
                "environment would misattribute each other's logs",
        );
    }

    const registration: Registration = { kind, queue };
    registrations.set(origin, registration);

    return () => {
        // Only our own registration: a later participant in the same environment keeps its routing
        if (registrations.get(origin) === registration) {
            registrations.delete(origin);
        }
    };
}

/**
 * The registration a message belongs to, if any.
 *
 * A node builds services in child environments, so this searches the message origin's ancestors as well.
 */
function registrationFor(message: Diagnostic.Message) {
    for (let origin = message.origin; origin !== undefined; origin = origin.parent) {
        const registration = registrations.get(origin);
        if (registration !== undefined) {
            return registration;
        }
    }
}

/**
 * A log destination that writes each message to the log of the participant it originates from.
 *
 * `fallback` receives a message that originates nowhere this module knows — every component that still logs through a
 * shared logger, which is all but a few.  It must not be dropped: matter.js reports a crashed endpoint and a crashed
 * runtime through the logger too, from work no call of ours encloses.
 */
export function OriginDestination(name: string, kind: LogOriginKind, fallback: (text: string) => void) {
    return LogDestination({
        name,
        format: LogFormat.formats.plain,

        // A participant's log is evidence, not console noise, so it carries what a component logs per operation --
        // a session evicted with its connection, for one -- which the level a person watches a run at leaves out
        level: LogLevel.DEBUG,

        write(text: string, message: Diagnostic.Message) {
            const registration = registrationFor(message);
            if (registration === undefined) {
                fallback(text);
                return;
            }
            if (registration.kind === kind) {
                registration.queue.push(text);
            }
        },
    });
}
