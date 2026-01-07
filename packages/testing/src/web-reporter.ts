/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FailureDetail } from "./failure-detail.js";
import { Reporter, Stats } from "./reporter.js";

// Save these so we can avoid any trapping logic and write directly to the console
const actualConsole = console;
const actualLog = actualConsole.log;
function proxy(...args: any[]) {
    actualLog.call(actualConsole, `${WebReporter.FLAG}${JSON.stringify(args)}`);
}

/**
 * Test UI for web browsers.  Encodes each reporting method to the console.  This is a simple way to convey messages
 * from the browser to the test harness.
 */
export class WebReporter implements Reporter {
    static FLAG = "<<REPORT>> ";

    beginRun(name: string, stats?: Stats) {
        proxy("beginRun", name, stats);
    }

    beginSuite(name: string[], stats?: Stats) {
        proxy("beginSuite", name, stats);
    }

    beginTest(name: string, stats?: Stats) {
        proxy("beginTest", name, stats);
    }

    beginStep(name: string) {
        proxy("beginStep", name);
    }

    endRun(stats?: Stats) {
        proxy("endRun", stats);
    }

    failTest(name: string, detail: FailureDetail) {
        proxy("failTest", name, detail);
    }

    failRun(detail: FailureDetail) {
        proxy("failRun", detail);
    }
}
