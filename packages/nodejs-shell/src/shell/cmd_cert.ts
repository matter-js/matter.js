/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#general";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

export default function commands(theNode: MatterNode) {
    return {
        command: "cert",
        describe: "Certificate management operations",
        builder: (yargs: Argv) =>
            yargs
                .command(
                    ["*", "list [vendor-id]"],
                    "List all stored certificates",
                    yargs => {
                        return yargs.positional("vendor-id", {
                            describe: "Filter by vendor ID (hex format like 0xFFF1 or decimal)",
                            type: "string",
                        });
                    },
                    async argv => {
                        const { vendorId: vendorIdStr } = argv;

                        await theNode.start();
                        if (!theNode.certificateService) {
                            throw new Error("Certificate service not initialized");
                        }

                        await theNode.certificateService.construction;
                        let certificates = theNode.certificateService.getAllCertificates();

                        // Filter by vendor ID if provided
                        if (vendorIdStr) {
                            let vendorId: number;
                            if (vendorIdStr.startsWith("0x")) {
                                const hexStr = vendorIdStr.replace(/^0x/i, "");
                                vendorId = parseInt(hexStr, 16);
                            } else {
                                vendorId = parseInt(vendorIdStr, 10);
                            }

                            if (!isFinite(vendorId)) {
                                console.error(`Error: Invalid vendor ID "${vendorIdStr}"`);
                                return;
                            }
                            certificates = certificates.filter(cert => cert.vid === vendorId);
                        }

                        if (certificates.length === 0) {
                            console.log(
                                vendorIdStr
                                    ? `No certificates found for vendor ID ${vendorIdStr}.`
                                    : "No certificates found in storage.",
                            );
                            return;
                        }

                        console.log(`\nFound ${certificates.length} certificate(s):\n`);

                        certificates.forEach(cert => {
                            console.log(`Subject Key ID: ${cert.subjectKeyID}`);
                            console.log(`  Subject: ${cert.subjectAsText || cert.subject || "N/A"}`);
                            console.log("");
                        });
                    },
                )
                .command(
                    "details <subject-key-id>",
                    "Display detailed information about a certificate",
                    yargs => {
                        return yargs.positional("subject-key-id", {
                            describe: "Subject Key ID of the certificate",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { subjectKeyId } = argv;

                        await theNode.start();
                        if (!theNode.certificateService) {
                            throw new Error("Certificate service not initialized");
                        }

                        const cert = theNode.certificateService.getCertificate(subjectKeyId);
                        if (!cert) {
                            console.error(`Certificate with subject key ID ${subjectKeyId} not found`);
                            return;
                        }

                        console.log("\nCertificate Details:");
                        console.log(Diagnostic.json(cert));
                    },
                )
                .command(
                    "as-pem <subject-key-id>",
                    "Get certificate in PEM format",
                    yargs => {
                        return yargs.positional("subject-key-id", {
                            describe: "Subject Key ID of the certificate",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { subjectKeyId } = argv;
                        // Normalize subject key ID by removing colons
                        const normalizedId = subjectKeyId.replace(/:/g, "").toUpperCase();

                        await theNode.start();
                        if (!theNode.certificateService) {
                            throw new Error("Certificate service not initialized");
                        }

                        const pemCert = await theNode.certificateService.getCertificateAsPem(normalizedId);
                        console.log(pemCert);
                    },
                )
                .command(
                    "delete <subject-key-id>",
                    "Deletes a certificate from the storage",
                    yargs => {
                        return yargs.positional("subject-key-id", {
                            describe: "Subject Key ID of the certificate to delete",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { subjectKeyId } = argv;
                        // Normalize subject key ID by removing colons
                        const normalizedId = subjectKeyId.replace(/:/g, "").toUpperCase();

                        await theNode.start();
                        if (!theNode.certificateService) {
                            throw new Error("Certificate service not initialized");
                        }

                        await theNode.certificateService.deleteCertificate(normalizedId);
                        console.log(`Certificate ${subjectKeyId} deleted successfully`);
                    },
                )
                .command(
                    "update",
                    "Update certificates from DCL",
                    yargs =>
                        yargs.option("force", {
                            describe: "Force re-download and overwrite existing certificates",
                            type: "boolean",
                            default: false,
                        }),
                    async argv => {
                        const { force } = argv;
                        await theNode.start();
                        if (!theNode.certificateService) {
                            throw new Error("Certificate service not initialized");
                        }

                        console.log(`Updating certificates from DCL${force ? " (force mode)" : ""}...`);
                        await theNode.certificateService.updateCertificates(force);
                        console.log("Certificate update completed successfully");

                        const count = theNode.certificateService.getAllCertificates().length;
                        console.log(`Total certificates in storage: ${count}`);
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
