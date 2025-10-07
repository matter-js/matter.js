/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Destructable, Environment, Logger, RuntimeService, type VariableService } from "#general";
import type { NodeJsEnvironment } from "./NodeJsEnvironment.js";

const logger = Logger.get("ProcessManager");

/**
 * ProcessManager watches Node.js signals SIGINT and SIGUSR2 to terminate the Matter.js runtime and trigger Matter.js
 * diagnostics respectively.  It sets the process exit code to 0 if the runtime completes without error and to 1 if the
 * runtime crashes.
 *
 * If enabled, SIGINT will perform a soft interrupt of the runtime once.  ProcessManager will not process subsequent
 * interrupts so they will result in forced exit if no other handler exists.
 *
 * {@link NodeJsEnvironment} installs a ProcessManager into the default Matter.js {@link Environment}.
 *
 * You can modify behavior by:
 *
 *   - Passing an {@link Environment} other than {@link Environment.default} to your components
 *
 *   - Disabling signal and exit code support with {@link VariableService} variables "runtime.signals" and
 *     "runtime.exitcode" respectively
 *
 *   - Destroying ProcessManager in the default environment using {@link ProcessManager.close}
 *
 *   - Subclassing ProcessManager, overriding specific functionality, and installing with {@link Environment.set}
 */
export class ProcessManager implements Destructable {
    protected runtime: RuntimeService;
    #signalHandlersInstalled = false;

    constructor(protected env: Environment) {
        this.runtime = env.get(RuntimeService);

        this.runtime.started.on(this.startListener);
        this.runtime.stopped.on(this.stopListener);
        this.runtime.crashed.on(this.crashListener);

        if (this.hasUnhandledErrorSupport) {
            process.addListener("uncaughtExceptionMonitor", event => {
                Logger.reportUnhandledError(event);
            });
        }
    }

    close() {
        this.runtime.started.off(this.startListener);
        this.runtime.stopped.off(this.stopListener);
        this.runtime.crashed.off(this.crashListener);
        this.#ignoreSignals();
    }

    [Symbol.dispose]() {
        this.close();
    }

    protected get hasSignalSupport() {
        return this.env.vars.get("runtime.signals", true);
    }

    protected get hasExitCodeSupport() {
        return this.env.vars.get("runtime.exitcode", true);
    }

    protected get hasUnhandledErrorSupport() {
        return this.env.vars.get("runtime.unhandlederrors", true);
    }

    protected startListener = () => {
        this.env.vars.use(() => {
            if (this.hasSignalSupport) {
                if (this.#signalHandlersInstalled) {
                    return;
                }

                this.installInterruptHandlers();

                process.on("SIGUSR2", this.diagnosticHandler);
                process.on("exit", this.exitHandler);

                this.#signalHandlersInstalled = true;
            } else {
                this.#ignoreSignals();
            }
        });
    };

    protected stopListener = () => {
        this.#ignoreSignals();

        if (this.hasExitCodeSupport && process.exitCode === undefined) {
            process.exitCode = 0;
        }
    };

    protected crashListener = () => {
        if (this.hasExitCodeSupport) {
            process.exitCode = 1;
        }
    };

    protected interruptHandler = () => {
        this.uninstallInterruptHandlers();
        this.installInterruptHandlers();
        this.runtime.interrupt();
    };

    protected abortHandler = () => {
        this.uninstallInterruptHandlers();

        logger.fatal("Terminating due to SIGABRT of JS runtime, diagnostics follow");
        logger.info(JSON.stringify(process.report.getReport(), undefined, 2));

        // Arbitrary code that kind of looks like standard SIGABRT exit code of -6
        process.exit(-66);
    };

    protected exitHandler = () => {
        if (process.exitCode === 13) {
            logger.error("Internal error: Premature process exit because ongoing work has stalled");
        }
    };

    protected diagnosticHandler = () => {
        this.env.diagnose();
    };

    protected installInterruptHandlers = () => {
        process.on("SIGINT", this.interruptHandler);
        process.on("SIGTERM", this.interruptHandler);
        process.on("SIGABRT", this.abortHandler);
    };

    protected uninstallInterruptHandlers = () => {
        process.off("SIGINT", this.interruptHandler);
        process.off("SIGTERM", this.interruptHandler);
        process.off("SIGABRT", this.abortHandler);
    };

    #ignoreSignals() {
        if (this.#signalHandlersInstalled) {
            this.uninstallInterruptHandlers();
            process.off("SIGUSR2", this.diagnosticHandler);
            process.off("exit", this.exitHandler);
            this.#signalHandlersInstalled = false;
        }
    }
}
