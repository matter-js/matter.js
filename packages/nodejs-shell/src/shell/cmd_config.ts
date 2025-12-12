/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { DclCertificateService } from "@matter/protocol";
import { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";
import { setLogLevel } from "../app.js";

export default function commands(theNode: MatterNode) {
    return {
        command: "config",
        describe: "Manage global configuration",
        builder: (yargs: Argv) =>
            yargs
                // Console LogLevel
                .command("loglevel", "Manage Console and File LogLevels", yargs => {
                    return yargs
                        .command(
                            ["* [action]", "* [type] [ action]"],
                            "get/delete console or file log level",
                            yargs => {
                                return yargs
                                    .positional("type", {
                                        describe: "type to set the loglevel for",
                                        choices: ["console", "file"] as const,
                                        default: "console",
                                        type: "string",
                                    })
                                    .positional("action", {
                                        describe: "get/delete",
                                        choices: ["get", "delete"] as const,
                                        default: "get",
                                        type: "string",
                                    });
                            },
                            async argv => doLogLevel(theNode, argv),
                        )
                        .command(
                            "set <value>",
                            "set console log level",
                            yargs => {
                                return yargs
                                    .positional("type", {
                                        describe: "type to set the loglevel for",
                                        choices: ["console", "file"] as const,
                                        default: "console",
                                        type: "string",
                                    })
                                    .positional("value", {
                                        describe: "log level to set",
                                        type: "string",
                                        choices: ["fatal", "error", "warn", "info", "debug"] as const,
                                        demandOption: true,
                                    });
                            },
                            async argv => doLogLevel(theNode, { action: "set", ...argv }),
                        );
                })

                // LogFile name
                .command("logfile", "Manage Logfile path", yargs => {
                    return yargs
                        .command(
                            "* [action]",
                            "get/delete logfile path",
                            yargs => {
                                return yargs.positional("action", {
                                    describe: "get/delete",
                                    choices: ["get", "delete"] as const,
                                    default: "get",
                                    type: "string",
                                });
                            },
                            async argv => doLogfilePath(theNode, argv),
                        )
                        .command(
                            "set <value>",
                            "set logfile path",
                            yargs => {
                                return yargs.positional("value", {
                                    describe: "logfile path to set",
                                    type: "string",
                                    demandOption: true,
                                });
                            },
                            async argv => doLogfilePath(theNode, { action: "set", ...argv }),
                        );
                })

                // LogFile name
                .command("fabricLabel", "Manage Controller Fabric Label", yargs => {
                    return yargs
                        .command(
                            "* [action]",
                            "get Controller fabric label",
                            yargs => {
                                return yargs.positional("action", {
                                    describe: "get",
                                    choices: ["get"] as const,
                                    default: "get",
                                    type: "string",
                                });
                            },
                            async argv => doControllerFabricLabel(theNode, argv),
                        )
                        .command(
                            "set <value>",
                            "set Controller fabric label",
                            yargs => {
                                return yargs.positional("value", {
                                    describe: "Controller fabric label",
                                    type: "string",
                                    demandOption: true,
                                });
                            },
                            async argv => doControllerFabricLabel(theNode, { action: "set", ...argv }),
                        );
                })

                // BLE HCI number (Linux)
                .command("ble-hci", "Manage BLE HCI ID (Linux)", yargs => {
                    return yargs
                        .command(
                            "* [action]",
                            "get/delete BLE HCI ID of the device (Linux only)",
                            yargs => {
                                return yargs.positional("action", {
                                    describe: "get/delete",
                                    choices: ["get", "delete"] as const,
                                    default: "get",
                                    type: "string",
                                });
                            },
                            async argv => doBleHci(theNode, argv),
                        )
                        .command(
                            "set <value>",
                            "set BLE HCI ID of the device (Linux only)",
                            yargs => {
                                return yargs.positional("value", {
                                    describe: "HCI ID to set",
                                    type: "number",
                                    demandOption: true,
                                });
                            },
                            async argv => doBleHci(theNode, { action: "set", ...argv }),
                        );
                })

                // Commissioning Wi-Fi credentials
                .command("wifi-credentials", "Manage Wi-Fi credentials used in commissioning process", yargs => {
                    return yargs
                        .command(
                            "* [action]",
                            "get/set Wi-Fi credentials",
                            yargs => {
                                return yargs.positional("action", {
                                    describe: "get/delete",
                                    choices: ["get", "delete"] as const,
                                    default: "get",
                                    type: "string",
                                });
                            },
                            async argv => doWifiCredentials(theNode, argv),
                        )
                        .command(
                            "set <wifi-ssid> <wifi-password>",
                            "set Wi-Fi credentials",
                            yargs => {
                                return yargs
                                    .positional("wifi-ssid", {
                                        describe: "SSID of the Wifi network to commission",
                                        type: "string",
                                        demandOption: true,
                                    })
                                    .positional("wifi-password", {
                                        describe: "Password of the Wifi network to commission",
                                        type: "string",
                                        demandOption: true,
                                    });
                            },
                            async argv => doWifiCredentials(theNode, { action: "set", ...argv }),
                        );
                })

                // Commissioning Thread credentials
                .command("thread-credentials", "Manage Thread credentials used in commissioning process", yargs => {
                    return yargs
                        .command(
                            "* [action]",
                            "get/set thread network credentials",
                            yargs => {
                                return yargs.positional("action", {
                                    describe: "get/delete",
                                    choices: ["get", "delete"] as const,
                                    default: "get",
                                    type: "string",
                                });
                            },
                            async argv => doThreadCredentials(theNode, argv),
                        )
                        .command(
                            "set <thread-name> <thread-operational-dataset>",
                            "set thread networkcredentials",
                            yargs => {
                                return yargs
                                    .positional("thread-name", {
                                        describe: "Thread network name to commission",
                                        type: "string",
                                        demandOption: true,
                                    })
                                    .positional("thread-operational-dataset", {
                                        describe: "Thread network operational dataset to commission",
                                        type: "string",
                                        demandOption: true,
                                    });
                            },
                            argv => doThreadCredentials(theNode, { action: "set", ...argv }),
                        );
                })

                // DCL Test Certificates
                .command(
                    "dcl-test-certificates",
                    "Manage DCL test certificate fetching (production only vs. include test)",
                    yargs => {
                        return yargs
                            .command(
                                "* [action]",
                                "get/delete DCL test certificate setting",
                                yargs => {
                                    return yargs.positional("action", {
                                        describe: "get/delete",
                                        choices: ["get", "delete"] as const,
                                        default: "get",
                                        type: "string",
                                    });
                                },
                                async argv => doDclTestCertificates(theNode, argv),
                            )
                            .command(
                                "set <value>",
                                "Enable or disable test certificate fetching from DCL",
                                yargs => {
                                    return yargs.positional("value", {
                                        describe: "Enable test certificates (true/false)",
                                        type: "string",
                                        choices: ["true", "false"] as const,
                                        demandOption: true,
                                    });
                                },
                                async argv => doDclTestCertificates(theNode, { action: "set", ...argv }),
                            );
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}

async function doLogLevel(
    theNode: MatterNode,
    args: {
        action: string;
        type: string;
        value?: string;
    },
) {
    const { action, value } = args;
    const storageKey = args.type === "console" ? "LogLevel" : "LogLevelFile";
    const logtype = args.type === "console" ? "Console" : "File";
    switch (action) {
        case "get":
            console.log(`Current Loglevel for ${logtype}: ${await theNode.Store.get<string>(storageKey, "info")}`);
            break;
        case "set":
            if (value === undefined) {
                console.log(`Cannot change Loglevel for ${logtype}: New Loglevel value not provided`);
                return;
            }
            await theNode.Store.set(storageKey, value);
            console.log(`New Loglevel for ${logtype}:" ${value}"`);
            setLogLevel(args.type === "console" ? "default" : "file", value);
            break;
        case "delete":
            await theNode.Store.delete(storageKey);
            console.log(`Loglevel for ${logtype}: Reset to "info"`);
            setLogLevel(args.type === "console" ? "default" : "file", "info");
            break;
    }
}

async function doLogfilePath(
    theNode: MatterNode,
    args: {
        action: string;
        value?: string;
    },
) {
    const { action, value } = args;
    switch (action) {
        case "get":
            console.log(`Current Logfile Path: ${await theNode.Store.get<string>("LogFile", "-")}`);
            break;
        case "set":
            if (value === undefined) {
                console.log(`Cannot change Logfile path: new path not provided`);
                return;
            }
            await theNode.Store.set("LogFile", value);
            console.log(`New LogFile path:" ${value}". Please restart the shell for the changes to take effect.`);
            break;
        case "delete":
            await theNode.Store.delete("LogFile");
            console.log(`LogFile path removed. Please restart the shell for the changes to take effect.`);
            break;
    }
}

async function doControllerFabricLabel(
    theNode: MatterNode,
    args: {
        action: string;
        value?: string;
    },
) {
    const { action, value } = args;
    switch (action) {
        case "get":
            console.log(
                `Current ControllerFabricLabel: ${await theNode.Store.get<string>("ControllerFabricLabel", "matter.js Shell")}`,
            );
            break;
        case "set":
            if (value === undefined) {
                console.log(`Cannot change Controller Fabric Label: new value not provided`);
                return;
            }
            if (value.length === 0 || value.length > 32) {
                console.log(`Cannot change Controller Fabric Label: value must be between 1 and 32 characters`);
                return;
            }
            await theNode.Store.set("ControllerFabricLabel", value);
            console.log(`New Controller Fabric Label:" ${value}".`);
            await theNode.updateFabricLabel(value);
            break;
    }
}

async function doBleHci(
    theNode: MatterNode,
    args: {
        action: string;
        value?: number;
    },
) {
    const { action, value } = args;
    switch (action) {
        case "get":
            console.log(`Current BLE HCI ID: ${await theNode.Store.get<number>("BleHciId", 0)}`);
            break;
        case "set":
            if (value === undefined) {
                console.log(`Cannot change HCI ID: New HCI ID value not provided`);
                return;
            }
            await theNode.Store.set("BleHciId", value);
            console.log(`New HCI ID:" ${value}". Please restart the shell for the changes to take effect.`);
            break;
        case "delete":
            await theNode.Store.delete("BleHciId");
            console.log(`BLE HCI ID reset to default (0). Please restart the shell for the changes to take effect.`);
            break;
    }
}

async function doWifiCredentials(
    theNode: MatterNode,
    args: {
        action: string;
        wifiSsid?: string;
        wifiPassword?: string;
    },
) {
    const { action, wifiSsid, wifiPassword } = args;
    switch (action) {
        case "get":
            console.log(
                `Current Wifi-Credentials: SSID="${await theNode.Store.get<string>(
                    "WiFiSsid",
                    "-",
                )}", Password="${Logger.maskString(await theNode.Store.get<string>("WiFiPassword", ""))}"`,
            );
            break;
        case "set":
            if (wifiSsid === undefined || wifiPassword === undefined) {
                console.log(`Cannot change Wi-Fi credentials: New values not provided`);
                return;
            }
            await theNode.Store.set("WiFiSsid", wifiSsid);
            await theNode.Store.set("WiFiPassword", wifiPassword);
            console.log(
                `New Wifi-Credentials: SSID="${theNode.Store.get<string>(
                    "WiFiSsid",
                    "-",
                )}", Password="${Logger.maskString(await theNode.Store.get<string>("WiFiPassword"))}"`,
            );
            break;
        case "delete":
            await theNode.Store.delete("WiFiSsid");
            await theNode.Store.delete("WiFiPassword");
            console.log(`Wi-Fi credentials were deleted`);
            break;
    }
}

async function doThreadCredentials(
    theNode: MatterNode,
    args: {
        action: string;
        threadName?: string;
        threadOperationalDataset?: string;
    },
) {
    const { action, threadName, threadOperationalDataset } = args;
    switch (action) {
        case "get":
            console.log(
                `Current Thread network credentials: name="${await theNode.Store.get<string>(
                    "ThreadName",
                    "-",
                )}", Operational-Dataset="${Logger.maskString(
                    await theNode.Store.get<string>("ThreadOperationalDataset", ""),
                )}"`,
            );
            break;
        case "set":
            if (threadName === undefined || threadOperationalDataset === undefined) {
                console.log(`Cannot change Thread network credentials: New values not provided`);
                return;
            }
            await theNode.Store.set("ThreadName", threadName);
            await theNode.Store.set("ThreadOperationalDataset", threadOperationalDataset);
            console.log(
                `New Thread-Credentials: name="${await theNode.Store.get<string>(
                    "ThreadName",
                    "-",
                )}", OperationalDataset="${Logger.maskString(await theNode.Store.get<string>("ThreadOperationalDataset"))}"`,
            );
            break;
        case "delete":
            await theNode.Store.delete("ThreadName");
            await theNode.Store.delete("ThreadOperationalDataset");
            console.log(`Thread network credentials were deleted`);
            break;
    }
}

async function doDclTestCertificates(
    theNode: MatterNode,
    args: {
        action: string;
        value?: string;
    },
) {
    const { action, value } = args;
    switch (action) {
        case "get":
            const enabled = await theNode.Store.get<boolean>("DclFetchTestCertificates", false);
            console.log(
                `DCL test certificates: ${enabled ? "enabled (production + test + GitHub)" : "disabled (production only)"}`,
            );
            break;
        case "set":
            if (value === undefined) {
                console.log(`Cannot change DCL test certificates setting: New value not provided`);
                return;
            }
            const newValue = value === "true";
            await theNode.Store.set("DclFetchTestCertificates", newValue);

            // Close existing certificate service so it gets re-initialized with new setting
            await theNode.environment.close(DclCertificateService);

            console.log(
                `DCL test certificates: ${newValue ? "enabled (production + test + GitHub)" : "disabled (production only)"}. Please restart the shell for the changes to take effect.`,
            );
            break;
        case "delete":
            await theNode.Store.delete("DclFetchTestCertificates");

            // Close existing certificate service so it gets re-initialized with new setting
            await theNode.environment.close(DclCertificateService);

            console.log(
                `DCL test certificates setting reset to default (disabled). Please restart the shell for the changes to take effect.`,
            );
            break;
    }
}
