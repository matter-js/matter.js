#!/usr/bin/env nacho-run

// Suppress ExperimentalWarning for features like node:sqlite that are stable enough for our use
const originalEmit = process.emit;
process.emit = function (event, ...args) {
    if (event === "warning" && args[0]?.name === "ExperimentalWarning") {
        return false;
    }
    return originalEmit.call(this, event, ...args);
};

// Use dynamic imports so we can load these modules before anything else.  Do not report errors if not yet built
try {
    await (await import("../dist/esm/util/wtf.js")).wtf.initialize();
} catch (e) {
    if (e?.code !== "ERROR_MODULE_NOT_FOUND") {
        throw e;
    }
}
try {
    await (await import("../dist/esm/util/trace-unhandled.js")).traceUnhandled.initialize();
} catch (e) {
    if (e?.code !== "ERROR_MODULE_NOT_FOUND") {
        throw e;
    }
}

// Ensure test suite is compiled
await import("@nacho-iot/js-tools/bootstrap");
await (await import("@nacho-iot/js-tools")).ensureCompiled(import.meta.url);

await (await import("../dist/esm/cli.js")).main();
