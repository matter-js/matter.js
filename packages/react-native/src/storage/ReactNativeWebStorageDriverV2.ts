/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebStorageDriver, type DataNamespace, type WebStorageProvider } from "@matter/general";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * V2-compatible AsyncStorage backend using the package default export.
 *
 * This backend exists as migration path when apps need to keep using the legacy
 * singleton storage behavior before switching to the v3 scoped storage backend.
 */
export class ReactNativeWebStorageDriverV2 extends WebStorageDriver {
    static readonly id = "react-native-web-v2";

    static create(namespace: DataNamespace) {
        return new ReactNativeWebStorageDriverV2(namespace.namespace);
    }

    /**
     * Creates a new instance of the v2-compatible AsyncStorage backend. If a
     * namespace is provided, keys are prefixed with "<namespace>#".
     */
    constructor(namespace?: string) {
        super(createV2Provider(namespace ?? ""));
    }
}

/**
 * Wraps the v2 `AsyncStorage` singleton default export with a {@link WebStorageProvider} that prepends
 * `"<namespace>#"` to all keys when a namespace is given.
 */
function createV2Provider(namespace: string): WebStorageProvider {
    const prefix = namespace.length ? `${namespace}#` : "";

    function prefixKey(key: string) {
        return `${prefix}${key}`;
    }

    return {
        getItem(key) {
            return AsyncStorage.getItem(prefixKey(key));
        },

        setItem(key, value) {
            return AsyncStorage.setItem(prefixKey(key), value);
        },

        removeItem(key) {
            return AsyncStorage.removeItem(prefixKey(key));
        },

        async getAllKeys() {
            const allKeys = await AsyncStorage.getAllKeys();
            if (!prefix.length) return allKeys;
            return allKeys.filter((k: string) => k.startsWith(prefix)).map((k: string) => k.substring(prefix.length));
        },

        async getMany(keys) {
            const prefixed = keys.map(prefixKey);
            const raw = await AsyncStorage.getMany(prefixed);
            const result = {} as Record<string, string | null>;
            for (const [i, key] of keys.entries()) {
                result[key] = raw[prefixed[i]];
            }
            return result;
        },

        async setMany(entries) {
            const prefixed = {} as Record<string, string>;
            for (const [key, value] of Object.entries(entries)) {
                prefixed[prefixKey(key)] = value;
            }
            await AsyncStorage.setMany(prefixed);
        },

        async removeMany(keys) {
            await AsyncStorage.removeMany(keys.map(prefixKey));
        },

        async clear() {
            if (!prefix.length) {
                await AsyncStorage.clear();
                return;
            }
            // Only clear keys with our prefix
            const allKeys = await AsyncStorage.getAllKeys();
            const keysToDelete = allKeys.filter((k: string) => k.startsWith(prefix));
            if (keysToDelete.length) {
                await AsyncStorage.removeMany(keysToDelete);
            }
        },
    };
}
