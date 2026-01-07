/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { basename } from "node:path";
import { Subject } from "../device/subject.js";
import { BaseTest } from "../device/test.js";
import { Terminal } from "../docker/terminal.js";
import { deansify } from "../util/text.js";
import { parseStep } from "./chip-test-common.js";
import { Constants, ContainerPaths } from "./config.js";
import { PicsSource } from "./pics/source.js";

export class YamlTest extends BaseTest {
    async initializeSubject(subject: Subject) {
        const command = ["chip-tool", "pairing"];

        const { kind, passcode, discriminator, network } = subject.commissioning;

        switch (kind) {
            case "on-network":
                command.push("onnetwork-long", "0x12344321");
                break;

            case "ble-wifi":
                if (network?.kind !== "wifi") {
                    throw new Error(`Must specify WiFi network for commissioning of subject ${subject.id}`);
                }
                command.push("ble-wifi", "0x12344321", network.ssid, network.password);
                break;

            case "ble-thread":
                if (network?.kind !== "thread") {
                    throw new Error(`Must specify Thread network for commissioning of subject ${subject.id}`);
                }
                command.push("ble-wifi", "0x12344321", network.datasetHex);
                break;

            default:
                throw new Error(`Unknown commissioning method ${subject.commissioning.kind} for subject ${subject.id}`);
        }

        command.push(`${passcode}`, `${discriminator}`);

        const terminal = await this.container.exec(command, Terminal.Line);

        try {
            for await (const line of terminal) {
                MockLogger.injectExternalMessage("PAIR", line);
            }
        } catch (e) {
            throw new Error("Error pairing test app", { cause: e });
        }
    }

    async invoke(subject: Subject, step: (title: string) => void, args: string[]) {
        if (!args.includes("--PICS")) {
            args.push("--PICS", await PicsSource.install(subject.pics));
        }

        const terminal = await this.container.exec(
            [
                "python3",
                ContainerPaths.yamlRunner,
                "tests",
                basename(this.descriptor.path),
                ...Constants.YamlRunnerArgs,
                ...args,
            ],
            Terminal.Line,
        );

        let passed = false;

        for await (let line of terminal) {
            line = line.replaceAll("\r\n", "\n").replaceAll("\t", "  ");

            line = parseStep(line, step);

            if (deansify(line).match(/Test finished.+ 0 errors .+/)) {
                passed = true;
            }

            let first = true;
            for (let part of line.split("\r")) {
                if (first) {
                    first = false;
                } else {
                    part = `    ${part}`;
                }
                MockLogger.injectExternalMessage("CHIP", part);
            }
        }

        if (!passed) {
            throw new Error("Yaml test exited without error but did not indicate successful test");
        }
    }
}
