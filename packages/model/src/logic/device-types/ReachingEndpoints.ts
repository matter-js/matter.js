/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DeviceTypeFacts } from "./DeviceTypeFacts.js";

/**
 * The reaching endpoints of one node scope and what each contributes to the facts of the whole scope: the network
 * interfaces it supports, the conditions it asserts on the node endpoint and whether it declares a singleton.
 *
 * Each member's contribution is read once and kept until the member is {@link invalidate invalidated}, removed or added
 * again, so the facts of the scope cost as much as the members read since the last time. The conditions asserted on the
 * node endpoint are also read again whenever the node conditions they were read under differ, because a member's
 * conditions include them.
 *
 * A `DeviceTypeValidationPass` without a scope index builds one per node scope from a walk of the scope; a scope index
 * keeps one across passes and must add, remove and invalidate members as the tree changes.
 *
 * @internal
 */
export class ReachingEndpoints<E> implements Iterable<E> {
    readonly #members = new Map<E, Contribution>();
    readonly #unreadFacts = new Set<E>();
    readonly #unreadAssertions = new Set<E>();
    readonly #interfaces = new Tally();
    readonly #assertions = new Tally();
    #assertionsReadUnder?: string;
    #declarers?: E[];

    constructor(members: Iterable<E> = []) {
        for (const member of members) {
            this.add(member);
        }
    }

    get size() {
        return this.#members.size;
    }

    has(endpoint: E) {
        return this.#members.has(endpoint);
    }

    [Symbol.iterator]() {
        return this.#members.keys();
    }

    /**
     * Make {@link endpoint} a member whose contribution is read on next request.
     */
    add(endpoint: E) {
        if (this.#members.has(endpoint)) {
            this.invalidate(endpoint);
            return;
        }
        this.#members.set(endpoint, {});
        this.#unreadFacts.add(endpoint);
        this.#unreadAssertions.add(endpoint);
    }

    /**
     * @returns whether {@link endpoint} was a member
     */
    delete(endpoint: E) {
        const contribution = this.#members.get(endpoint);
        if (contribution === undefined) {
            return false;
        }
        this.#retract(contribution);
        this.#members.delete(endpoint);
        this.#unreadFacts.delete(endpoint);
        this.#unreadAssertions.delete(endpoint);
        return true;
    }

    /**
     * Read the contribution of {@link endpoint} again on next request, if it is a member.
     */
    invalidate(endpoint: E) {
        const contribution = this.#members.get(endpoint);
        if (contribution === undefined) {
            return;
        }
        this.#retract(contribution);
        this.#members.set(endpoint, {});
        this.#unreadFacts.add(endpoint);
        this.#unreadAssertions.add(endpoint);
    }

    /**
     * The network interface conditions the members support.
     */
    interfaceConditions(read: (endpoint: E) => FactsContribution): ReadonlySet<string> {
        this.#readFacts(read);
        return this.#interfaces.names;
    }

    /**
     * The members that declare a singleton, in tree order.
     */
    declarers(read: (endpoint: E) => FactsContribution, facts: DeviceTypeFacts<E>): readonly E[] {
        this.#readFacts(read);
        if (this.#declarers === undefined) {
            const declarers = new Array<E>();
            for (const [endpoint, { declares }] of this.#members) {
                if (declares) {
                    declarers.push(endpoint);
                }
            }
            this.#declarers = ReachingEndpoints.inTreeOrder(declarers, facts);
        }
        return this.#declarers;
    }

    /**
     * The conditions the members assert on the node endpoint, each read under {@link nodeConditions}.
     */
    assertedConditions(nodeConditions: ReadonlySet<string>, read: (endpoint: E) => Iterable<string>) {
        const key = [...nodeConditions].sort().join();
        if (key !== this.#assertionsReadUnder) {
            this.#assertionsReadUnder = key;
            for (const [endpoint, contribution] of this.#members) {
                this.#assertions.retract(contribution.asserted);
                contribution.asserted = undefined;
                this.#unreadAssertions.add(endpoint);
            }
        }

        for (const endpoint of this.#unreadAssertions) {
            const contribution = this.#members.get(endpoint);
            if (contribution !== undefined) {
                contribution.asserted = [...read(endpoint)];
                this.#assertions.count(contribution.asserted);
            }
            this.#unreadAssertions.delete(endpoint);
        }

        return this.#assertions.names;
    }

    /**
     * {@link endpoints} in the order a walk of their tree visits them: an endpoint before its descendants, parts in the
     * order their owner lists them.
     */
    static inTreeOrder<E>(endpoints: E[], facts: DeviceTypeFacts<E>): E[] {
        if (endpoints.length < 2) {
            return endpoints;
        }

        const positions = new Map<E, number>();
        const positionOf = (endpoint: E) => {
            let position = positions.get(endpoint);
            if (position === undefined) {
                const parent = facts.parentOf(endpoint);
                if (parent !== undefined) {
                    let index = 0;
                    for (const part of facts.partsOf(parent)) {
                        positions.set(part, index++);
                    }
                }
                position = positions.get(endpoint) ?? 0;
                positions.set(endpoint, position);
            }
            return position;
        };

        const paths = new Map<E, number[]>();
        for (const endpoint of endpoints) {
            const path = new Array<number>();
            for (let current: E | undefined = endpoint; current !== undefined; current = facts.parentOf(current)) {
                path.push(positionOf(current));
            }
            paths.set(endpoint, path.reverse());
        }

        return [...endpoints].sort((a, b) => {
            const pathA = paths.get(a) ?? [];
            const pathB = paths.get(b) ?? [];
            for (let i = 0; i < pathA.length && i < pathB.length; i++) {
                if (pathA[i] !== pathB[i]) {
                    return pathA[i] - pathB[i];
                }
            }
            return pathA.length - pathB.length;
        });
    }

    #readFacts(read: (endpoint: E) => FactsContribution) {
        for (const endpoint of this.#unreadFacts) {
            const contribution = this.#members.get(endpoint);
            if (contribution === undefined) {
                this.#unreadFacts.delete(endpoint);
                continue;
            }
            const { interfaces, declares } = read(endpoint);
            contribution.interfaces = interfaces;
            contribution.declares = declares;
            this.#interfaces.count(interfaces);
            if (declares) {
                this.#declarers = undefined;
            }
            this.#unreadFacts.delete(endpoint);
        }
    }

    #retract(contribution: Contribution) {
        this.#interfaces.retract(contribution.interfaces);
        this.#assertions.retract(contribution.asserted);
        if (contribution.declares) {
            this.#declarers = undefined;
        }
    }
}

/**
 * What a member contributes through its own facts alone.
 *
 * @internal
 */
export interface FactsContribution {
    interfaces: readonly string[];
    declares: boolean;
}

/**
 * What was read of a member so far.
 */
interface Contribution extends Partial<FactsContribution> {
    asserted?: readonly string[];
}

/**
 * Names counted once per member that contributes them.
 */
class Tally {
    readonly #counts = new Map<string, number>();
    readonly names = new Set<string>();

    count(names: Iterable<string>) {
        for (const name of names) {
            const count = this.#counts.get(name) ?? 0;
            this.#counts.set(name, count + 1);
            if (count === 0) {
                this.names.add(name);
            }
        }
    }

    retract(names: Iterable<string> | undefined) {
        if (names === undefined) {
            return;
        }
        for (const name of names) {
            const count = (this.#counts.get(name) ?? 0) - 1;
            if (count > 0) {
                this.#counts.set(name, count);
            } else {
                this.#counts.delete(name);
                this.names.delete(name);
            }
        }
    }
}
