/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "../../device/subject.js";
import type { Container } from "../../docker/container.js";
import { Terminal } from "../../docker/terminal.js";
import type { TestFileDescriptor } from "../../test-descriptor.js";
import { parseStep } from "../chip-test-common.js";
import { createCommand, PythonTest, spiffy } from "../python-test.js";
import type { CertStepContext } from "./cert-context.js";

/**
 * Reacts to one line of a python-wrapped CHIP test script's own stdout. `pattern` identifies a prompt
 * line — see `MatterBaseTest.wait_for_user_input` in `connectedhomeip`'s
 * `matter/testing/matter_testing.py`, which logs the prompt then blocks on a bare `input()` read — and
 * `action` reacts to it (e.g. drives a {@link CertStepContext} controller through a commissioning
 * attempt) and returns the text {@link PromptDrivenPythonTest} writes to the script's stdin to unblock
 * it.
 */
export interface PromptHandler {
    pattern: RegExp;
    action: (cx: CertStepContext, promptText: string) => Promise<string>;
}

/**
 * Runs a CHIP python test script that drives its own multi-party scenario and prompts for out-of-band
 * action instead of letting the harness commission/act on its behalf — see `TC_SC_3_5.py`'s
 * `wait_for_user_input` calls, one per CASE-handshake attempt it wants a real commissioner to make.
 *
 * Reuses {@link PythonTest}'s command construction ({@link createCommand}, so the same argument/PICS
 * rules apply) but keeps the container exec's stdin open and answers matching prompt lines through
 * `handlers` instead of running fully unattended. Commissioning happens interactively, driven by
 * `handlers` reacting to prompts, so there is no subject to pre-pair — {@link initializeSubject} is a
 * no-op.
 */
export class PromptDrivenPythonTest extends PythonTest {
    #handlers: PromptHandler[];
    #cx: CertStepContext;

    constructor(descriptor: TestFileDescriptor, container: Container, handlers: PromptHandler[], cx: CertStepContext) {
        super(descriptor, container);
        this.#handlers = handlers;
        this.#cx = cx;
    }

    override async initializeSubject(_subject: Subject): Promise<void> {}

    override async invoke(
        subject: Subject,
        step: (title: string) => void,
        args: string[],
        uncommissioned: boolean,
    ): Promise<void> {
        const terminal = await this.container.exec(
            await createCommand(this.descriptor, this.container, subject, args, uncommissioned),
            Terminal.Line,
            { cwd: "/tmp", stdin: true },
        );

        let passed = false;
        try {
            for await (let line of terminal) {
                line = parseStep(line, step);

                const handler = this.#handlers.find(h => h.pattern.test(line));
                if (handler) {
                    const answer = await handler.action(this.#cx, line);
                    await terminal.write(answer);
                }

                if (line.indexOf("Final result: PASS") !== -1) {
                    // Old format
                    passed = true;
                } else if (line.match(/\[Test\]\s+\S+\s+PASS$/)) {
                    // New format
                    passed = true;
                }

                MockLogger.injectExternalMessage("CHIP", spiffy(line));
            }
        } catch (e) {
            // A handler that threw (e.g. an unexpected commissioning outcome) leaves the script still
            // blocked on its own `input()` read; closing forces that read to fail instead of hanging
            // the run for the full mocha timeout.
            await terminal.close().catch(() => {});
            throw e;
        }

        if (!passed) {
            throw new Error("Python test exited without error but did not indicate successful test");
        }
    }
}
