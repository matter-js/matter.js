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
import { FIFO_PATH } from "../container-command-pipe.js";
import { createCommand, PythonTest, spiffy } from "../python-test.js";
import type { CertStepContext } from "./cert-context.js";
import type { LogLine } from "./log-follower.js";

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
    #log = new Array<LogLine>();

    constructor(descriptor: TestFileDescriptor, container: Container, handlers: PromptHandler[], cx: CertStepContext) {
        super(descriptor, container);
        this.#handlers = handlers;
        this.#cx = cx;
    }

    /**
     * Every line the most recent {@link invoke} saw, ready to attach to a run's evidence. The script drives the scenario
     * and reaches its own verdict, so a controller log alone records what the DUT did without what it was asked to do.
     *
     * Named unlike a {@link LogFollower}'s `lines` because it is the array itself, not a follower.
     */
    get logLines(): LogLine[] {
        return [...this.#log];
    }

    override async initializeSubject(_subject: Subject): Promise<void> {}

    override async invoke(
        subject: Subject,
        step: (title: string) => void,
        args: string[],
        uncommissioned: boolean,
    ): Promise<void> {
        // CHIP's python runner refuses to start unless the --app-pipe fifo exists; no
        // harness-managed app subject creates it in a prompt-driven run. Non-destructive so an
        // already-attached classic-harness pipe is left alone.
        await this.container.exec(["bash", "-c", `test -p ${FIFO_PATH} || mkfifo ${FIFO_PATH}`]);

        const terminal = await this.container.exec(
            await createCommand(this.descriptor, this.container, subject, args, uncommissioned),
            Terminal.Line,
            { cwd: "/tmp", stdin: true },
        );

        // The harness caches one test instance per descriptor, so a second run must not inherit the first run's lines
        this.#log = [];

        let passed = false;
        let handled = 0;
        try {
            for await (let line of terminal) {
                this.#log.push({ index: this.#log.length, at: new Date(), text: line });

                line = parseStep(line, step);

                const handler = this.#handlers.find(h => h.pattern.test(line));
                if (handler) {
                    handled++;
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
            // A script that prompts for out-of-band action runs to a verdict of its own either way, so one that never
            // prompted reached that verdict without a counterparty and proves nothing about the DUT. The diagnosis is
            // the same whether it passed or failed, so it accompanies both.
            const unprompted = this.#handlers.length && handled === 0 ? this.#unpromptedDiagnosis() : "";

            if (!passed) {
                throw new Error(`Python test exited without error but did not indicate successful test${unprompted}`);
            }

            if (unprompted) {
                throw new Error(
                    `Python test ${this.descriptor.name} reported success but nothing drove the DUT${unprompted}`,
                );
            }
        } catch (e) {
            // A handler that threw leaves the script still blocked on its own `input()` read; closing forces that read
            // to fail instead of hanging the run for the full mocha timeout. The verdict checks below the loop run once
            // the script has already exited, so for those this is a no-op.
            await terminal.close().catch(closeError => {
                console.warn("Error closing prompt-driven python test terminal:", closeError);
            });
            throw e;
        }
    }

    #unpromptedDiagnosis() {
        const patterns = this.#handlers.map(h => h.pattern.toString()).join(", ");
        return (
            "; none of its prompt handlers ever fired — check whether the script's own PICS gating (e.g. " +
            "PICS_SDK_CI_ONLY, which makes a script act as its own counterparty instead of prompting) suppressed " +
            `its prompts, or whether its prompt text no longer matches ${patterns}`
        );
    }
}
