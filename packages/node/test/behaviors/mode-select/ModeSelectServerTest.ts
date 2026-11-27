/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeSelectServer } from "#behaviors/mode-select";
import { OnOffServer } from "#behaviors/on-off";
import { ModeSelectDevice } from "#devices/mode-select";
import { Environment, LogLevel, MockStorageService, StorageService } from "@matter/general";
import { captureLog, causeMessagesOf, MockServerNode } from "@matter/node/testing";
import { Write } from "@matter/protocol";
import { Status } from "@matter/types";
import { ModeSelect } from "@matter/types/clusters/mode-select";
import { onlyStatus, writeAsController } from "../localization-write.js";

const ModeSelectWithOnOff = ModeSelectDevice.with(ModeSelectServer.with("OnOff"), OnOffServer);

function modes(...numbers: number[]) {
    return numbers.map(mode => ({ label: `Mode ${mode}`, mode, semanticTags: [] }));
}

function storedEnvironment() {
    const environment = new Environment("test");
    environment.set(StorageService, new MockStorageService(environment));
    return environment;
}

interface ModeState {
    supportedModes?: number[];
    currentMode?: number;
    startUpMode?: number | null;
    onMode?: number | null;
}

async function createNode(state: ModeState, environment?: Environment) {
    return createNodeWith(
        ModeSelectWithOnOff,
        {
            ...modeSelectState(state),
            startUpMode: state.startUpMode ?? null,
            onMode: state.onMode ?? null,
        },
        environment,
    );
}

/** Mode Select as {@link ModeSelectDevice} defines it: no OnOff feature and no StartUpMode */
async function createPlainNode(state: ModeState, environment?: Environment) {
    return createNodeWith(ModeSelectDevice, modeSelectState(state), environment);
}

function modeSelectState(state: ModeState) {
    return {
        description: "Test",
        standardNamespace: null,
        currentMode: state.currentMode ?? 0,
        supportedModes: modes(...(state.supportedModes ?? [0, 1])),
    };
}

async function createNodeWith(
    type: typeof ModeSelectDevice | typeof ModeSelectWithOnOff,
    modeSelect: Record<string, unknown>,
    environment?: Environment,
) {
    const node = await MockServerNode.createOnline(undefined, { id: "modes", environment });
    try {
        await node.add(type, { id: "select", modeSelect });
    } catch (error) {
        await node.close();
        throw error;
    }
    return node;
}

function changeToMode(node: MockServerNode, newMode: number) {
    return node.parts.get("select")!.act(agent => agent.get(ModeSelectServer).changeToMode({ newMode }));
}

function writeMode(node: MockServerNode, attributes: "startUpMode" | "onMode", value: number | null) {
    return writeAsController(
        node,
        Write(Write.Attribute({ endpoint: node.parts.get("select")!.number, cluster: ModeSelect, attributes, value })),
    );
}

function modeState(node: MockServerNode) {
    return node.parts.get("select")!.stateOf(ModeSelectServer.with("OnOff"));
}

function fallbackLines(log: ReturnType<typeof captureLog>) {
    return log.messages.filter(message => message.includes("is not in supportedModes"));
}

describe("ModeSelectServer", () => {
    // 1.9.6.5 / 1.9.6.6: "The value of this field SHALL match the Mode field of one of the entries in the
    // SupportedModes attribute."
    for (const attribute of ["startUpMode", "onMode"] as const) {
        it(`rejects a controller write of an unsupported ${attribute} with CONSTRAINT_ERROR`, async () => {
            await using node = await createNode({});

            expect(onlyStatus(await writeMode(node, attribute, 99))).equals(Status.ConstraintError);
            expect(modeState(node)[attribute]).equals(null);
        });

        // Characterization test
        it(`accepts a controller write of a supported or null ${attribute}`, async () => {
            await using node = await createNode({});

            expect(onlyStatus(await writeMode(node, attribute, 1))).equals(Status.Success);
            expect(modeState(node)[attribute]).equals(1);
            expect(onlyStatus(await writeMode(node, attribute, null))).equals(Status.Success);
            expect(modeState(node)[attribute]).equals(null);
        });
    }

    it("starts with the first supported mode when the stored CurrentMode is no longer supported", async () => {
        const environment = storedEnvironment();

        {
            await using node = await createNode({ supportedModes: [0, 1] }, environment);
            await changeToMode(node, 1);
        }

        {
            using log = captureLog(LogLevel.WARN);
            await using node = await createNode({ supportedModes: [0, 2] }, environment);
            expect(modeState(node).currentMode).equals(0);
            expect(fallbackLines(log)).length(1);
        }

        {
            using log = captureLog(LogLevel.WARN);
            await using _node = await createNode({ supportedModes: [0, 2] }, environment);
            expect(fallbackLines(log)).deep.equals([]);
        }
    });

    it("starts without OnOff and StartUpMode when the stored CurrentMode is no longer supported", async () => {
        const environment = storedEnvironment();

        {
            await using node = await createPlainNode({ supportedModes: [0, 1] }, environment);
            await changeToMode(node, 1);
        }

        {
            using log = captureLog(LogLevel.WARN);
            await using node = await createPlainNode({ supportedModes: [0, 2] }, environment);
            expect(node.parts.get("select")!.stateOf(ModeSelectServer).currentMode).equals(0);
            expect(fallbackLines(log)).length(1);
        }
    });

    // 1.9.6.5: "the CurrentMode attribute SHALL be set to the StartUpMode value, when the server is powered up"
    it("applies StartUpMode after replacing an unsupported stored CurrentMode", async () => {
        const environment = storedEnvironment();

        {
            await using node = await createNode({ supportedModes: [0, 1] }, environment);
            expect(onlyStatus(await writeMode(node, "startUpMode", 0))).equals(Status.Success);
            await changeToMode(node, 1);
        }

        {
            using log = captureLog(LogLevel.WARN);
            await using node = await createNode({ supportedModes: [2, 0] }, environment);
            expect(modeState(node).currentMode).equals(0);
            expect(fallbackLines(log)).length(1);
        }
    });

    it("refuses an application write of an unsupported CurrentMode", async () => {
        await using node = await createNode({});
        const write = async () =>
            node.parts.get("select")!.act(agent => {
                agent.get(ModeSelectServer).state.currentMode = 99;
            });

        const messages = await causeMessagesOf(write());
        expect(messages).contains("unsupported mode: 99");
        expect(modeState(node).currentMode).equals(0);
    });

    for (const attribute of ["startUpMode", "onMode"] as const) {
        it(`starts with a null ${attribute} when the stored one is no longer supported`, async () => {
            const environment = storedEnvironment();

            {
                await using node = await createNode({ supportedModes: [0, 1] }, environment);
                expect(onlyStatus(await writeMode(node, attribute, 1))).equals(Status.Success);
            }

            {
                using log = captureLog(LogLevel.WARN);
                await using node = await createNode({ supportedModes: [0, 2] }, environment);
                expect(modeState(node)[attribute]).equals(null);
                expect(fallbackLines(log)).length(1);
            }
        });
    }

    it("refuses to start without supportedModes", async () => {
        const messages = await causeMessagesOf(createNode({ supportedModes: [] }));
        expect(messages).contains("has no supportedModes");
    });

    it("logs nothing about a fallback when all stored modes are supported", async () => {
        using log = captureLog(LogLevel.WARN);

        await using _node = await createNode({ currentMode: 1, startUpMode: 0, onMode: 1 });

        expect(fallbackLines(log)).deep.equals([]);
    });
});
