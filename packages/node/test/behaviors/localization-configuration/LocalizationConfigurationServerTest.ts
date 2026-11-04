/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalizationConfigurationServer } from "#behaviors/localization-configuration";
import { ServerNode } from "#node/ServerNode.js";
import { Environment, LogLevel, MockStorageService, StorageService } from "@matter/general";
import { captureLog, causeMessagesOf, MockServerNode } from "@matter/node/testing";
import { Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { LocalizationConfiguration } from "@matter/types/clusters/localization-configuration";
import { onlyStatus, writeAsController } from "../localization-write.js";

/** Server whose detected locale does not depend on the machine running the test */
class EnglishServer extends LocalizationConfigurationServer {
    protected override get detectedLocale() {
        return "en-US";
    }
}

function rootWith(state: { supportedLocales?: string[]; activeLocale?: string } = {}) {
    return MockServerNode.RootEndpoint.with(EnglishServer.set(state));
}

function writeActiveLocale(node: MockServerNode, value: string) {
    return writeAsController(
        node,
        Write(
            Write.Attribute({
                endpoint: EndpointNumber(0),
                cluster: LocalizationConfiguration,
                attributes: "activeLocale",
                value,
            }),
        ),
    );
}

function resetLines(log: ReturnType<typeof captureLog>) {
    return log.messages.filter(message => message.includes("is not in supportedLocales"));
}

function expectOneReset(log: ReturnType<typeof captureLog>, from: string, to: string) {
    const lines = resetLines(log);
    expect(lines).length(1);
    expect(lines[0]).contains(" WARN ");
    expect(lines[0]).contains(`Active locale "${from}" is not in supportedLocales, using "${to}"`);
}

describe("LocalizationConfigurationServer", () => {
    it("defaults to the detected locale and lists it as the only supported locale", async () => {
        await using node = await MockServerNode.create(rootWith());

        expect(node.state.localizationConfiguration.activeLocale).equals("en-US");
        expect(node.state.localizationConfiguration.supportedLocales).deep.equals(["en-US"]);
    });

    it("treats an explicitly undefined SupportedLocales as unset", async () => {
        await using node = await MockServerNode.create(rootWith({ supportedLocales: undefined }));

        expect(node.state.localizationConfiguration.activeLocale).equals("en-US");
        expect(node.state.localizationConfiguration.supportedLocales).deep.equals(["en-US"]);
    });

    // 11.3.4.1: "An attempt to write a value to ActiveLocale that is not present in SupportedLocales SHALL result in a
    // CONSTRAINT_ERROR error."
    // Characterization: passes on the code before this change
    it("rejects a controller write of a locale outside SupportedLocales with CONSTRAINT_ERROR", async () => {
        await using node = await MockServerNode.createOnline(rootWith({ supportedLocales: ["en-US", "de-DE"] }));

        expect(onlyStatus(await writeActiveLocale(node, "fr-FR"))).equals(Status.ConstraintError);
        expect(node.state.localizationConfiguration.activeLocale).equals("en-US");
    });

    // Characterization: passes on the code before this change
    it("accepts a controller write of a locale in SupportedLocales", async () => {
        await using node = await MockServerNode.createOnline(rootWith({ supportedLocales: ["en-US", "de-DE"] }));

        expect(onlyStatus(await writeActiveLocale(node, "de-DE"))).equals(Status.Success);
        expect(node.state.localizationConfiguration.activeLocale).equals("de-DE");
    });

    // 11.3.4: SupportedLocales constraint "max 32[max 35]"
    it("refuses a SupportedLocales entry longer than 35 characters", async () => {
        const messages = await causeMessagesOf(
            MockServerNode.create(rootWith({ supportedLocales: ["en-US", "x".repeat(36)] })),
        );

        expect(messages).contains('Constraint "max 35"');
    });

    it("builds SupportedLocales from a configured ActiveLocale", async () => {
        await using node = await MockServerNode.create(rootWith({ activeLocale: "de-DE" }));

        expect(node.state.localizationConfiguration.activeLocale).equals("de-DE");
        expect(node.state.localizationConfiguration.supportedLocales).deep.equals(["de-DE"]);
    });

    it("replaces a configured ActiveLocale that is not in the configured SupportedLocales", async () => {
        using log = captureLog(LogLevel.WARN);

        await using node = await MockServerNode.create(
            rootWith({ activeLocale: "fr-FR", supportedLocales: ["de-DE", "en-US"] }),
        );

        expect(node.state.localizationConfiguration.activeLocale).equals("en-US");
        expectOneReset(log, "fr-FR", "en-US");
    });

    it("logs nothing about a reset on a first start without an ActiveLocale", async () => {
        using log = captureLog(LogLevel.WARN);

        await using _node = await MockServerNode.create(rootWith({ supportedLocales: ["de-DE", "fr-FR"] }));

        expect(resetLines(log)).deep.equals([]);
    });

    // 11.3.4.1: "The ActiveLocale attribute SHALL have a default value assigned by the Vendor and SHALL be a value
    // contained within the SupportedLocales attribute."
    it("starts with a supported locale when the detected locale is not in the configured SupportedLocales", async () => {
        await using node = await MockServerNode.create(rootWith({ supportedLocales: ["de-DE", "fr-FR"] }));

        expect(node.state.localizationConfiguration.activeLocale).equals("de-DE");
        expect(node.state.localizationConfiguration.supportedLocales).deep.equals(["de-DE", "fr-FR"]);
    });

    it("prefers the detected locale when it is in the configured SupportedLocales", async () => {
        await using node = await MockServerNode.create(rootWith({ supportedLocales: ["de-DE", "en-US"] }));

        expect(node.state.localizationConfiguration.activeLocale).equals("en-US");
    });

    // Characterization: passes on the code before this change
    it("keeps a written ActiveLocale across a restart", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));
        const root = rootWith({ supportedLocales: ["en-US", "de-DE"] });

        {
            await using node = await MockServerNode.createOnline(root, { id: "locale", environment });
            expect(onlyStatus(await writeActiveLocale(node, "de-DE"))).equals(Status.Success);
        }

        {
            await using node = await MockServerNode.createOnline(root, { id: "locale", environment });
            expect(node.state.localizationConfiguration.activeLocale).equals("de-DE");
        }
    });

    it("starts with a supported locale when the stored ActiveLocale is no longer in SupportedLocales", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            const root = rootWith({ supportedLocales: ["en-US", "de-DE"] });
            await using node = await MockServerNode.createOnline(root, { id: "locale", environment });
            expect(onlyStatus(await writeActiveLocale(node, "de-DE"))).equals(Status.Success);
        }

        {
            using log = captureLog(LogLevel.WARN);
            const root = rootWith({ supportedLocales: ["en-US", "fr-FR"] });
            await using node = await MockServerNode.createOnline(root, { id: "locale", environment });
            expect(node.state.localizationConfiguration.activeLocale).equals("en-US");
            expectOneReset(log, "de-DE", "en-US");
        }
    });

    it("falls back to the first supported locale when the stored one and the detected one are not listed", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            const root = rootWith({ supportedLocales: ["en-US", "de-DE"] });
            await using node = await MockServerNode.createOnline(root, { id: "locale", environment });
            expect(onlyStatus(await writeActiveLocale(node, "de-DE"))).equals(Status.Success);
        }

        {
            const root = rootWith({ supportedLocales: ["fr-FR", "it-IT"] });
            await using node = await MockServerNode.createOnline(root, { id: "locale", environment });
            expect(node.state.localizationConfiguration.activeLocale).equals("fr-FR");
        }
    });

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
