/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    type Crypto,
    Diagnostic,
    Duration,
    ImplementationError,
    isObject,
    Millis,
    StandardCrypto,
    Time,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import type { NodeId } from "@matter/main/types";
import type { CertIcdClientApi, CertIcdEvent, CertIcdRegistration, LogFollower, LogLine } from "@matter/testing";
import { CertLogTimeoutError } from "@matter/testing";

/** How long the server may take to log a registration it already answered `register_icd` for. */
const REGISTRATION_LOG_TIMEOUT = Millis(10_000);

/**
 * `@<fabric index>:<peer node id in hex>•<session>⇵<exchange>`, which matter.js puts on every line of an exchange. The
 * session carries its transport where it is not UDP, as `•442c(tcp)`.
 */
const EXCHANGE = String.raw`@[0-9a-f]+:([0-9a-f]+)•[0-9a-f]+(?:\(\w+\))?⇵[0-9a-f]+`;

const REGISTER_REQUEST = new RegExp(
    String.raw`ClientInteraction Invoke » (${EXCHANGE}) \d+\.icdManagement\.registerClient with (.*)$`,
);
const REGISTER_RESPONSE = new RegExp(
    String.raw`ClientInteraction Invoke « (${EXCHANGE}) \d+\.icdManagement\.registerClient icdCounter: (\d+)`,
);
const CHECK_IN =
    /Message « for: SC\/IcdCheckInMessage id: •unsecured#([0-9a-f]+)(?:\(\w+\))?⇵\S+ .* payload: ([0-9a-f]+)$/;
const DROPPED = /FabricIcd Dropping replayed check-in from peer (\d+)$/;
const IGNORED = /Ignoring ICD check-in matching no registered peer$/;
const SESSION_ENDED = /Session •unsecured#([0-9a-f]+) Session ended$/;

/** A line that can change what {@link icdEventsOf} derives, which is what a wait wakes up for. */
const RELEVANT =
    /icdManagement\.registerClient|ICD key refresh for peer|SC\/IcdCheckInMessage|replayed check-in|ICD check-in matching no|unsecured#\S+ Session ended/;

/** `nonce(13) ‖ AES-128-CCM(counter LE32 ‖ applicationData) ‖ MIC(16)` (Core § 4.22.3.1). */
const CHECK_IN_NONCE_LENGTH = 13;

/**
 * What {@link MatterServerIcdClient} needs of the adapter that hands it out: the server's own log, its commands for
 * the node, and the server's own subscription to the node, which the server's ICD client registers through.
 */
export interface MatterServerIcdHost {
    readonly nodeId: NodeId;

    /** The server's log, which carries what the WebSocket API does not report. */
    readonly log: LogFollower;

    command(command: string, args: object): Promise<unknown>;

    /**
     * Resolves once the server's own subscription to the node is active, switching it on once; `true` where this call
     * switched it on.
     */
    enableAutoSubscription(): Promise<boolean>;

    disableAutoSubscription(): Promise<void>;

    /** The node id the server holds on the node's fabric. */
    ownNodeId(): Promise<bigint>;

    /** Sends `StayActiveRequest` and resolves with `PromisedActiveDuration`. */
    stayActive(durationMs: number): Promise<number>;
}

/**
 * The server's ICD Check-In client for one node, driven through `register_icd`, `unregister_icd` and the server's own
 * subscription to the node.
 *
 * The WebSocket API reports neither the key a registration sent, the `ICDCounter` the node answered, nor any Check-In.
 * The server logs them through matter.js, so this client reads them from the server's log: the `RegisterClient` invoke
 * and its response name the key and the counter, and a Check-In the server received carries its payload, which the
 * registered key decrypts to the counter. A Check-In counts as accepted once the server closed its session without
 * logging that it dropped it.
 *
 * @see {@link MatterSpecification.v161.Core} § 4.22, § 9.16
 */
export class MatterServerIcdClient implements CertIcdClientApi {
    readonly #host: MatterServerIcdHost;
    readonly #crypto: Crypto = new StandardCrypto();

    /** Where this client's record starts in the server's log. */
    readonly #since: number;

    constructor(host: MatterServerIcdHost) {
        this.#host = host;
        this.#since = endOf(host.log);
    }

    async register(options?: { allowMultiAdmin?: boolean }): Promise<CertIcdRegistration> {
        const { log, nodeId } = this.#host;
        await this.#host.enableAutoSubscription();
        const ownNodeId = await this.#host.ownNodeId();

        await log.settled();
        const from = endOf(log);
        await this.#host.command("register_icd", {
            node_id: nodeId,
            allow_multi_admin: options?.allowMultiAdmin ?? false,
        });

        const { key, icdCounter } = await registrationIn(log, nodeId, from);
        return { key, nodeId: ownNodeId, icdCounter };
    }

    /** Rejects without sending anything where the server holds no registration, as the in-process client does. */
    async unregister(): Promise<void> {
        const { nodeId } = this.#host;
        const state = await this.#host.command("get_icd_state", { node_id: nodeId });
        if (!isObject(state) || typeof state.registered !== "boolean") {
            throw new UnexpectedDataError(
                `matterjs-server answered get_icd_state for node ${nodeId} with ${Diagnostic.json(state)}`,
            );
        }
        if (!state.registered) {
            throw new ImplementationError(`matterjs-server holds no ICD registration with node ${nodeId}`);
        }
        await this.#host.command("unregister_icd", { node_id: nodeId, force: false });

        // Switched on for the registration, which has ended
        await this.#host.disableAutoSubscription();
    }

    stayActive(durationMs: number): Promise<number> {
        return this.#host.stayActive(durationMs);
    }

    stopSubscription(): Promise<void> {
        return this.#host.disableAutoSubscription();
    }

    events(): CertIcdEvent[] {
        return icdEventsOf(linesFrom(this.#host.log, this.#since), this.#host.nodeId, this.#crypto);
    }

    async waitFor<K extends CertIcdEvent["kind"]>(
        kind: K,
        from: number,
        timeoutMs: number,
    ): Promise<{ event: Extract<CertIcdEvent, { kind: K }>; index: number }> {
        const isKind = (event: CertIcdEvent): event is Extract<CertIcdEvent, { kind: K }> => event.kind === kind;
        const { log } = this.#host;
        const timeout = Millis(timeoutMs);
        const deadline = Time.nowUs + timeout;

        for (;;) {
            const scanned = endOf(log);
            const events = this.events();
            for (let index = from; index < events.length; index++) {
                const event = events[index];
                if (isKind(event)) {
                    return { event, index };
                }
            }

            const remaining = Millis(deadline - Time.nowUs);
            if (remaining > 0) {
                try {
                    await log.expectPattern(RELEVANT, { from: scanned, timeoutMs: remaining });
                    continue;
                } catch (error) {
                    if (!(error instanceof CertLogTimeoutError)) {
                        throw error;
                    }
                }
            }
            throw new TimeoutError(
                `No ICD ${kind} of node ${this.#host.nodeId} in the matterjs-server log within ` +
                    `${Duration.format(timeout)} (recorded: ${events.length})`,
            );
        }
    }
}

/** The index the next line of `log` gets. */
function endOf(log: LogFollower) {
    return log.lines.length;
}

function* linesFrom(log: LogFollower, from: number): Generator<LogLine> {
    for (let index = from, line = log.at(index); line !== undefined; line = log.at(++index)) {
        yield line;
    }
}

/** The key and counter of the first `RegisterClient` the server sent `nodeId` at or after `from`, and its response. */
async function registrationIn(log: LogFollower, nodeId: NodeId, from: number) {
    const peer = nodeId.toString(16);
    let request: LogLine;
    try {
        request = await log.expectPattern(
            new RegExp(
                String.raw`ClientInteraction Invoke » @[0-9a-f]+:${peer}•.*\.icdManagement\.registerClient with `,
            ),
            { from, timeoutMs: REGISTRATION_LOG_TIMEOUT },
        );
    } catch (error) {
        if (error instanceof CertLogTimeoutError) {
            throw new UnexpectedDataError(
                `matterjs-server registered with node ${nodeId} but logged no RegisterClient it sent`,
                { cause: error },
            );
        }
        throw error;
    }
    const requested = REGISTER_REQUEST.exec(request.text);
    const key = requested === null ? undefined : fieldOf(requested[3], "key");
    if (requested === null || key === undefined) {
        throw new UnexpectedDataError(`matterjs-server logged a RegisterClient without a key: ${request.text}`);
    }

    let response: LogLine;
    try {
        response = await log.expectPattern(
            new RegExp(`ClientInteraction Invoke « ${escaped(requested[1])} .*registerClient icdCounter: `),
            { from: request.index + 1, timeoutMs: REGISTRATION_LOG_TIMEOUT },
        );
    } catch (error) {
        if (error instanceof CertLogTimeoutError) {
            throw new UnexpectedDataError(
                `matterjs-server logged no ICDCounter for the RegisterClient it sent node ${nodeId}`,
                { cause: error },
            );
        }
        throw error;
    }
    const answered = REGISTER_RESPONSE.exec(response.text);
    if (answered === null) {
        throw new UnexpectedDataError(
            `matterjs-server logged a RegisterClient response it cannot read: ${response.text}`,
        );
    }
    return { key: Bytes.of(Bytes.fromHex(key)), icdCounter: Number(answered[3]) };
}

/**
 * The Check-Ins the server accepted from `nodeId` and the key refreshes it made with it, in the order of `lines`, which
 * are server log lines.
 *
 * A Check-In counts once the server closed its session without logging that it dropped or ignored it. A key refresh
 * counts once the server recognized a Check-In under the new key, because matter.js logs no line when it stores the
 * new key. A refresh the server logged as failed is open, not final: a matter.js that keeps the new key as pending
 * accepts a later Check-In under it and then logs "checked in with its refreshed key", which stores the refresh. An
 * older matter.js that failed to store the key ignores every Check-In under it, so the refresh stays failed. A
 * Check-In the server dropped does not confirm a failed refresh, because a replay under a pending key promotes
 * nothing.
 * A Check-In or refresh not settled yet ends the list, so an event once reported keeps its index.
 */
export function icdEventsOf(lines: Iterable<LogLine>, nodeId: NodeId, crypto: Crypto): CertIcdEvent[] {
    const peer = nodeId.toString(16);
    const refreshFailed = new RegExp(String.raw`IcdClient ICD key refresh for peer @[0-9a-f]+:${peer} failed`);
    const requests = new Map<string, { key: Uint8Array; refresh: boolean }>();
    const keys = new Array<Uint8Array>();
    const entries = new Array<IcdLogEntry>();
    let lastCheckIn: CheckInEntry | undefined;

    const settle = (entry: CheckInEntry | undefined, state: Exclude<CheckInEntry["state"], "pending">) => {
        if (entry?.state !== "pending") {
            return;
        }
        entry.state = state;
        for (const refresh of entries) {
            if (refresh.kind !== "refresh" || !Bytes.areEqual(refresh.key, entry.key)) {
                continue;
            }
            if (refresh.state === "pending") {
                refresh.state = state === "ignored" ? "failed" : "stored";
            } else if (refresh.state === "failed" && state === "accepted") {
                refresh.state = "stored";
            }
        }
    };

    for (const { text, synthetic } of lines) {
        if (synthetic) {
            continue;
        }

        const requested = REGISTER_REQUEST.exec(text);
        if (requested !== null) {
            const key = fieldOf(requested[3], "key");
            if (requested[2] === peer && key !== undefined) {
                const bytes = Bytes.of(Bytes.fromHex(key));
                requests.set(requested[1], {
                    key: bytes,
                    refresh: fieldOf(requested[3], "verificationKey") !== undefined,
                });
                keys.unshift(bytes);
            }
            continue;
        }

        const answered = REGISTER_RESPONSE.exec(text);
        if (answered !== null) {
            const request = requests.get(answered[1]);
            if (request?.refresh) {
                // A retry offers the pending key again; its failed first attempt is superseded
                const superseded = entries.findIndex(
                    entry =>
                        entry.kind === "refresh" && entry.state === "failed" && Bytes.areEqual(entry.key, request.key),
                );
                if (superseded !== -1) {
                    entries.splice(superseded, 1);
                }
                // A Check-In under the key that came before the response already confirmed it
                const confirmed = entries.some(
                    entry =>
                        entry.kind === "checkIn" &&
                        entry.state === "accepted" &&
                        Bytes.areEqual(entry.key, request.key),
                );
                entries.push({
                    kind: "refresh",
                    key: request.key,
                    counterStart: Number(answered[3]),
                    state: confirmed ? "stored" : "pending",
                });
            }
            continue;
        }

        if (refreshFailed.test(text)) {
            for (let index = entries.length - 1; index >= 0; index--) {
                const entry = entries[index];
                if (entry.kind === "refresh" && entry.state === "pending") {
                    entry.state = "failed";
                    break;
                }
            }
            continue;
        }

        const checkIn = CHECK_IN.exec(text);
        if (checkIn !== null) {
            const decrypted = checkInOf(crypto, keys, Bytes.fromHex(checkIn[2]));
            lastCheckIn =
                decrypted === undefined
                    ? undefined
                    : { kind: "checkIn", session: checkIn[1], ...decrypted, state: "pending" };
            if (lastCheckIn !== undefined) {
                entries.push(lastCheckIn);
            }
            continue;
        }

        // Both are logged while the server still processes the Check-In it received last, before it closes its session
        const dropped = DROPPED.exec(text);
        if (dropped !== null) {
            if (BigInt(dropped[1]) === BigInt(nodeId)) {
                settle(lastCheckIn, "dropped");
            }
            continue;
        }
        if (IGNORED.test(text)) {
            settle(lastCheckIn, "ignored");
            continue;
        }

        const ended = SESSION_ENDED.exec(text);
        if (ended !== null) {
            for (const entry of entries) {
                if (entry.kind === "checkIn" && entry.session === ended[1]) {
                    settle(entry, "accepted");
                }
            }
        }
    }

    const events = new Array<CertIcdEvent>();
    for (const entry of entries) {
        if (entry.state === "pending") {
            break;
        }
        if (entry.kind === "refresh" && entry.state === "stored") {
            events.push({ kind: "keyRefresh", key: entry.key, counterStart: entry.counterStart });
        } else if (entry.kind === "checkIn" && entry.state === "accepted") {
            events.push({ kind: "checkIn", counter: entry.counter });
        }
    }
    return events;
}

interface CheckInEntry {
    kind: "checkIn";
    session: string;
    counter: number;

    /** The registration key the Check-In decrypts with. */
    key: Uint8Array;

    state: "pending" | "accepted" | "dropped" | "ignored";
}

type IcdLogEntry =
    | CheckInEntry
    | { kind: "refresh"; key: Uint8Array; counterStart: number; state: "pending" | "stored" | "failed" };

/**
 * The counter of a Check-In payload and the one of `keys` that authenticates it, or `undefined` where none does: the
 * key decides which registration, and so which node, a Check-In belongs to.
 *
 * @see {@link MatterSpecification.v161.Core} § 4.22.3.1
 */
function checkInOf(crypto: Crypto, keys: Uint8Array[], payload: Bytes) {
    const data = Bytes.of(payload);
    const nonce = data.subarray(0, CHECK_IN_NONCE_LENGTH);
    const ciphertext = data.subarray(CHECK_IN_NONCE_LENGTH);
    for (const key of keys) {
        let plaintext: Bytes;
        try {
            plaintext = crypto.decrypt(key, ciphertext, nonce);
        } catch {
            // The payload of another registration, which this key does not authenticate
            continue;
        }
        const view = Bytes.dataViewOf(plaintext);
        if (view.byteLength >= 4) {
            return { counter: view.getUint32(0, true), key };
        }
    }
    return undefined;
}

/** The value of `name` in matter.js's `name: value name: value …` rendering of a command's fields. */
function fieldOf(fields: string, name: string) {
    return new RegExp(String.raw`(?:^| )${name}: (\S+)`).exec(fields)?.[1];
}

function escaped(literal: string) {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
