/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "@matter/general";
import { MockServerNode } from "./mock-server-node.js";

// Plugins use dynamic module loading which is not available in web builds
if (typeof window === "undefined") {
    function nodeWithPlugins(plugins: string) {
        const environment = new Environment("test");
        environment.vars.set("plugins", plugins);
        return MockServerNode.create({ environment });
    }

    function nodeWithNodeScopedPlugins(plugins: string) {
        const environment = new Environment("test");
        // Simulate MATTER_NODES_NODE0_PLUGINS=... (node ID defaults to "node0")
        environment.vars.set("nodes.node0.plugins", plugins);
        return MockServerNode.create({ environment });
    }

    describe("Plugins", () => {
        it("installs *Server behavior via shortcut", async () => {
            const node = await nodeWithPlugins("@matter/test-plugins/behavior-plugin.js");

            expect(node.behaviors.supported["test-plugin"]).exist;
            await node.close();
        });

        it("installs behavior via install function", async () => {
            const node = await nodeWithPlugins("@matter/test-plugins/install-plugin.js");

            expect(node.behaviors.supported["installed-via-plugin"]).exist;
            await node.close();
        });

        it("installs multiple *Server behaviors from one module", async () => {
            const node = await nodeWithPlugins("@matter/test-plugins/ambiguous-plugin.js");

            expect(node.behaviors.supported["ambiguous-a"]).exist;
            expect(node.behaviors.supported["ambiguous-b"]).exist;
            await node.close();
        });

        it("supports node-scoped plugin variables", async () => {
            const node = await nodeWithNodeScopedPlugins("@matter/test-plugins/behavior-plugin.js");

            expect(node.behaviors.supported["test-plugin"]).exist;
            await node.close();
        });

        it("merges global and node-scoped plugins", async () => {
            const environment = new Environment("test");
            environment.vars.set("plugins", "@matter/test-plugins/behavior-plugin.js");
            environment.vars.set("nodes.node0.plugins", "@matter/test-plugins/install-plugin.js");
            const node = await MockServerNode.create({ environment });

            expect(node.behaviors.supported["test-plugin"]).exist;
            expect(node.behaviors.supported["installed-via-plugin"]).exist;
            await node.close();
        });

        it("deduplicates plugins across global and node-scoped", async () => {
            const environment = new Environment("test");
            environment.vars.set("plugins", "@matter/test-plugins/behavior-plugin.js");
            environment.vars.set("nodes.node0.plugins", "@matter/test-plugins/behavior-plugin.js");

            // Should not error from double-loading
            const node = await MockServerNode.create({ environment });
            expect(node.behaviors.supported["test-plugin"]).exist;
            await node.close();
        });
    });
}
