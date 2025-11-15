/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#general";
import { createWriteStream, readFileSync } from "node:fs";
import readline from "node:readline";
import { Readable, Writable } from "node:stream";
import { inspect } from "node:util";
import yargs from "yargs/yargs";
import { MatterNode } from "../MatterNode.js";
import { exit } from "../app";
import { commandlineParser } from "../util/CommandlineParser.js";
import cmdAttributes from "./cmd_cluster-attributes";
import cmdCommands from "./cmd_cluster-commands";
import cmdEvents from "./cmd_cluster-events";
import cmdCommission from "./cmd_commission.js";
import cmdConfig from "./cmd_config.js";
import cmdDcl from "./cmd_dcl.js";
import cmdDiscover from "./cmd_discover.js";
import cmdIdentify from "./cmd_identify.js";
import cmdNodes from "./cmd_nodes.js";
import cmdSession from "./cmd_session.js";
import cmdSubscribe from "./cmd_subscribe.js";
import cmdTlv from "./cmd_tlv";

const MAX_HISTORY_SIZE = 1000;

function exitCommand() {
    return {
        command: "exit",
        describe: "Exit",
        builder: {},
        handler: async () => {
            console.log("Goodbye.");
            await exit();
        },
    };
}

/**
 * Class to process and dispatch shell commands.
 */
export class Shell {
    readline?: readline.Interface;
    writeStream?: NodeJS.WritableStream;

    /**
     * Construct a new Shell object.
     */
    constructor(
        public theNode: MatterNode,
        public nodeNum: number,
        public prompt: string,
        public input: Readable,
        public output: Writable,
    ) {}

    start(storageBase?: string) {
        const history = new Array<string>();
        if (storageBase !== undefined) {
            const fileName = `${storageBase}.history`;
            try {
                const historyData = readFileSync(fileName, "utf8");
                history.push(
                    ...historyData
                        .split("\n")
                        .map(line => line.trim())
                        .filter(line => line.length),
                );
                history.splice(0, -MAX_HISTORY_SIZE);
                console.log(`Loaded ${history.length} history entries from ${fileName}`);
            } catch (e) {
                if (e instanceof Error && "code" in e && e.code !== "ENOENT") {
                    process.stderr.write(`Error happened during history file read: ${e}\n`);
                }
            }
            try {
                this.writeStream = createWriteStream(fileName, { flags: "w" });
                this.writeStream.write(`${history.join("\n")}\n`);
            } catch (e) {
                process.stderr.write(`Error happened during history file write: ${e}\n`);
            }
        }
        this.readline = readline.createInterface({
            input: this.input,
            output: this.output,
            terminal: this.input === process.stdin && this.output === process.stdout,
            prompt: this.prompt,
            history: history.reverse(),
            historySize: MAX_HISTORY_SIZE,
        });
        this.readline
            .on("line", cmd => {
                cmd = cmd.trim();
                this.onReadLine(cmd)
                    .then(result => result && cmd.length && this.writeStream?.write(`${cmd}\n`))
                    .catch(e => {
                        process.stderr.write(`Read error: ${e}\n`);
                        process.exit(1);
                    });
            })
            .on("close", () => {
                try {
                    this.writeStream?.end();
                } catch (e) {
                    process.stderr.write(`Error happened during history file write: ${e}\n`);
                }
                // only exit if we are running in a terminal
                if (this.input === process.stdin && this.output === process.stdout) {
                    exit()
                        .then(() => process.exit(0))
                        .catch(e => {
                            process.stderr.write(`Close error: ${e}\n`);
                            process.exit(1);
                        });
                }
            });

        this.readline.prompt();
    }

    /**
     * Method to process a line of raw cli text input.
     *
     * @param {string} line
     */
    async onReadLine(line: string) {
        let result = true;
        if (line) {
            let args;
            try {
                args = commandlineParser(line);
            } catch (error) {
                process.stderr.write(`Error happened during command parsing: ${error}\n`);
                return false;
            }
            const yargsInstance = yargs(args)
                .command([
                    cmdCommission(this.theNode),
                    cmdConfig(this.theNode),
                    cmdSession(this.theNode),
                    cmdNodes(this.theNode),
                    cmdSubscribe(this.theNode),
                    cmdIdentify(this.theNode),
                    cmdDiscover(this.theNode),
                    cmdAttributes(this.theNode),
                    cmdEvents(this.theNode),
                    cmdCommands(this.theNode),
                    cmdTlv(),
                    cmdDcl(),
                    exitCommand(),
                ])
                .command({
                    command: "*",
                    handler: argv => {
                        argv.unhandled = true;
                    },
                })
                .exitProcess(false)
                .version(false)
                .help("help")
                .scriptName("")
                .strictCommands(false)
                .strictOptions(false)
                .fail(false)
                .strict(false);
            try {
                const argv = await yargsInstance.wrap(yargsInstance.terminalWidth()).parseAsync();

                if (argv.unhandled) {
                    process.stderr.write(`Unknown command: ${line}\n`);
                    yargsInstance.showHelp();
                } else {
                    console.log("Done.");
                }
            } catch (error) {
                process.stderr.write(`Error happened during command: ${error}\n`);
                if (error instanceof Error && error.stack) {
                    const errorText = inspect(error, { depth: 10 });
                    process.stderr.write(errorText);
                    process.stderr.write("\n");
                }
                if (!(error instanceof MatterError)) {
                    yargsInstance.showHelp();
                    result = false;
                }
            }
        }
        this.readline?.prompt();
        return result;
    }
}
