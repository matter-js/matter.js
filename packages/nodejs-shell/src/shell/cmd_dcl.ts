/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#general";
import { DclClient } from "@matter/protocol";
import type { Argv } from "yargs";

/**
 * Parse a VID or PID from string (supports decimal or hex with 0x prefix)
 */
function parseVidPid(value: string, fieldName: string): number {
    const num = value.startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > 0xffff) {
        throw new Error(`${fieldName} must be a valid 16-bit number`);
    }
    return num;
}

/**
 * Get DCL environment description
 */
function getDclEnv(isTest: boolean): string {
    return isTest ? "test" : "production";
}

/**
 * Create yargs positional argument configuration for VID
 */
function vidPositional() {
    return {
        describe: "Vendor ID (decimal or hex with 0x prefix)",
        type: "string" as const,
        demandOption: true,
        coerce: (value: string) => parseVidPid(value, "VID"),
    };
}

/**
 * Create yargs positional argument configuration for PID
 */
function pidPositional() {
    return {
        describe: "Product ID (decimal or hex with 0x prefix)",
        type: "string" as const,
        demandOption: true,
        coerce: (value: string) => parseVidPid(value, "PID"),
    };
}

/**
 * DCL (Distributed Compliance Ledger) query commands
 *
 * These commands allow querying the CSA DCL for Matter compliance information,
 * including root certificates, device models, and firmware versions.
 */
export default function commands() {
    return {
        command: "dcl",
        describe: "Query the CSA Distributed Compliance Ledger (DCL) for Matter compliance information",
        builder: (yargs: Argv) =>
            yargs
                .option("test", {
                    alias: "t",
                    describe: "Use test DCL network instead of production",
                    type: "boolean",
                    default: false,
                    global: true,
                })
                .command(
                    "fetch-root-certificates",
                    "Fetch list of all approved Product Attestation Authority (PAA) root certificates",
                    yargs => yargs,
                    async argv => {
                        const { test } = argv;
                        const client = new DclClient(!test);

                        try {
                            console.log(`Fetching root certificate list from ${getDclEnv(test)} DCL...`);
                            const certificates = await client.fetchRootCertificateList();
                            console.log(`Found ${certificates.length} root certificates:`);
                            console.log(JSON.stringify(certificates, null, 2));
                        } catch (error) {
                            console.error("Error fetching root certificates:", error);
                        }
                    },
                )
                .command(
                    "fetch-root-certificate <subject> <subjectKeyId>",
                    "Fetch detailed information for a specific root certificate",
                    yargs => {
                        return yargs
                            .positional("subject", {
                                describe: "Certificate subject (DN)",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("subjectKeyId", {
                                describe: "Subject key identifier",
                                type: "string",
                                demandOption: true,
                            });
                    },
                    async argv => {
                        const { subject, subjectKeyId, test } = argv;
                        const client = new DclClient(!test);

                        try {
                            console.log(`Fetching certificate details from ${getDclEnv(test)} DCL...`);
                            console.log(`Subject: ${subject}`);
                            console.log(`Subject Key ID: ${subjectKeyId}`);

                            const certificate = await client.fetchRootCertificateBySubject({
                                subject,
                                subjectKeyId,
                            });
                            console.log("Certificate details:");
                            console.log(JSON.stringify(certificate, null, 2));
                        } catch (error) {
                            console.error("Error fetching certificate:", error);
                        }
                    },
                )
                .command(
                    "fetch-model <vid> <pid>",
                    "Fetch device model information by Vendor ID and Product ID",
                    yargs => {
                        return yargs.positional("vid", vidPositional()).positional("pid", pidPositional());
                    },
                    async argv => {
                        const { vid, pid, test } = argv;
                        const client = new DclClient(!test);

                        try {
                            console.log(`Fetching model information from ${getDclEnv(test)} DCL...`);
                            console.log(`VID: ${Diagnostic.hex(vid!, 4)}`);
                            console.log(`PID: ${Diagnostic.hex(pid!, 4)}`);

                            const model = await client.fetchModelByVidPid(vid!, pid!);
                            console.log("Device model information:");
                            console.log(JSON.stringify(model, null, 2));
                        } catch (error) {
                            console.error("Error fetching model:", error);
                        }
                    },
                )
                .command(
                    "fetch-model-versions <vid> <pid>",
                    "Fetch available software versions for a device model",
                    yargs => {
                        return yargs.positional("vid", vidPositional()).positional("pid", pidPositional());
                    },
                    async argv => {
                        const { vid, pid, test } = argv;
                        const client = new DclClient(!test);

                        try {
                            console.log(`Fetching available versions from ${getDclEnv(test)} DCL...`);
                            console.log(`VID: ${Diagnostic.hex(vid!, 4)}`);
                            console.log(`PID: ${Diagnostic.hex(pid!, 4)}`);

                            const versions = await client.fetchModelVersionsByVidPid(vid!, pid!);
                            console.log(`Found ${versions.length} software version(s):`);
                            console.log(JSON.stringify(versions, null, 2));
                        } catch (error) {
                            console.error("Error fetching versions:", error);
                        }
                    },
                )
                .command(
                    "fetch-model-version <vid> <pid> <softwareVersion>",
                    "Fetch detailed information for a specific software version",
                    yargs => {
                        return yargs
                            .positional("vid", vidPositional())
                            .positional("pid", pidPositional())
                            .positional("softwareVersion", {
                                describe: "Software version number",
                                type: "number",
                                demandOption: true,
                            });
                    },
                    async argv => {
                        const { vid, pid, softwareVersion, test } = argv;
                        const client = new DclClient(!test);

                        try {
                            console.log(`Fetching version details from ${getDclEnv(test)} DCL...`);
                            console.log(`VID: ${Diagnostic.hex(vid!, 4)}`);
                            console.log(`PID: ${Diagnostic.hex(pid!, 4)}`);
                            console.log(`Software Version: ${softwareVersion}`);

                            const versionInfo = await client.fetchModelVersionByVidPidSoftwareVersion(
                                vid!,
                                pid!,
                                softwareVersion!,
                            );
                            console.log("Software version information:");
                            console.log(JSON.stringify(versionInfo, null, 2));
                        } catch (error) {
                            console.error("Error fetching version details:", error);
                        }
                    },
                )
                .demandCommand(1, "You must specify a DCL query command"),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
