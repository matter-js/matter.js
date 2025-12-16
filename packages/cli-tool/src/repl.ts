/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Domain } from "#domain.js";
import { IncompleteError } from "#errors.js";
import { Environment, InternalError, Millis, Observable, RuntimeService, StorageService, Time } from "#general";
import { isCommand } from "#parser.js";
import colors from "ansi-colors";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { exit, stderr, stdout } from "node:process";
import { AsyncCompleter, CompleterResult, Key } from "node:readline";
import { Recoverable, REPLEval, ReplOptions, REPLServer, start } from "node:repl";
import { Context } from "node:vm";
import "./commands/index.js";
import "./providers/index.js";

/**
 * Present the user with a REPL for executing repeated commands.
 *
 * Logic related to command execution is in {@link Domain}.  This is just a terminal-based UI based on Node's
 * REPLServer.
 */
export async function repl() {
    const domain = await createDomain();
    await domain.globalsLoaded;
    stdout.write(`Welcome to ${domain.description}.  Type ${colors.bold('"help"')} for help.\n`);

    const repl = createNodeRepl(domain);
    configureInterruptHandling(repl);
    installEvaluationInputBuffer(repl);
    configureHistory(repl);
    addCompletionSupport(repl);
    instrumentReplToMaintainPrompt(repl);
    instrumentReplToAddLineProtector(repl);
    configureSpinner(repl);
}

// Maybe worth sharing spinner implementation with tools.  Maybe not
const SPINNER = "◐◓◑◒";
const SPINNER_INTERVAL = Millis(100);

// Node.js repl implementation does good stuff for us so want to keep it but we don't want the "." commands and it has
// no way to disable those.  So use this prefix as a hack to prevent it from noticing lines that start with "."
const LINE_PROTECTOR_CHAR = "\u0001";

/**
 * Create our "domain" object that manages overall CLI state.
 */
async function createDomain() {
    const description = `${colors.bold("matter.js")} ${await readPackageVersion()}`;

    const domain = await Domain({
        description,

        out(...text) {
            stdout.write(text.join(""));
        },

        err(...text) {
            let str = text.join("");
            if (str.indexOf("\x1b") === -1) {
                str = colors.red(str);
            }
            stdout.write(str);
        },

        get terminalWidth() {
            return stdout.columns;
        },

        get colorize() {
            return stdout.isTTY;
        },

        get env() {
            return Environment.default;
        },
    });

    domain.exitHandler = () => {
        exit(0);
    };

    return domain;
}

async function readPackageVersion() {
    let path = new URL(import.meta.url).pathname;
    while (dirname(path) !== path) {
        path = dirname(path);
        try {
            const pkg = await readFile(join(path, "package.json"));
            const parsed = JSON.parse(pkg.toString());
            if (typeof parsed.version === "string") {
                return parsed.version;
            }
        } catch (e) {
            if ((e as any).code === "ENOENT") {
                continue;
            }
            throw e;
        }
    }

    return "?";
}

interface KeypressEvent {
    str: string;
    key: Key;
}

interface AugmentedRepl extends REPLServer {
    // Node has an internal "domain" variable so name ours differently
    mdomain: Domain;

    // Emits when we start/stop evaluating
    evaluationModeChange: Observable<[state: boolean]>;

    // Emits when we receive input from the terminal
    keypressReceived: Observable<[event: KeypressEvent], false | void>;

    // Emits before we pass input from the terminal to readline
    keypressDelivering: Observable<[event: KeypressEvent]>;

    // Emits after we pass input from the terminal to readline
    keypressDelivered: Observable<[event: KeypressEvent]>;

    // Emits when there is output to the console
    outputDisplayed: Observable<[]>;

    // Injects data as if it was received from the terminal
    deliverKeypress(event: KeypressEvent): void;

    // Indicates whether we believe cursor is on a new line
    onNewline: boolean;

    // Indicates whether we are building a multiline command
    inMultilineCommand: boolean;

    // Indicates output is prompt related so prompt management should ignore
    updatingPrompt: boolean;
}

/**
 * Create an (augmented) node repl.
 */
function createNodeRepl(domain: Domain) {
    const repl = start({
        prompt: createPrompt(domain),
        eval: evaluate as REPLEval,
        ignoreUndefined: true,
        historySize: domain.env.vars.integer("history.size", 10000),
    } as ReplOptions) as AugmentedRepl;

    repl.mdomain = domain;
    repl.evaluationModeChange = Observable();
    repl.keypressReceived = Observable();
    repl.keypressDelivering = Observable();
    repl.keypressDelivered = Observable();
    repl.outputDisplayed = Observable();
    repl.onNewline = true;
    repl.inMultilineCommand = repl.updatingPrompt = false;

    const onkeypress = repl.input.listeners("keypress").find(listener => listener.name === "onkeypress");
    if (!onkeypress) {
        throw new InternalError("Could not identify REPL keypress listener");
    }
    repl.input.off("keypress", onkeypress as any);

    repl.deliverKeypress = (event: KeypressEvent) => {
        repl.keypressDelivering.emit(event);
        onkeypress(event.str, event.key);
        repl.keypressDelivered.emit(event);
    };

    repl.input.on("keypress", (str: string, key: Key) => {
        const event = { str, key };

        if (repl.keypressReceived.emit(event) === false) {
            return;
        }

        repl.deliverKeypress(event);
    });

    return repl;
}

/**
 * The standard "eval" callback for the node repl.
 */
function evaluate(
    this: AugmentedRepl,
    evalCmd: string,
    _context: Context,
    _file: string,
    cb: (err: Error | null, result: any) => void,
) {
    this.inMultilineCommand = false;
    this.evaluationModeChange.emit(true);

    // See comment below r.e. "realEmit".  We can't just strip first character because the line protector will
    // appear multiple times if there are multiple lines
    evalCmd = evalCmd.replace(new RegExp(LINE_PROTECTOR_CHAR, "g"), "");

    if (evalCmd.endsWith("\n")) {
        evalCmd = evalCmd.slice(0, evalCmd.length - 1);
    }
    const result: Promise<unknown> = this.mdomain.execute(evalCmd);

    const finish = (err: Error | null, result: any) => {
        cb(err, result);
        this.evaluationModeChange.emit(false);
    };

    const handleSuccess = (result: unknown) => {
        try {
            this.setPrompt(createPrompt(this.mdomain));
            if (result !== undefined) {
                this.mdomain.out(`${this.mdomain.inspect(result)}\n`);
            }
        } finally {
            finish(null, undefined);
        }
    };

    const handleError = (error: Error) => {
        this.setPrompt(createPrompt(this.mdomain));

        if (error.constructor.name === "IncompleteError") {
            this.inMultilineCommand = true;
            finish(new Recoverable((error as IncompleteError).cause as Error), undefined);
            return;
        }

        // Stack frames following our special matter-cli-* "filenames" are just cruft.  And if the first filename
        // then just remove the stack and place location at end of message
        const stack = error.stack;
        if (stack !== undefined) {
            const lines = stack.split("\n");
            let specialLoc: string | undefined;
            let specialLine;
            if ("isCliError" in error) {
                // These are thrown at the top level and should not display a stack trace
                specialLine = 1;
            } else {
                // Look for the "matter-cli-" marker which we prefix on the "filename"
                specialLine = lines.findIndex(line => {
                    const match = line.match(/at matter-cli-[a-z]+:(\d+:\d+)?/);
                    if (match) {
                        specialLoc = match[1];
                        return true;
                    }
                });
            }

            if (specialLine === 1) {
                if (specialLoc) {
                    error.message += ` (${specialLoc})`;
                }
                error.stack = `${error.constructor.name}: ${error.message}`;
            } else if (specialLine !== -1) {
                error.stack = lines.slice(0, specialLine + 1).join("\n");
            }
        }

        // Display the error ourselves so is pretty and captures all details
        this.mdomain.displayError(error);

        // Do not report the error to node
        finish(null, undefined);
    };

    result.then(handleSuccess, handleError);
}

function createPrompt(domain: Domain) {
    return `${colors.dim("matter")} ${colors.yellow(domain.location.path)} ❯ `;
}

/**
 * Bypass Node's interrupt handling and install our own.
 */
function configureInterruptHandling(repl: AugmentedRepl) {
    repl.keypressReceived.on(event => {
        // Ignore anything other than ctrl-c
        if (!event.key.ctrl || event.key.name !== "c") {
            return;
        }

        // This is the same mechanism used by real SIGINTs so behavior is uniform
        repl.mdomain.env.get(RuntimeService).interrupt();

        // Do not pass ctrl-c to readline/REPLServer; this disables its interrupt handling
        return false;
    });

    let evaluating = false;
    repl.evaluationModeChange.on(mode => {
        evaluating = mode;
    });

    // Interrupt handling is largely handled within the domain but when taking user input we need to handle it
    repl.mdomain.interrupted.on(() => {
        if (evaluating || (!repl.inMultilineCommand && repl.line === "")) {
            return;
        }

        repl.inMultilineCommand = false;
        repl.clearBufferedCommand();
        (repl as any).line = "";

        repl.updatingPrompt = true;
        stdout.write("\n");
        repl.displayPrompt();
        repl.updatingPrompt = false;

        return false;
    });
}

/**
 * If we just use readline's "pause" then it eats control-c so we can't interrupt.
 *
 * So instead just buffer events ourselves during evaluation.  This installs after the ctrl-c handler
 */
function installEvaluationInputBuffer(repl: AugmentedRepl) {
    let buffering = false;
    const buffer = Array<KeypressEvent>();

    repl.evaluationModeChange.on(mode => {
        if (mode) {
            buffering = true;
        } else {
            for (let event = buffer.shift(); event; event = buffer.shift()) {
                repl.deliverKeypress(event);
            }
            buffering = false;
        }
    });

    repl.keypressReceived.on(event => {
        if (!buffering) {
            return;
        }

        buffer.push(event);
        return false;
    });
}

/**
 * Configure history support.
 */
function configureHistory(repl: AugmentedRepl) {
    let historyPath = repl.mdomain.env.vars.string("history.path");
    if (historyPath === undefined) {
        const storagePath = repl.mdomain.env.get(StorageService).location;
        if (storagePath === undefined) {
            historyPath = join(homedir(), ".matter-cli-history");
        } else {
            historyPath = join(storagePath, "cli-history");
        }
    }

    repl.setupHistory(historyPath, error => {
        if (error) {
            console.error(error);
            exit(1);
        }
    });
}

/**
 * Add completion for commands, paths and expressions.
 *
 * TODO - this completion is not yet all that complete
 */
function addCompletionSupport(repl: AugmentedRepl) {
    const nodeCompleter = repl.completer;

    const complete: AsyncCompleter = (line, callback) => {
        findCompletions(line).then(result => {
            if (result) {
                callback(null, result);
            } else {
                (nodeCompleter as any) /* TS bug */
                    .call(repl, line, callback);
            }
        }, callback);
    };

    Object.defineProperty(repl, "completer", { value: complete, configurable: true, writable: true });

    async function findCompletions(line: string): Promise<undefined | CompleterResult> {
        if (line.endsWith("/") ? !isCommand(line.slice(0, line.length - 1)) : !isCommand(line)) {
            return;
        }

        const possiblePath = line.replace(/^.*\s/u, "");
        if (!possiblePath.match(/^[/0-9\p{L}$_%]*$/u)) {
            return;
        }

        const pathsToSearch = Array<string>();

        const slashPos = possiblePath.lastIndexOf("/");
        let partial;
        if (slashPos === -1) {
            pathsToSearch.push("");
            pathsToSearch.push("/bin");
            partial = possiblePath;
        } else {
            pathsToSearch.push(possiblePath.slice(0, slashPos));
            partial = possiblePath.slice(slashPos + 1);
        }

        const completions = Array<string>();

        for (const path of pathsToSearch) {
            const location = await repl.mdomain.location.maybeAt(path);
            if (location?.kind !== "directory") {
                continue;
            }

            completions.push(...(await location.paths).filter(path => path.startsWith(partial)));
        }

        return [completions.sort(), partial];
    }
}

/**
 * Hook output streams so we can ensure output doesn't overwrite the prompt.
 */
function instrumentReplToMaintainPrompt(repl: AugmentedRepl) {
    if (!stdout.isTTY) {
        return;
    }

    let evaluating = false;
    let promptHidden = false;
    let emitting = false;

    instrumentStdStream(stdout);
    instrumentStdStream(stderr);

    repl.keypressDelivering.on(() => {
        repl.updatingPrompt = true;
        restorePrompt();
    });

    repl.keypressDelivered.on(() => {
        repl.updatingPrompt = false;
    });

    repl.evaluationModeChange.on(mode => {
        evaluating = mode;
    });

    function instrumentStdStream(stream: NodeJS.WriteStream) {
        const actualWrite = stream.write.bind(stream);
        stream.write = (payload: Uint8Array | string, ...params: any[]) => {
            // Doesn't catch cursor movement from ANSI codes but worse case we end up with a blank line
            repl.onNewline = payload[payload.length - 1] === "\n" || payload[payload.length - 1] === "\r";

            if (!evaluating && !promptHidden && !repl.updatingPrompt && !emitting) {
                promptHidden = true;
                stdout.cursorTo(0);
                stdout.clearLine(0);
                queueMicrotask(restorePrompt);
                repl.onNewline = true;
            }

            if (!emitting) {
                emitting = true;
                try {
                    repl.outputDisplayed.emit();
                } finally {
                    emitting = false;
                }
            }

            return actualWrite(payload, ...params);
        };
    }

    function restorePrompt() {
        if (!promptHidden) {
            return;
        }

        if (!repl.onNewline) {
            stdout.write("\n");
        }

        repl?.displayPrompt(true);
        promptHidden = false;
    }
}

/**
 * Inject our janky little line prefix that prevents node from processing "dot" commands.
 */
function instrumentReplToAddLineProtector(repl: REPLServer) {
    const realEmit = repl.emit as (event: string, ...args: unknown[]) => boolean;
    repl.emit = (event: string, ...args: any[]) => {
        if (event === "line") {
            args[0] = `${LINE_PROTECTOR_CHAR}${args[0]}`;
        }
        return realEmit.call(repl, event, ...args);
    };
}

/**
 * Just wouldn't be complete without it.
 */
function configureSpinner(repl: AugmentedRepl) {
    let spinnerVisible = false;
    let spinnerPhase = 0;
    const spinner = Time.getPeriodicTimer("cli-spinner", SPINNER_INTERVAL, spin);

    function spin() {
        if (!repl.onNewline) {
            repl.mdomain.out("\n");
        }
        if (spinnerVisible) {
            stdout.cursorTo(0);
            stdout.clearLine(0);
        }
        stdout.write(colors.yellow("  " + SPINNER[spinnerPhase % SPINNER.length]));
        stdout.cursorTo(0);
        repl.onNewline = true;
        spinnerPhase++;
        spinnerVisible = true;
    }

    repl.evaluationModeChange.on(mode => {
        if (mode) {
            spinner.start();
        } else {
            spinner.stop();
            spinnerVisible = false;
        }
    });

    repl.outputDisplayed.on(() => {
        if (!spinnerVisible) {
            return;
        }

        const onNewline = repl.onNewline;
        stdout.clearLine(1);
        repl.onNewline = onNewline;
    });
}
