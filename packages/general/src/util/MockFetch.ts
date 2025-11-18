/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Callable } from "./Function.js";

/**
 * Mock fetch response configuration
 */
export interface FetchMockResponse {
    url: string | RegExp;
    responseData: any;
    options?: FetchMockResponseOptions;
}

/**
 * Options for adding a mock response
 */
export interface FetchMockResponseOptions {
    status?: number;
    binary?: boolean;
}

/**
 * Call log entry
 */
export interface FetchCallLogEntry {
    url: string;
    options: any;
}

/**
 * Mock implementation of the global fetch API for testing purposes.
 *
 * This class allows you to intercept and mock fetch calls made during tests,
 * making it possible to test code that makes HTTP requests without actually
 * hitting real endpoints.
 *
 * @example
 * ```typescript
 * const fetchMock = new MockFetch();
 * fetchMock.addResponse("/api/data", { result: "success" });
 * fetchMock.install();
 *
 * // Your code that calls fetch("/api/data") will now receive the mocked response
 *
 * fetchMock.uninstall();
 * ```
 */
export class MockFetch extends Callable<any, any> {
    private responses: FetchMockResponse[] = [];
    private originalFetch: typeof globalThis.fetch;
    private callLog: FetchCallLogEntry[] = [];
    private installed = false;

    constructor() {
        super((url, options) => this.mockFetch(url, options));
        this.originalFetch = globalThis.fetch;
    }

    /**
     * Add a mock response for a specific URL pattern.
     *
     * @param urlPattern - String or RegExp to match against request URLs
     * @param responseData - Data to return (will be serialized to JSON or returned as binary)
     * @param options - Optional configuration for status code and binary responses
     */
    addResponse(urlPattern: string | RegExp, responseData: any, options?: FetchMockResponseOptions) {
        this.responses.push({
            url: urlPattern,
            responseData,
            options,
        });
    }

    /**
     * Install this mock as the global fetch implementation.
     * Must be called before the code under test executes fetch calls.
     */
    install() {
        if (this.installed) {
            throw new Error("MockFetch is already installed");
        }
        globalThis.fetch = this.mockFetch.bind(this) as any;
        this.installed = true;
    }

    /**
     * Restore the original fetch implementation and clear all mocks.
     */
    uninstall() {
        if (!this.installed) {
            return;
        }
        globalThis.fetch = this.originalFetch;
        this.installed = false;
        this.responses = [];
        this.callLog = [];
    }

    /**
     * Get a log of all fetch calls that were made.
     * Useful for verifying that expected requests were made.
     *
     * @returns Array of call log entries with URL and options
     */
    getCallLog(): FetchCallLogEntry[] {
        return this.callLog;
    }

    /**
     * Clear all registered mock responses.
     */
    clearResponses() {
        this.responses = [];
    }

    /**
     * Clear the call log.
     */
    clearCallLog() {
        this.callLog = [];
    }

    /**
     * Clear both responses and call log.
     */
    clear() {
        this.clearResponses();
        this.clearCallLog();
    }

    /**
     * Internal mock fetch implementation.
     */
    private async mockFetch(url: string | URL, options?: any): Promise<Response> {
        const urlString = url.toString();
        this.callLog.push({ url: urlString, options });

        // Check mocks in reverse order (most recently added first, which are usually most specific)
        for (let i = this.responses.length - 1; i >= 0; i--) {
            const mock = this.responses[i];
            const matches = typeof mock.url === "string" ? urlString.includes(mock.url) : mock.url.test(urlString);

            if (matches) {
                // Create a fresh response for each fetch
                const status = mock.options?.status ?? 200;
                const ok = status >= 200 && status < 300;

                const response = {
                    ok,
                    status,
                    statusText: ok ? "OK" : "Error",
                    ...(mock.options?.binary
                        ? {
                              // Create a NEW ReadableStream for each fetch
                              body: new ReadableStream<Uint8Array>({
                                  start(controller) {
                                      const data =
                                          mock.responseData instanceof Uint8Array
                                              ? mock.responseData
                                              : new Uint8Array(mock.responseData);
                                      controller.enqueue(data);
                                      controller.close();
                                  },
                              }),
                              arrayBuffer: async () => {
                                  if (mock.responseData instanceof Uint8Array) {
                                      return mock.responseData.buffer;
                                  }
                                  return mock.responseData;
                              },
                          }
                        : {
                              json: async () => mock.responseData,
                              text: async () => JSON.stringify(mock.responseData),
                          }),
                };

                return response as any;
            }
        }

        // No mock found, throw error
        throw new Error(`No mock found for URL: ${urlString}`);
    }
}
