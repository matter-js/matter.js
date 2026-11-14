/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, ImplementationError, Logger, Millis, Observable, ObserverGroup, Time, Timer } from "@matter/general";
import {
    ClientNode,
    DesiredStateBehavior,
    ItemEnforcement,
    ItemKind,
    ItemKindRegistry,
    itemMapKey,
    ItemWatch,
    ManagedItem,
    NetworkClient,
} from "@matter/node";
import type { AttributePath } from "@matter/types";
import type { VerifyResult } from "./planActions.js";

const logger = Logger.get("DriftWatcher");

/**
 * Whether a report makes `item` a suspect of drift, judged by the subscription cache against the item's enforcement
 * record. Only a committed item of a kind with `satisfiedBy` can be a suspect.
 *
 * | observed drift | `satisfiedBy` | suspect |
 * |----------------|---------------|---------|
 * | no             | false         | yes     |
 * | no             | true          | no      |
 * | yes            | true          | yes     |
 * | yes            | false         | no      |
 * | any            | throws        | yes     |
 *
 * A hold does not enter the rule: a held item restored on the device is a suspect, so a read can end its observed
 * drift, and a held item that drifts again after that is a suspect once.
 *
 * Called with the error when `satisfiedBy` throws; the caller decides how to log it.
 */
export function isDriftSuspect(
    node: ClientNode,
    kind: ItemKind,
    item: ManagedItem,
    enforcement: ItemEnforcement | undefined,
    onFailure: (error: unknown) => void,
): boolean {
    if (item.status.state !== "committed" || kind.satisfiedBy === undefined) {
        return false;
    }
    let satisfied: boolean;
    try {
        satisfied = kind.satisfiedBy(node, item);
    } catch (error) {
        onFailure(error);
        return true;
    }
    return satisfied === (enforcement?.drift !== undefined);
}

/** What a started and not yet closed watcher holds. {@link DriftWatcher.close} releases all of it at once. */
class Live {
    readonly triggers = new ObserverGroup();
    readonly reports = new ObserverGroup();
    watched = new Map<Observable, ReadonlySet<string>>();

    /** Judged by a report, waiting for the quiet period to end. */
    readonly suspects = new Set<string>();

    /** Handed to the host, waiting for a pass to take them with {@link DriftWatcher.startPass}. */
    readonly handedOver = new Set<string>();

    /** The wait before the next hand-over while reads fail; the quiet period otherwise. */
    backoff?: Duration;

    constructor(readonly timer: Timer) {}

    release() {
        this.timer.stop();
        this.reports.close();
        this.triggers.close();
    }
}

/**
 * Turns subscription reports of the attributes that the committed items of one peer watch into a set of suspect
 * items, and hands that set to its {@link DriftWatcher.Host} once no report has arrived for a quiet period.
 *
 * The observers follow the peer's committed items and its structure. The watcher rebuilds them after every committed
 * change of the peer's desired state, when the client establishes a subscription, when the peer's software version
 * changes, and when the peer's client structure applied the data of a read, a subscription report, wire changes or
 * its cache.
 *
 * While the peer's state cannot be read — under construction, or being destroyed — the watcher does nothing: it
 * builds no observers, judges no report and hands over no suspects. A peer that becomes readable is watched from the
 * next of the triggers above.
 *
 * A watch of an attribute with the changes-omitted (`C`) quality is skipped with a warning, because no report ever
 * shows its changes. A watch that the peer's default subscription does not cover is kept, with one warning per
 * narrowing of the subscription.
 *
 * Suspects move through three stages, and each hand-over gets exactly one outcome:
 *
 * ```
 * report ──► suspects ──quiet period──► handed over ──startPass()──► read by the pass ──dispose──► outcome
 *                ▲                                                                                    │
 *                └──────────── not read: suspect again, next wait doubled ◄───────────────────────────┘
 * ```
 *
 * The owner of the per-peer wiring creates the watcher, starts it once with {@link start} and releases it with
 * {@link close}; it has no lifetime of its own. After {@link close} every method does nothing.
 */
export class DriftWatcher {
    readonly #peer: ClientNode;
    readonly #registry: ItemKindRegistry;
    readonly #host: DriftWatcher.Host;
    #live?: Live;
    readonly #warnedChangesOmitted = new Set<string>();
    #warnedUncovered = false;
    readonly #failedKinds = new Set<string>();

    /** Registers nothing; {@link start} does. */
    constructor(peer: ClientNode, registry: ItemKindRegistry, host: DriftWatcher.Host) {
        this.#peer = peer;
        this.#registry = registry;
        this.#host = host;
        this.#live = new Live(
            Time.getTimer(`drift quiet period of ${peer.id}`, host.quietPeriod(), () => this.#quietEnded()),
        );
    }

    /**
     * Observe the triggers of a rebuild, then rebuild. Called once. What it registered before a throw is released by
     * {@link close}.
     */
    start(): void {
        const live = this.#live;
        if (live === undefined) {
            return;
        }
        const peer = this.#peer;
        // Runs after commit, so the items a rebuild reads are the committed set
        live.triggers.on(peer.eventsOf(DesiredStateBehavior).stateChanged, () => this.rebuild());
        live.triggers.on(peer.eventsOf(NetworkClient).subscriptionStatusChanged, isActive => {
            if (isActive) {
                this.rebuild();
            }
        });
        live.triggers.on(peer.lifecycle.softwareVersionChanged, () => this.rebuild());
        live.triggers.on(peer.owner.peers.structureApplied, node => {
            if (node === peer) {
                this.rebuild();
            }
        });
        this.rebuild();
    }

    /** Observe the watches of the peer's committed items, replacing the observers when the watches changed. */
    rebuild(): void {
        const live = this.#readableLive();
        if (live === undefined) {
            return;
        }
        const keysByReport = new Map<Observable, Set<string>>();
        const uncovered = new Set<string>();
        for (const item of Object.values(this.#peer.stateOf(DesiredStateBehavior).items)) {
            if (item.status.state !== "committed") {
                continue;
            }
            const kind = this.#registry.get(item.kind);
            if (kind?.watches === undefined) {
                continue;
            }
            let watches: ItemWatch[];
            try {
                watches = kind.watches(this.#peer, item);
            } catch (error) {
                this.#kindFailed(kind, "watches", error);
                continue;
            }
            for (const watch of watches) {
                const report = this.#reportOf(kind, watch, uncovered);
                if (report === undefined) {
                    continue;
                }
                let keys = keysByReport.get(report);
                if (keys === undefined) {
                    keys = new Set();
                    keysByReport.set(report, keys);
                }
                keys.add(itemMapKey(item.kind, item.key));
            }
        }

        // The peer's structure is applied after every report, so most rebuilds find the same watches
        if (!sameWatches(live.watched, keysByReport)) {
            live.reports.close();
            for (const [report, keys] of keysByReport) {
                live.reports.on(report, () => this.#reported(keys));
            }
            live.watched = keysByReport;
        }

        // Once per narrowing: a default subscription that covers every watch again lets the next narrowing warn
        if (uncovered.size > 0 && !this.#warnedUncovered) {
            logger.warn(
                `The default subscription of ${this.#peer.id} does not cover ${[...uncovered].join(", ")}; drift of these is found only at the next verify point (a subscription the client establishes, a firmware change, a task gate or an explicit verify)`,
            );
        }
        this.#warnedUncovered = uncovered.size > 0;
    }

    /**
     * Take the handed-over suspects for a pass of the peer that is starting now. The pass reads the returned
     * {@link DriftWatcher.Pass.suspects}, sets {@link DriftWatcher.Pass.result} once it read, and disposes the pass on
     * every way out; see {@link DriftWatcher.Pass} for the outcome.
     *
     * Each handed-over key is judged again now, as a report would judge it, because it was handed over earlier: an
     * item removed, rewritten or read by another pass since then is left out, and nothing is owed for it. Passes of
     * one peer run one after the other, so each key is taken by one pass.
     */
    startPass(): DriftWatcher.Pass {
        const suspects = new Set<string>();
        const kinds = new Set<string>();
        const live = this.#readableLive();
        if (live !== undefined && live.handedOver.size > 0) {
            const desiredState = this.#peer.stateOf(DesiredStateBehavior);
            for (const key of live.handedOver) {
                const item = this.#suspectItem(key, desiredState);
                if (item !== undefined) {
                    suspects.add(key);
                    kinds.add(item.kind);
                }
            }
            if (suspects.size < live.handedOver.size) {
                logger.debug(
                    `Drift pass for ${this.#peer.id}: ${live.handedOver.size - suspects.size} of ${live.handedOver.size} suspects need no read any more`,
                );
            }
            live.handedOver.clear();
        }
        const pass: DriftWatcher.Pass = {
            suspects,
            kinds,
            [Symbol.dispose]: () => this.#passEnded(suspects, pass.result),
        };
        return pass;
    }

    /** Release every observer and the timer, and forget all suspects. May be called more than once. */
    close(): void {
        const live = this.#live;
        this.#live = undefined;
        live?.release();
    }

    /** The watcher's state while it is open and the peer's state can be read; every entry that reads the peer asks. */
    #readableLive(): Live | undefined {
        if (!this.#peer.lifecycle.isReadable) {
            return undefined;
        }
        return this.#live;
    }

    /**
     * The observable for the watch's attribute, or `undefined` when no report can show its changes. Adds the watch to
     * `uncovered` when the peer's default subscription does not include its attribute. A watch naming a cluster or an
     * attribute the endpoint does not have is a fault of `kind`.
     */
    #reportOf(kind: ItemKind, { endpoint, behavior, attribute }: ItemWatch, uncovered: Set<string>) {
        const what = `${attribute} of ${behavior.id} on endpoint ${endpoint.number}`;
        if (!endpoint.behaviors.has(behavior)) {
            this.#kindFailed(
                kind,
                "watches",
                new ImplementationError(`Watch names ${what}, but the endpoint has no ${behavior.id}`),
            );
            return undefined;
        }
        const model = behavior.schema.attributes.find(candidate => candidate.propertyName === attribute);
        const report = endpoint.eventsOf(behavior.id)[`${attribute}$Changed`];
        if (model === undefined || report === undefined) {
            this.#kindFailed(
                kind,
                "watches",
                new ImplementationError(`Watch names ${what}, but ${behavior.id} has no such attribute`),
            );
            return undefined;
        }
        if (model.changesOmitted) {
            if (!this.#warnedChangesOmitted.has(what)) {
                this.#warnedChangesOmitted.add(what);
                logger.warn(
                    `Not watching ${what} of ${this.#peer.id} for drift: reports never show changes of this attribute; its items are checked only at the next verify point (a subscription the client establishes, a firmware change, a task gate or an explicit verify)`,
                );
            }
            return undefined;
        }

        if (!this.#subscriptionCovers(endpoint.number, behavior.cluster.id, model.id)) {
            uncovered.add(what);
        }
        return report;
    }

    /**
     * Whether an attribute path of the peer's default subscription, as {@link NetworkClient} builds the request,
     * includes the attribute.
     */
    #subscriptionCovers(endpointId: number, clusterId: number, attributeId: number): boolean {
        const definition = this.#peer.stateOf(NetworkClient).defaultSubscription;
        if (definition === undefined) {
            return true;
        }
        const paths: readonly AttributePath[] | undefined =
            "isFabricFiltered" in definition
                ? definition.attributeRequests
                : { attributes: [{}], ...definition }.attributes;
        return (paths ?? []).some(
            path =>
                (path.endpointId === undefined
                    ? !(endpointId === 0 && path.wildcardPathFlags?.skipRootNode)
                    : path.endpointId === endpointId) &&
                (path.clusterId === undefined || path.clusterId === clusterId) &&
                (path.attributeId === undefined || path.attributeId === attributeId),
        );
    }

    #reported(keys: ReadonlySet<string>) {
        // Also reached after close: an emission calls the observers it had when it started
        const live = this.#readableLive();
        if (live === undefined) {
            return;
        }
        const desiredState = this.#peer.stateOf(DesiredStateBehavior);
        for (const key of keys) {
            const item = this.#suspectItem(key, desiredState);
            if (item === undefined) {
                live.suspects.delete(key);
            } else {
                live.suspects.add(key);
                logger.debug(`Report of ${this.#peer.id} makes ${item.kind}:${item.key} a drift suspect`);
            }
        }

        if (live.suspects.size > 0) {
            this.#startTimer(live);
        } else {
            live.timer.stop();
        }
    }

    /**
     * The item under `key` when it is a drift suspect now, by {@link isDriftSuspect}. A removal is committed before the
     * rebuild that follows it, so a report can name an item that is gone.
     */
    #suspectItem(key: string, desiredState: DesiredStateBehavior.State): ManagedItem | undefined {
        const item = desiredState.items[key];
        const kind = item === undefined ? undefined : this.#registry.get(item.kind);
        if (item === undefined || kind === undefined) {
            return undefined;
        }
        const suspect = isDriftSuspect(this.#peer, kind, item, desiredState.enforcement[key], error =>
            this.#kindFailed(kind, "satisfiedBy", error),
        );
        return suspect ? item : undefined;
    }

    #startTimer(live: Live) {
        live.timer.interval = live.backoff ?? this.#host.quietPeriod();
        live.timer.start();
    }

    #quietEnded() {
        const live = this.#readableLive();
        if (live === undefined) {
            logger.debug(`State of ${this.#peer.id} cannot be read now; its drift suspects wait for the next report`);
            return;
        }
        if (!this.#host.reachable()) {
            logger.debug(`${this.#peer.id} is unreachable; dropping ${live.suspects.size} drift suspects`);
            live.suspects.clear();
            return;
        }
        for (const key of live.suspects) {
            live.handedOver.add(key);
        }
        live.suspects.clear();
        this.#host.drift();
    }

    /**
     * The outcome of a pass that took `taken`: the keys it did not read become suspects again and the next hand-over
     * waits twice as long as the last one; a pass that read its suspects, or read every item without a failure, makes
     * the next hand-over wait the quiet period again. `result` is `undefined` when the pass made no read or threw.
     */
    #passEnded(taken: ReadonlySet<string>, result: VerifyResult | undefined) {
        const live = this.#live;
        if (live === undefined) {
            return;
        }
        const unread = [...taken].filter(
            key => result === undefined || (!result.verified.has(key) && !result.drifted.has(key)),
        );
        if (unread.length > 0) {
            for (const key of unread) {
                live.suspects.add(key);
            }
            const quietPeriod = this.#host.quietPeriod();
            live.backoff = Duration.min(
                Millis(2 * (live.backoff ?? quietPeriod)),
                Duration.max(this.#host.maxBackoff(), quietPeriod),
            );
            this.#startTimer(live);
        } else if (result !== undefined && (taken.size > 0 || result.unread.size === 0)) {
            live.backoff = undefined;
        }
    }

    /** Our own kind failed: warn once per kind and member, so a kind that fails for every item cannot flood the log. */
    #kindFailed(kind: ItemKind, member: "watches" | "satisfiedBy", error: unknown) {
        const failure = `${kind.kind}.${member}`;
        if (this.#failedKinds.has(failure)) {
            logger.debug(`Item kind "${kind.kind}" failed again in ${member} for ${this.#peer.id}:`, error);
            return;
        }
        this.#failedKinds.add(failure);
        const consequence =
            member === "satisfiedBy" ? "its items are treated as drift suspects" : "its items are not watched";
        logger.warn(`Item kind "${kind.kind}" failed in ${member} for ${this.#peer.id}; ${consequence}:`, error);
    }
}

function sameWatches(a: Map<Observable, ReadonlySet<string>>, b: Map<Observable, ReadonlySet<string>>) {
    if (a.size !== b.size) {
        return false;
    }
    for (const [report, keys] of b) {
        const current = a.get(report);
        if (current === undefined || current.size !== keys.size || [...keys].some(key => !current.has(key))) {
            return false;
        }
    }
    return true;
}

export namespace DriftWatcher {
    /**
     * What the per-peer reconciler wiring gives a {@link DriftWatcher}. Its members are called synchronously, never
     * after {@link DriftWatcher.close}.
     */
    export interface Host {
        /** How long reports must stay away before the suspects are handed over. Read each time the timer starts. */
        quietPeriod(): Duration;

        /**
         * The longest wait after failed reads; the wait doubles per failure up to this, or up to {@link quietPeriod}
         * when that is longer.
         */
        maxBackoff(): Duration;

        /** Whether the peer can be read now. Unreachable when the quiet period ends: the suspects are dropped. */
        reachable(): boolean;

        /**
         * Queue a pass for the peer. The suspects stay with the watcher; the pass takes them with
         * {@link DriftWatcher.startPass} when it starts.
         */
        drift(): void;
    }

    /**
     * The handed-over suspects a pass took with {@link DriftWatcher.startPass}. Disposing the pass reports its outcome
     * once, whatever way the pass ended:
     *
     * | `result` when disposed                       | outcome                                                 |
     * |----------------------------------------------|---------------------------------------------------------|
     * | read every suspect (verified or drifted)     | next hand-over waits the quiet period                   |
     * | a suspect in neither set (its read threw)    | that suspect is suspected again, the wait doubles       |
     * | unset (no read, or the pass threw)           | every suspect is suspected again, the wait doubles      |
     * | no suspects, read every item without failure | next hand-over waits the quiet period                   |
     * | no suspects otherwise                        | nothing changes                                         |
     *
     * Disposing after {@link DriftWatcher.close} does nothing.
     */
    export interface Pass extends Disposable {
        /** The {@link itemMapKey} keys the pass must read live. */
        readonly suspects: ReadonlySet<string>;

        /** The kinds of {@link suspects}. */
        readonly kinds: ReadonlySet<string>;

        /** What the pass read live; set once the pass completed. */
        result?: VerifyResult;
    }
}
