/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "../../src/chip/cert/cert-context.js";
import type * as PromptDrivenPythonTestModule from "../../src/chip/cert/prompt-driven-python-test.js";
import type { PromptHandler } from "../../src/chip/cert/prompt-driven-python-test.js";
import { PicsFile } from "../../src/chip/pics/file.js";
import type { Subject } from "../../src/device/subject.js";
import type { Container } from "../../src/docker/container.js";
import type { Docker } from "../../src/docker/docker.js";
import type { Terminal } from "../../src/docker/terminal.js";
import type { TestFileDescriptor } from "../../src/test-descriptor.js";
import { importModule } from "./dynamic-import.js";

// `docker.ts` pulls in dockerode, which isn't browser-bundleable; importing it only as a type keeps
// this suite's web run out of that dependency graph (mirrors cert-test.test.ts's stubDocker).
const stubDocker = {} as Docker;

async function notImplemented(..._args: unknown[]): Promise<never> {
    throw new Error("Container access is not available in this unit test");
}

/**
 * A scripted, in-memory {@link Terminal}. Lines are handed out one at a time via the async iterator;
 * `writes` records everything {@link PromptDrivenPythonTest} wrote back to its stdin.
 */
class FakeTerminal implements Terminal<string> {
    readonly writes = new Array<string>();
    closed = false;

    #lines: string[];
    #index = 0;

    constructor(lines: string[]) {
        this.#lines = lines;
    }

    async write(content: unknown): Promise<void> {
        this.writes.push(String(content));
    }

    async close(): Promise<void> {
        this.closed = true;
    }

    async consume(): Promise<string> {
        return this.#lines.join("\n");
    }

    [Symbol.asyncIterator](): AsyncIterator<string> {
        return {
            next: async (): Promise<IteratorResult<string>> => {
                if (this.#index < this.#lines.length) {
                    return { done: false, value: this.#lines[this.#index++] };
                }
                return { done: true, value: undefined };
            },
        };
    }
}

// Overloaded exactly like Container["exec"] (see container.ts) so assigning it into the fake
// Container's `exec` property needs no cast; the internal implementation signature is untyped
// (`unknown`) since only the two public overloads above it are ever type-checked at call sites.
function execOverload(command: string | string[], options?: Container.ExecOptions): Promise<void>;
function execOverload<T extends Terminal.Factory>(
    command: string | string[],
    terminal: T,
    options?: Container.ExecOptions,
): Promise<ReturnType<T>>;
async function execOverload(
    this: { terminal: FakeTerminal; commands: string[][] },
    command: string | string[],
    terminalOrOptions?: unknown,
    _options?: unknown,
): Promise<unknown> {
    this.commands.push(Array.isArray(command) ? command : [command]);
    if (typeof terminalOrOptions === "function") {
        return this.terminal;
    }
    return undefined;
}

function fakeContainer(terminal: FakeTerminal): { container: Container; commands: string[][] } {
    const commands = new Array<string[]>();

    const container: Container = {
        docker: stubDocker,
        image: Promise.resolve({ inspect: notImplemented }),
        start: notImplemented,
        kill: notImplemented,
        remove: notImplemented,
        attach: notImplemented,
        wait: notImplemented,
        exec: execOverload.bind({ terminal, commands }),
        read: notImplemented,
        follow: notImplemented,
        execAndRead: notImplemented,
        write: notImplemented,
        delete: notImplemented,
        edit: notImplemented,
        resolveGlob: notImplemented,
        createPipe: notImplemented,
    };

    return { container, commands };
}

function stubDescriptor(): TestFileDescriptor {
    return {
        name: "TC-SC-3.5",
        kind: "py",
        path: "/src/python_testing/TC_SC_3_5.py",
        subpath: "test_TC_SC_3_5",
    };
}

function stubSubject(): Subject {
    return {
        id: "stub",
        app: "all-clusters",
        commissioning: { kind: "on-network", passcode: 20202021, discriminator: 1234, qrPairingCode: "" },
        pics: new PicsFile([]),
        async initialize() {},
        async start() {},
        async stop() {},
        async close() {},
        async snapshot() {
            return {};
        },
        async restore() {},
        async backchannel() {},
    };
}

function stubCx(): CertStepContext {
    return {
        controllers: {},
        devices: {},
        recorder: {
            beginStep() {},
            check() {},
            endStep() {},
            async flush() {
                return "";
            },
        },
    };
}

// createCommand() calls PicsSource.install() (which calls container.write(), unimplemented on this
// suite's fake) unless the caller already supplied "--PICS" — passing it up front keeps every fake
// Container here needing only `exec()`.
const NO_PICS_LOOKUP_ARGS = ["--PICS", "/dev/null"];

const PASS_LINE = "[Test] test_TC_SC_3_5 PASS";

// prompt-driven-python-test.ts statically imports python-test.ts, which reaches docker/terminal.ts
// and docker/container.ts (dockerode, node:util, ...) — none of it browser-bundleable. Loaded (along
// with the docker/terminal.ts value import this suite needs directly) only via dynamic import inside
// this guard, mirroring chip-app-subject.test.ts, so the web run's static import graph never reaches
// those requires.
if (typeof window === "undefined") {
    describe("PromptDrivenPythonTest", () => {
        let PromptDrivenPythonTest: typeof PromptDrivenPythonTestModule.PromptDrivenPythonTest;

        before(async () => {
            ({ PromptDrivenPythonTest } = await importModule<typeof PromptDrivenPythonTestModule>(
                "../../src/chip/cert/prompt-driven-python-test.js",
            ));
        });

        it("calls the matching handler with the prompt line and cx, and writes its answer to stdin", async () => {
            const { container } = fakeContainer(
                new FakeTerminal([
                    "Please commission the TH_SERVER app from DUT using the Manual Pairing Code below:",
                    "  Manual Pairing Code: 3417-012-3450  (chip-tool: pairing onnetwork 1 20202021)",
                    "Input anything once commissioning has started",
                    PASS_LINE,
                ]),
            );

            const cx = stubCx();
            const calls = new Array<{ cx: CertStepContext; promptText: string }>();
            const handlers: PromptHandler[] = [
                {
                    pattern: /Manual Pairing Code:.*\(chip-tool: pairing onnetwork \d+ (\d+)\)/,
                    async action(actionCx, promptText) {
                        calls.push({ cx: actionCx, promptText });
                        return "\n";
                    },
                },
            ];

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, handlers, cx);

            await test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false);

            expect(calls).to.have.lengthOf(1);
            expect(calls[0].cx).to.equal(cx);
            expect(calls[0].promptText).to.match(/Manual Pairing Code:/);
        });

        it("writes only the matched handler's answer, and nothing for non-matching lines", async () => {
            const terminal = new FakeTerminal([
                "an ordinary log line nobody reacts to",
                "  Manual Pairing Code: 1111-222-3333  (chip-tool: pairing onnetwork 1 20202021)",
                "another ordinary log line",
                PASS_LINE,
            ]);
            const { container } = fakeContainer(terminal);

            const handlers: PromptHandler[] = [
                {
                    pattern: /Manual Pairing Code:/,
                    async action() {
                        return "\n";
                    },
                },
            ];

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, handlers, stubCx());
            await test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false);

            expect(terminal.writes).to.deep.equal(["\n"]);
        });

        it("uses the first matching handler when more than one handler's pattern matches a line", async () => {
            const terminal = new FakeTerminal(["Manual Pairing Code: 1111-222-3333", PASS_LINE]);
            const { container } = fakeContainer(terminal);

            const fired = new Array<string>();
            const handlers: PromptHandler[] = [
                {
                    pattern: /Manual Pairing Code/,
                    async action() {
                        fired.push("first");
                        return "first\n";
                    },
                },
                {
                    pattern: /Manual Pairing Code/,
                    async action() {
                        fired.push("second");
                        return "second\n";
                    },
                },
            ];

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, handlers, stubCx());
            await test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false);

            expect(fired).to.deep.equal(["first"]);
            expect(terminal.writes).to.deep.equal(["first\n"]);
        });

        it("still reports Test Step markers via the step callback (inherited parseStep behavior)", async () => {
            // TC-SC-3.5 uses alphanumeric step identifiers ("1c"), not the plain numbers most other CHIP
            // python tests use — parseStep's regex must accept both (see chip-test-common.ts).
            const terminal = new FakeTerminal([" ***** Test Step 1c : Reads the NOCs attribute", PASS_LINE]);
            const { container } = fakeContainer(terminal);

            const steps = new Array<string>();
            const test = new PromptDrivenPythonTest(stubDescriptor(), container, [], stubCx());
            await test.invoke(stubSubject(), title => steps.push(title), NO_PICS_LOOKUP_ARGS, false);

            expect(steps).to.deep.equal(["Reads the NOCs attribute"]);
        });

        it("resolves without error when the script reports the new-format PASS marker", async () => {
            const terminal = new FakeTerminal(["some output", PASS_LINE]);
            const { container } = fakeContainer(terminal);

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, [], stubCx());
            await test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false);
        });

        it("resolves without error when the script reports the old-format PASS marker", async () => {
            const terminal = new FakeTerminal(["some output", "Final result: PASS"]);
            const { container } = fakeContainer(terminal);

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, [], stubCx());
            await test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false);
        });

        it("throws when the script exits without reporting a PASS marker (inherited pass/fail parsing)", async () => {
            const terminal = new FakeTerminal(["some output", "no verdict here"]);
            const { container } = fakeContainer(terminal);

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, [], stubCx());

            await expect(test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false)).rejectedWith(
                "did not indicate successful test",
            );
        });

        it("closes the terminal and propagates a handler's error instead of hanging on the script's own input() read", async () => {
            const terminal = new FakeTerminal([
                "Manual Pairing Code: 1111-222-3333",
                "more lines the script never reaches",
            ]);
            const { container } = fakeContainer(terminal);

            const handlers: PromptHandler[] = [
                {
                    pattern: /Manual Pairing Code/,
                    async action() {
                        throw new Error("commissioning unexpectedly succeeded");
                    },
                },
            ];

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, handlers, stubCx());

            await expect(test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false)).rejectedWith(
                "commissioning unexpectedly succeeded",
            );

            expect(terminal.closed).to.equal(true);
            // The loop aborted on the handler's error, so the answer that would have unblocked the
            // script's input() read was never written.
            expect(terminal.writes).to.deep.equal([]);
        });

        it("initializeSubject() is a no-op — there is no subject to pre-pair, commissioning is interactive", async () => {
            const { container } = fakeContainer(new FakeTerminal([]));
            const test = new PromptDrivenPythonTest(stubDescriptor(), container, [], stubCx());
            await test.initializeSubject(stubSubject());
        });

        it("reuses PythonTest's own command construction (script path, --test-case subpath)", async () => {
            const terminal = new FakeTerminal([PASS_LINE]);
            const { container, commands } = fakeContainer(terminal);

            const test = new PromptDrivenPythonTest(stubDescriptor(), container, [], stubCx());
            await test.invoke(stubSubject(), () => {}, NO_PICS_LOOKUP_ARGS, false);

            expect(commands).to.have.lengthOf(2);
            const [pipeEnsure, command] = commands;
            // CHIP's python runner validates --app-pipe existence at startup, so the fifo must be
            // ensured before the script command runs
            expect(pipeEnsure.join(" ")).to.include("mkfifo /command-pipe.fifo");
            expect(command).to.include("/src/python_testing/TC_SC_3_5.py");
            expect(command).to.include("--test-case");
            expect(command).to.include("test_TC_SC_3_5");
            expect(command).to.include("--PICS");
        });
    });
}
