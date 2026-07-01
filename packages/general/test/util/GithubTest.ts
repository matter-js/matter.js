/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Github } from "#util/Github.js";
import { MockFetch } from "#util/MockFetch.js";

describe("Github", () => {
    describe("HttpError", () => {
        it("flags GitHub rate-limit statuses", () => {
            expect(new Github.HttpError("x", 403).isRateLimit).equal(true);
            expect(new Github.HttpError("x", 429).isRateLimit).equal(true);
        });

        it("does not flag other statuses as rate limit", () => {
            expect(new Github.HttpError("x", 404).isRateLimit).equal(false);
            expect(new Github.HttpError("x", 500).isRateLimit).equal(false);
        });
    });

    it("throws HttpError carrying the status on non-200 responses", async () => {
        const fetchMock = new MockFetch();
        fetchMock.addResponse("api.github.com", {}, { status: 403 });
        fetchMock.install();
        try {
            const repo = new Github.Repo("owner", "repo", "main");

            let caught: unknown;
            try {
                await repo.ls();
            } catch (error) {
                caught = error;
            }

            expect(caught).instanceof(Github.HttpError);
            if (caught instanceof Github.HttpError) {
                expect(caught.statusCode).equal(403);
                expect(caught.isRateLimit).equal(true);
            }
        } finally {
            fetchMock.uninstall();
        }
    });
});
