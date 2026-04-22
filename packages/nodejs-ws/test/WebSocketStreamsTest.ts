/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createReadable } from "@matter/nodejs-ws";
import { WebSocket } from "ws";

/**
 * Minimal WebSocket stub that tracks registered event listeners by name and
 * allows test code to emit events directly.
 */
class MockWebSocket {
    /** Listener sets keyed by event name */
    readonly #listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    // Required by createReadable — not inspected but must exist
    readonly readyState = WebSocket.OPEN;

    addEventListener(event: string, listener: (...args: unknown[]) => void) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event)!.add(listener);
    }

    removeEventListener(event: string, listener: (...args: unknown[]) => void) {
        this.#listeners.get(event)?.delete(listener);
    }

    /** Number of currently registered listeners for the given event. */
    listenerCount(event: string) {
        return this.#listeners.get(event)?.size ?? 0;
    }

    /** Synchronously invoke all registered listeners for the given event. */
    emit(event: string, ...args: unknown[]) {
        // Copy before iteration so that removals inside handlers are safe
        for (const listener of [...(this.#listeners.get(event) ?? [])]) {
            listener(...args);
        }
    }

    pause() {}
    resume() {}
    close() {}
}

describe("createReadable", () => {
    it("registers three event listeners on construction", () => {
        const mock = new MockWebSocket();

        createReadable(mock as unknown as WebSocket);

        expect(mock.listenerCount("message")).equals(1, "message listener");
        expect(mock.listenerCount("error")).equals(1, "error listener");
        expect(mock.listenerCount("close")).equals(1, "close listener");
    });

    it("removes all listeners when the socket fires close", () => {
        const mock = new MockWebSocket();

        createReadable(mock as unknown as WebSocket);

        mock.emit("close");

        expect(mock.listenerCount("message")).equals(0, "message listener after close");
        expect(mock.listenerCount("error")).equals(0, "error listener after close");
        expect(mock.listenerCount("close")).equals(0, "close listener after close");
    });

    it("removes all listeners when the socket fires error", () => {
        const mock = new MockWebSocket();

        createReadable(mock as unknown as WebSocket);

        mock.emit("error", { error: new Error("connection reset by peer") });

        expect(mock.listenerCount("message")).equals(0, "message listener after error");
        expect(mock.listenerCount("error")).equals(0, "error listener after error");
        expect(mock.listenerCount("close")).equals(0, "close listener after error");
    });

    it("removes all listeners when the stream is cancelled", async () => {
        const mock = new MockWebSocket();

        const stream = createReadable(mock as unknown as WebSocket);

        // cancel() calls client.close(); simulate the subsequent close event the
        // WebSocket protocol would deliver after the close handshake.
        await stream.cancel();
        mock.emit("close");

        expect(mock.listenerCount("message")).equals(0, "message listener after cancel");
        expect(mock.listenerCount("error")).equals(0, "error listener after cancel");
        expect(mock.listenerCount("close")).equals(0, "close listener after cancel");
    });

    it("does not fire listeners after close", () => {
        const mock = new MockWebSocket();
        const stream = createReadable(mock as unknown as WebSocket);

        // Close the socket first — listeners should be deregistered
        mock.emit("close");

        // A second close event must not cause any handler re-invocation or error
        expect(() => mock.emit("close")).not.throw();

        void stream; // suppress unused warning
    });
});
