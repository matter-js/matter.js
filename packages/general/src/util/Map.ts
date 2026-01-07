/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Observable } from "#util/Observable.js";

/**
 * Set change events.
 */
export interface ObservableMap<K, V> {
    get added(): Observable<[key: K, newValue: V]>;
    get deleted(): Observable<[key: K, oldValue: V]>;
    get changed(): Observable<[key: K, newValue: V, oldValue: V]>;
}

/** Map extension to get added, deleted or changed events */
export class BasicMap<K, V> extends Map<K, V> implements ObservableMap<K, V> {
    #added?: Observable<[K, V]>;
    #deleted?: Observable<[K, V]>;
    #changed?: Observable<[K, V, V]>;

    override set(key: K, value: V): this {
        const existing = this.get(key);
        if (existing !== undefined) {
            if (existing === value) {
                // No change, do not emit events
                return this;
            }
            this.#changed?.emit(key, value, existing);
        } else {
            this.#added?.emit(key, value);
        }
        return super.set(key, value);
    }

    override delete(key: K): boolean {
        const existing = this.get(key);
        if (existing !== undefined) {
            this.#deleted?.emit(key, existing);
        }
        return super.delete(key);
    }

    get added() {
        if (this.#added === undefined) {
            this.#added = Observable();
        }
        return this.#added;
    }

    get deleted() {
        if (this.#deleted === undefined) {
            this.#deleted = Observable();
        }
        return this.#deleted;
    }

    get changed() {
        if (this.#changed === undefined) {
            this.#changed = Observable();
        }
        return this.#changed;
    }
}
