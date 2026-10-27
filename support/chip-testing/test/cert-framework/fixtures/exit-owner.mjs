/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Starts a server child from the module given as first argument, then leaves through process.exit() without closing
// it, as the test runner does on SIGINT or after a crash.
const [moduleUrl, entry] = process.argv.slice(2);
const { MatterServerProcess } = await import(moduleUrl);
await MatterServerProcess.start({ entry, role: "dut", env: { FAKE_SERVER_REPORT: process.env.FAKE_SERVER_REPORT } });
process.exit(0);
