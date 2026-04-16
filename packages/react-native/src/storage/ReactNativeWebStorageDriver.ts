/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebStorageDriver, type DataNamespace } from "@matter/general";
import { createAsyncStorage } from "@react-native-async-storage/async-storage";

/**
 * AsyncStorage backend based on AsyncStorage v3 scoped instances.
 *
 * This backend uses `createAsyncStorage(...)`, so each backend instance stores
 * data in its own scoped storage area. It is the default backend for
 * `@matter/react-native` with async-storage `3.x`.
 *
 * For migration scenarios that need legacy v2-compatible singleton storage
 * behavior, use {@link ReactNativeWebStorageDriverV2} from
 * `@matter/react-native/storage` instead.
 */
export class ReactNativeWebStorageDriver extends WebStorageDriver {
    static readonly id = "react-native-web";

    static create(namespace: DataNamespace) {
        const storage = new ReactNativeWebStorageDriver(namespace.namespace);
        storage.initialize();
        return storage;
    }

    constructor(namespace?: string) {
        super(createAsyncStorage(namespace ?? "matterjs"));
    }
}
