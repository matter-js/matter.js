/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Chai from "chai";
import "chai-as-promised";
import type { DiffMarker } from "./chai.js";
import type { DiagnosticMessageLike, MockLogger } from "./mocks/logging.js";
import type { MockTime } from "./mocks/time.js";
import type { TestDescriptor, TestSuiteDescriptor } from "./test-descriptor.js";

declare global {
    // Expose Chai globally
    const expect: typeof Chai.expect & {
        // Ignores for purposes of deep comparison
        IGNORE: DiffMarker;

        // Matches any bigint for purposes of deep comparison
        BIGINT: DiffMarker;

        // Matches any byte array for purposes of deep comparison
        BYTES: DiffMarker;

        // Matches any number for purposes of deep comparison
        NUMBER: DiffMarker;

        // Matches any string for purposes of deep comparison
        STRING: DiffMarker;
    };

    // Expose API for controlling time
    let MockTime: MockTime;

    // Expose API for controlling logging
    let MockLogger: MockLogger;

    /**
     * If present, the following hooks are engaged by matter.js packages to enable mocking.  We use globals rather than
     * imports so we can hook the modules regardless of whether they're loaded as CommonJS or ESM.
     */
    let MatterHooks:
        | undefined
        | {
              /**
               * Abort test run.
               */
              interrupt(): void;

              /**
               * Set boot manager.
               */
              bootSetup(boot: { reboot(): void | Promise<void> }): void;

              /**
               * Configure time.
               */
              timeSetup?: (Time: any) => void;

              /**
               * Configure logging.
               */
              loggerSetup?: (Logger: any) => void;

              /**
               * Receive intercepted log messages.
               */
              loggerSink?: (text: string, message: DiagnosticMessageLike) => void;

              /**
               * Extract error details.
               */
              messageAndStackFor?: (
                  error: unknown,
                  parentStack?: string[],
              ) => { message: string; id?: string; stack?: string; stackLines?: string[] };
          };

    namespace Mocha {
        interface Suite {
            readonly descriptor: TestSuiteDescriptor;
        }

        interface Test {
            descriptor: TestDescriptor;
        }
    }
}
