/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebSocketClient } from "#net/http/WebSocketClient.js";
import { NetworkError } from "#net/Network.js";

type Listener = (event: any) => void;

/**
 * A fake WebSocket that runs a scripted sequence of events in one timer callback.
 *
 * With `ws`, frames that arrive with the upgrade response are emitted before the continuation after "open" runs; a
 * script of "open" followed by "message" events reproduces that order.
 */
function scriptedWebSocket(script: Array<{ type: "open" | "error" | "close" } | { type: "message"; data: string }>) {
    return class ScriptedWebSocket implements WebSocketClient.StandardWebSocket {
        binaryType = "blob";
        readyState = 0;
        #listeners = new Map<string, Set<Listener>>();

        constructor(_url: string) {
            setTimeout(() => {
                for (const event of script) {
                    switch (event.type) {
                        case "open":
                            this.readyState = 1;
                            break;

                        case "close":
                            this.readyState = 3;
                            break;
                    }
                    this.#emit(event.type, event);
                }
            }, 0);
        }

        send() {}

        close() {
            this.readyState = 3;
        }

        addEventListener(type: string, listener: Listener) {
            let set = this.#listeners.get(type);
            if (set === undefined) {
                this.#listeners.set(type, (set = new Set()));
            }
            set.add(listener);
        }

        removeEventListener(type: string, listener: Listener) {
            this.#listeners.get(type)?.delete(listener);
        }

        #emit(type: string, event: object) {
            for (const listener of [...(this.#listeners.get(type) ?? [])]) {
                listener(event);
            }
        }
    };
}

describe("WebSocketClient", () => {
    it("delivers frames emitted before the connect continuation, in order", async () => {
        const Ctor = scriptedWebSocket([
            { type: "open" },
            { type: "message", data: "first" },
            { type: "message", data: "second" },
            { type: "close" },
        ]);
        const { readable } = await new WebSocketClient(Ctor).connect("ws://test");

        const reader = readable.getReader();
        expect((await reader.read()).value).equals("first");
        expect((await reader.read()).value).equals("second");
        expect((await reader.read()).done).equals(true);
    });

    it("rejects when the connection fails before it opens", async () => {
        const Ctor = scriptedWebSocket([{ type: "error" }, { type: "close" }]);

        await expect(new WebSocketClient(Ctor).connect("ws://test")).rejectedWith(
            NetworkError,
            "WebSocket connection to ws://test failed",
        );
    });

    it("rejects when the connection closes before it opens", async () => {
        const Ctor = scriptedWebSocket([{ type: "close" }]);

        await expect(new WebSocketClient(Ctor).connect("ws://test")).rejectedWith(
            NetworkError,
            "WebSocket connection to ws://test failed",
        );
    });
});
