/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackchannelCommand, CommandPipe } from "@matter/testing";
import { access, writeFile } from "node:fs/promises";
import { NamedPipeCommandHandler } from "../src/NamedPipeCommandHandler.js";

describe("NamedPipeCommandHandler", () => {
    it("keeps receiving commands after a writer closes the FIFO", async () => {
        const received = new Array<string>();
        let notify = () => {};
        const handler = new NamedPipeCommandHandler(
            {
                backchannel(command: BackchannelCommand) {
                    received.push(command.name);
                    notify();
                },
            },
            CommandPipe.filenameFor(`handler-test-${Math.random().toString(36).slice(2)}`),
        );

        async function send(name: string) {
            const arrived = new Promise<void>(resolve => (notify = resolve));
            await writeFile(handler.filename, JSON.stringify({ Name: name }));
            await arrived;
        }

        await handler.initialize();
        try {
            await send("First");
            await send("Second");
        } finally {
            await handler.close();
        }

        expect(received).deep.equal(["first", "second"]);
        await access(handler.filename).then(
            () => expect.fail("FIFO still exists after close"),
            () => {},
        );
    });
});
