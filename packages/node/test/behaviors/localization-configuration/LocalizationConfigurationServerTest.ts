/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalizationConfigurationServer } from "#behaviors/localization-configuration";
import { ServerNode } from "#node/ServerNode.js";
import { MockServerNode } from "@matter/node/testing";

describe("LocalizationConfigurationServer", () => {
    it("lets a subclass of a derived type override the detected locale with a getter", async () => {
        class FixedLocale extends LocalizationConfigurationServer.with() {
            override get detectedLocale() {
                return "de-DE";
            }
        }

        await using node = await MockServerNode.create(
            ServerNode.RootEndpoint.with(FixedLocale.set({ supportedLocales: ["de-DE"] })),
        );

        expect(node.state.localizationConfiguration.activeLocale).equals("de-DE");
    });
});
