/**
 * @license
 * Copyright 2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DclBehavior } from "#behavior/system/dcl/DclBehavior.js";
import { MockEndpoint } from "../../../endpoint/mock-endpoint.js";

describe("DclBehavior", () => {
    describe("State defaults", () => {
        it("has correct default production URL", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                expect(agent.dcl.state.productionUrl).to.equal("https://on.dcl.csa-iot.org");
            });
        });

        it("has correct default test URL", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                expect(agent.dcl.state.testUrl).to.equal("https://on.test-net.dcl.csa-iot.org");
            });
        });

        it("fetchTestCertificates defaults to false", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                expect(agent.dcl.state.fetchTestCertificates).to.be.false;
            });
        });

        it("fetchGithubCertificates defaults to true", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                expect(agent.dcl.state.fetchGithubCertificates).to.be.true;
            });
        });
    });

    describe("config getters", () => {
        it("productionConfig returns DclConfig with production URL", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                const config = agent.dcl.productionConfig;
                expect(config.url).to.equal("https://on.dcl.csa-iot.org");
            });
        });

        it("testConfig returns DclConfig with test URL", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                const config = agent.dcl.testConfig;
                expect(config.url).to.equal("https://on.test-net.dcl.csa-iot.org");
            });
        });

        it("configForProduction(true) returns production config", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                const config = agent.dcl.configForProduction(true);
                expect(config.url).to.equal("https://on.dcl.csa-iot.org");
            });
        });

        it("configForProduction(false) returns test config", async () => {
            await using endpoint = await MockEndpoint.createWith(DclBehavior);
            await endpoint.act(agent => {
                const config = agent.dcl.configForProduction(false);
                expect(config.url).to.equal("https://on.test-net.dcl.csa-iot.org");
            });
        });
    });

    describe("custom state via set()", () => {
        it("overrides productionUrl", async () => {
            const CustomDcl = DclBehavior.set({ productionUrl: "https://custom.dcl" });
            await using endpoint = await MockEndpoint.createWith(CustomDcl);
            await endpoint.act(agent => {
                expect(agent.dcl.state.productionUrl).to.equal("https://custom.dcl");
                expect(agent.dcl.productionConfig.url).to.equal("https://custom.dcl");
            });
        });

        it("overrides testUrl", async () => {
            const CustomDcl = DclBehavior.set({ testUrl: "https://custom-test.dcl" });
            await using endpoint = await MockEndpoint.createWith(CustomDcl);
            await endpoint.act(agent => {
                expect(agent.dcl.state.testUrl).to.equal("https://custom-test.dcl");
                expect(agent.dcl.testConfig.url).to.equal("https://custom-test.dcl");
            });
        });

        it("overrides fetchTestCertificates", async () => {
            const CustomDcl = DclBehavior.set({ fetchTestCertificates: true });
            await using endpoint = await MockEndpoint.createWith(CustomDcl);
            await endpoint.act(agent => {
                expect(agent.dcl.state.fetchTestCertificates).to.be.true;
            });
        });

        it("overrides fetchGithubCertificates", async () => {
            const CustomDcl = DclBehavior.set({ fetchGithubCertificates: false });
            await using endpoint = await MockEndpoint.createWith(CustomDcl);
            await endpoint.act(agent => {
                expect(agent.dcl.state.fetchGithubCertificates).to.be.false;
            });
        });
    });
});
