/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointStore } from "#storage/EndpointStore.js";
import { MemoryStorageDriver, StorageManager } from "@matter/general";

class InspectableEndpointStore extends EndpointStore {
    initialValuesOf(behaviorId: string) {
        return this.consumeInitialValues(behaviorId);
    }
}

describe("EndpointStore", () => {
    it("forgets the values it loaded once it is erased", async () => {
        const storage = new StorageManager(new MemoryStorageDriver());
        await storage.initialize();
        const context = storage.createContext("endpoint");
        await context.createContext("local").set("value", 1);
        const store = new InspectableEndpointStore(context);
        await store.load();

        await store.erase();

        expect(store.initialValuesOf("local")).equals(undefined);
        expect([...store.knownBehaviors]).deep.equals([]);
    });
});
