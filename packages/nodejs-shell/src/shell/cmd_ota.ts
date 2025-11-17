/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Diagnostic, Environment } from "#general";
import { OtaImageReader, PersistedFileDesignator } from "#protocol";
import { createReadStream, createWriteStream, statSync, WriteStream } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

/**
 * Parse a hex string to a number, handling optional 0x prefix.
 * Exits the process with an error if the value is invalid.
 */
function parseHexId(value: string, type: "vendor" | "product"): number {
    const hexStr = value.replace(/^0x/i, "");
    const parsed = parseInt(hexStr, 16);
    if (isNaN(parsed)) {
        console.error(`Error: Invalid ${type} ID "${value}"`);
        process.exit(1);
    }
    return parsed;
}

function createWritableStream(writeStream: WriteStream) {
    return new WritableStream({
        write(chunk) {
            return new Promise((resolve, reject) => {
                writeStream.write(chunk, (error: Error | null | undefined) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                writeStream.end((error: Error | null | undefined) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        },
    });
}

export default function commands(theNode: MatterNode) {
    return {
        command: "ota",
        describe: "OTA update operations",
        builder: (yargs: Argv) =>
            yargs
                .command(
                    "info <file>",
                    "Display OTA image information from a file or storage key",
                    yargs => {
                        return yargs.positional("file", {
                            describe:
                                "File path (with file:// prefix for absolute paths) or storage key (without prefix)",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { file } = argv;
                        const fileArg = file;

                        let updateInfo;

                        if (fileArg.startsWith("file://")) {
                            // Absolute file path outside storage
                            const filePath = fileArg.slice(7); // Remove "file://" prefix

                            // Create a Node.js readable stream and convert to Web ReadableStream
                            const nodeStream = createReadStream(filePath);
                            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

                            updateInfo = await theNode.otaService.updateInfoFromStream(webStream, fileArg);
                        } else {
                            // Read file from storage using PersistedFileDesignator
                            const fileDesignator = await theNode.otaService.fileDesignatorForUpdate(fileArg);
                            const blob = await fileDesignator.openBlob();
                            const reader = blob.stream().getReader();

                            // Parse header to get update info
                            const header = await OtaImageReader.header(reader);

                            // Create update info structure from header
                            updateInfo = {
                                vid: header.vendorId,
                                pid: header.productId,
                                softwareVersion: header.softwareVersion,
                                softwareVersionString: header.softwareVersionString,
                                payloadSize: header.payloadSize,
                                imageDigestType: header.imageDigestType,
                                imageDigest: header.imageDigest,
                                minApplicableSoftwareVersion: header.minApplicableSoftwareVersion,
                                maxApplicableSoftwareVersion: header.maxApplicableSoftwareVersion,
                                releaseNotesUrl: header.releaseNotesUrl,
                                storageKey: fileArg,
                            };
                        }

                        // Display the information in formatted JSON
                        console.log(Diagnostic.json(updateInfo));
                    },
                )
                .command(
                    "extract <file>",
                    "Extract and validate payload from an OTA image file",
                    yargs => {
                        return yargs.positional("file", {
                            describe: "Absolute path to the OTA image file",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { file } = argv as { file: string };

                        // Get crypto from the environment
                        const crypto = Environment.default.get(Crypto);

                        // Generate output filename by adding "-payload" before the extension
                        const dir = dirname(file);
                        const ext = extname(file);
                        const base = basename(file, ext);
                        const outputFile = join(dir, `${base}-payload${ext}`);

                        console.log(`Reading OTA image from: ${file}`);
                        console.log(`Extracting payload to: ${outputFile}`);

                        // Read the OTA file
                        const response = await fetch(`file://${file}`, { method: "GET" });

                        if (!response.ok) {
                            throw new Error(`Failed to read OTA file: ${response.status} ${response.statusText}`);
                        }

                        if (!response.body) {
                            throw new Error("No response body received");
                        }

                        // Create output stream for the payload
                        const writeStream = createWriteStream(outputFile);
                        const writableStream = createWritableStream(writeStream);

                        const payloadWriter = writableStream.getWriter();

                        // Extract and validate payload
                        const reader = response.body.getReader();
                        const header = await OtaImageReader.extractPayload(reader, payloadWriter, crypto);

                        console.log(`\nPayload extracted successfully!`);
                        console.log(`Vendor ID: ${Diagnostic.hex(header.vendorId, 4)}`);
                        console.log(`Product ID: 0x${Diagnostic.hex(header.productId, 4)}`);
                        console.log(`Software Version: ${header.softwareVersion}`);
                        console.log(`Software Version String: ${header.softwareVersionString}`);
                        console.log(`Payload Size: ${header.payloadSize} bytes`);
                        console.log(`Output file: ${outputFile}`);
                    },
                )
                .command(
                    "verify <file>",
                    "Verify an OTA image file (validates header and payload checksums)",
                    yargs => {
                        return yargs.positional("file", {
                            describe: "Path to the OTA image file (with file:// prefix) or storage key",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { file } = argv;
                        const fileArg = file;

                        // Get crypto from the environment
                        const crypto = Environment.default.get(Crypto);

                        console.log(`Verifying OTA image: ${fileArg}\n`);

                        let header;
                        let source: string;

                        if (fileArg.startsWith("file://")) {
                            // Absolute file path outside storage
                            const filePath = fileArg.slice(7); // Remove "file://" prefix
                            source = filePath;

                            // Create a Node.js readable stream and convert to Web ReadableStream
                            const nodeStream = createReadStream(filePath);
                            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
                            const reader = webStream.getReader();

                            // Validate the entire file (header + payload with checksums)
                            header = await OtaImageReader.file(reader, crypto);
                        } else {
                            // Storage key - read from OTA storage
                            source = `storage:${fileArg}`;
                            const fileDesignator = await theNode.otaService.fileDesignatorForUpdate(fileArg);
                            const blob = await fileDesignator.openBlob();
                            const reader = blob.stream().getReader();

                            // Validate the entire file (header + payload with checksums)
                            header = await OtaImageReader.file(reader, crypto);
                        }

                        console.log(`✓ OTA image is valid!\n`);
                        console.log(`File: ${source}`);
                        console.log(`Vendor ID: ${Diagnostic.hex(header.vendorId, 4)}`);
                        console.log(`Product ID: ${Diagnostic.hex(header.productId, 4)}`);
                        console.log(`Software Version: ${header.softwareVersion}`);
                        console.log(`Software Version String: ${header.softwareVersionString}`);
                        console.log(`Payload Size: ${header.payloadSize} bytes`);
                        console.log(`Digest Algorithm: ${header.imageDigestType}`);
                        console.log(`Digest: ${header.imageDigest}`);
                        if (header.minApplicableSoftwareVersion !== undefined) {
                            console.log(`Min Applicable Version: ${header.minApplicableSoftwareVersion}`);
                        }
                        if (header.maxApplicableSoftwareVersion !== undefined) {
                            console.log(`Max Applicable Version: ${header.maxApplicableSoftwareVersion}`);
                        }
                        if (header.releaseNotesUrl) {
                            console.log(`Release Notes: ${header.releaseNotesUrl}`);
                        }
                    },
                )
                .command(
                    "list",
                    "List downloaded OTA images in storage",
                    yargs => {
                        return yargs
                            .option("vid", {
                                alias: "vendor-id",
                                describe: "Filter by vendor ID (hex, e.g., 0xFFF1 or FFF1)",
                                type: "string",
                            })
                            .option("pid", {
                                alias: "product-id",
                                describe: "Filter by product ID (hex, e.g., 0x8000 or 8000) - requires --vid",
                                type: "string",
                            })
                            .option("mode", {
                                describe: "Filter by mode (prod or test)",
                                type: "string",
                                choices: ["prod", "test"],
                            });
                    },
                    async argv => {
                        const { vid, pid, mode } = argv;

                        // Validate filter options
                        if (pid && !vid) {
                            console.error("Error: --pid requires --vid to be specified");
                            process.exit(1);
                        }

                        // Parse vendor and product IDs from hex strings
                        const vendorId = vid ? parseHexId(vid, "vendor") : undefined;
                        const productId = pid ? parseHexId(pid, "product") : undefined;
                        const isProduction = mode ? mode === "prod" : undefined;

                        // Get list of downloaded updates
                        const updates = await theNode.otaService.find({
                            vendorId,
                            productId,
                            isProduction,
                        });

                        if (updates.length === 0) {
                            console.log("No OTA images found in storage matching the criteria.");
                            return;
                        }

                        // Display results in a table format
                        console.log(
                            `Found ${updates.length} OTA image${updates.length === 1 ? "" : "s"} in storage:\n`,
                        );
                        console.log(
                            "Filename".padEnd(35) +
                                "VID".padEnd(8) +
                                "PID".padEnd(8) +
                                "Version".padEnd(12) +
                                "Mode".padEnd(8) +
                                "Size",
                        );
                        console.log("-".repeat(100));

                        for (const update of updates) {
                            const vidHex = `0x${update.vendorId.toString(16).toUpperCase()}`;
                            const pidHex = `0x${update.productId.toString(16).toUpperCase()}`;
                            const sizeKB = (update.size / 1024).toFixed(2);

                            console.log(
                                update.filename.padEnd(35) +
                                    vidHex.padEnd(8) +
                                    pidHex.padEnd(8) +
                                    `${update.softwareVersion}`.padEnd(12) +
                                    update.mode.padEnd(8) +
                                    `${sizeKB} KB`,
                            );
                        }
                    },
                )
                .command(
                    "add <file>",
                    "Add an OTA image file to storage",
                    yargs => {
                        return yargs
                            .positional("file", {
                                describe: "Absolute path to the OTA image file",
                                type: "string",
                                demandOption: true,
                            })
                            .option("mode", {
                                describe: "Mode for the OTA file (prod or test)",
                                type: "string",
                                choices: ["prod", "test"],
                                default: "prod",
                            });
                    },
                    async argv => {
                        const { file, mode } = argv;
                        let filePath = file;
                        const isProduction = mode === "prod";

                        if (filePath.startsWith("file://")) {
                            filePath = filePath.slice(7); // Remove "file://" prefix
                        } else if (!filePath.startsWith("/")) {
                            console.error("Error: File path must be absolute or start with file://");
                            return;
                        }
                        console.log(`Reading OTA image from: ${filePath}`);

                        // Create update info from the file (validates the file)
                        let localFile = false;
                        let updateInfo;
                        if (filePath.toLowerCase().startsWith("https://")) {
                            // Remote HTTPS file
                            updateInfo = await theNode.otaService.createUpdateInfoFromFile(filePath);
                        } else {
                            // Local file - use stream
                            const nodeStream = createReadStream(filePath);
                            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
                            const fileUrl = `file://${filePath}`;
                            localFile = true;
                            updateInfo = await theNode.otaService.updateInfoFromStream(webStream, fileUrl);
                        }

                        console.log(`Validated OTA image:`);
                        console.log(`  Vendor ID: 0x${updateInfo.vid.toString(16).toUpperCase()}`);
                        console.log(`  Product ID: 0x${updateInfo.pid.toString(16).toUpperCase()}`);
                        console.log(`  Software Version: ${updateInfo.softwareVersion}`);
                        console.log(`  Software Version String: ${updateInfo.softwareVersionString}`);
                        console.log(`  Mode: ${isProduction ? "production" : "test"}`);

                        // Download (copy to storage) using the existing logic
                        let fd: PersistedFileDesignator;
                        if (localFile) {
                            const nodeStream = createReadStream(filePath);
                            const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
                            fd = await theNode.otaService.store(webStream, updateInfo, isProduction);
                        } else {
                            fd = await theNode.otaService.downloadUpdate(updateInfo, isProduction);
                        }

                        console.log(`\nOTA image added to storage successfully: ${fd.text}`);
                    },
                )
                .command(
                    "delete [keyname]",
                    "Delete OTA image(s) from storage",
                    yargs => {
                        return yargs
                            .positional("keyname", {
                                describe: "Storage key name to delete",
                                type: "string",
                            })
                            .option("vid", {
                                alias: "vendor-id",
                                describe: "Delete by vendor ID (hex, e.g., 0xFFF1 or FFF1)",
                                type: "string",
                                conflicts: "keyname",
                            })
                            .option("pid", {
                                alias: "product-id",
                                describe: "Delete by product ID (hex, e.g., 0x8000 or 8000) - requires --vid",
                                type: "string",
                                requires: "vid",
                            })
                            .option("mode", {
                                describe: "Mode (prod or test) - requires --vid",
                                type: "string",
                                choices: ["prod", "test"],
                                default: "prod",
                                requires: "vid",
                            })
                            .check(argv => {
                                if (!argv.keyname && !argv.vid) {
                                    throw new Error("Either keyname or --vid must be provided");
                                }
                                if (argv.pid && !argv.vid) {
                                    throw new Error("--pid requires --vid to be specified");
                                }
                                return true;
                            });
                    },
                    async argv => {
                        const { keyname, vid, pid, mode } = argv;

                        if (keyname) {
                            // Delete by keyname
                            await theNode.otaService.delete({
                                filename: keyname,
                            });
                            console.log(`Deleted OTA image: ${keyname}`);
                        } else {
                            // Delete by vendor ID, product ID (optional), and mode
                            const vendorId = parseHexId(vid as string, "vendor");
                            const productId = pid ? parseHexId(pid, "product") : undefined;
                            const isProduction = mode === "prod";

                            const deletedCount = await theNode.otaService.delete({
                                vendorId,
                                productId,
                                isProduction,
                            });

                            if (productId !== undefined) {
                                console.log(
                                    `Deleted OTA image for VID: 0x${vendorId.toString(16).toUpperCase()}, PID: 0x${productId.toString(16).toUpperCase()}, mode: ${mode}`,
                                );
                            } else {
                                console.log(
                                    `Deleted ${deletedCount} OTA image(s) for VID: 0x${vendorId.toString(16).toUpperCase()}, mode: ${mode}`,
                                );
                            }
                        }
                    },
                )
                .command(
                    "copy <source> <target>",
                    "Copy OTA image from storage to filesystem",
                    yargs => {
                        return yargs
                            .positional("source", {
                                describe: "Storage key name OR vendor ID (if using --pid and --mode)",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("target", {
                                describe: "Target filesystem path (file or directory)",
                                type: "string",
                                demandOption: true,
                            })
                            .option("pid", {
                                alias: "product-id",
                                describe: "Product ID when source is vendor ID (hex, e.g., 0x8000 or 8000)",
                                type: "string",
                            })
                            .option("mode", {
                                describe: "Mode when using vendor/product ID (prod or test)",
                                type: "string",
                                choices: ["prod", "test"],
                            })
                            .check(argv => {
                                if ((argv.pid || argv.mode) && !(argv.pid && argv.mode)) {
                                    throw new Error("Both --pid and --mode must be provided together");
                                }
                                return true;
                            });
                    },
                    async argv => {
                        const { source, target, pid, mode } = argv;
                        const sourceArg = source;
                        const targetArg = target;

                        let keyname: string;

                        if (pid && mode) {
                            // Source is vendor ID, construct keyname
                            const vendorId = parseHexId(sourceArg, "vendor");
                            const productId = parseHexId(pid, "product");
                            const modeStr = mode as "prod" | "test";
                            keyname = `${vendorId.toString(16)}-${productId.toString(16)}-${modeStr}`;
                        } else {
                            // Source is keyname
                            keyname = sourceArg;
                        }

                        // Get file from storage
                        const fileDesignator = await theNode.otaService.fileDesignatorForUpdate(keyname);

                        // Determine target path
                        let targetPath = targetArg;
                        try {
                            const stats = statSync(targetArg);
                            if (stats.isDirectory()) {
                                // Target is a directory, use keyname as filename
                                targetPath = join(targetArg, keyname);
                            }
                        } catch {
                            // Target doesn't exist, check if parent directory exists
                            const parentDir = dirname(targetArg);
                            try {
                                const parentStats = statSync(parentDir);
                                if (parentStats.isDirectory()) {
                                    // Parent exists and is a directory, use provided targetname
                                    targetPath = targetArg;
                                } else {
                                    console.error(`Error: Parent path is not a directory: ${parentDir}`);
                                    process.exit(1);
                                }
                            } catch {
                                console.error(`Error: Parent directory does not exist: ${parentDir}`);
                                process.exit(1);
                            }
                        }

                        console.log(`Copying OTA image from storage: ${keyname}`);
                        console.log(`Target path: ${targetPath}`);

                        // Read from storage and write to filesystem
                        const blob = await fileDesignator.openBlob();
                        const reader = blob.stream().getReader();

                        const writeStream = createWriteStream(targetPath);
                        const writableStream = createWritableStream(writeStream);

                        const writer = writableStream.getWriter();

                        // Copy data
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            await writer.write(value);
                        }
                        await writer.close();

                        console.log(`OTA image copied successfully to: ${targetPath}`);
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
