/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclConfig, DclGithubConfig } from "#dcl/DclConfig.js";

describe("DclConfig", () => {
    it("production has correct default URL", () => {
        expect(DclConfig.production.url).to.equal("https://on.dcl.csa-iot.org");
    });

    it("test has correct default URL", () => {
        expect(DclConfig.test.url).to.equal("https://on.test-net.dcl.csa-iot.org");
    });

    it("custom config satisfies interface", () => {
        const custom: DclConfig = { url: "https://custom.dcl.local" };
        expect(custom.url).to.equal("https://custom.dcl.local");
    });
});

describe("DclGithubConfig", () => {
    it("defaults has correct owner", () => {
        expect(DclGithubConfig.defaults.owner).to.equal("project-chip");
    });

    it("defaults has correct repo", () => {
        expect(DclGithubConfig.defaults.repo).to.equal("connectedhomeip");
    });

    it("defaults has correct branch", () => {
        expect(DclGithubConfig.defaults.branch).to.equal("master");
    });

    it("defaults has correct certPath", () => {
        expect(DclGithubConfig.defaults.certPath).to.equal("credentials/development/paa-root-certs");
    });

    it("custom config satisfies interface", () => {
        const custom: DclGithubConfig = {
            owner: "my-org",
            repo: "my-repo",
            branch: "main",
            certPath: "certs/paa",
        };
        expect(custom.owner).to.equal("my-org");
        expect(custom.repo).to.equal("my-repo");
        expect(custom.branch).to.equal("main");
        expect(custom.certPath).to.equal("certs/paa");
    });
});
