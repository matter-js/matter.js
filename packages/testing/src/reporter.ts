/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FailureDetail } from "./failure-detail.js";

export type Stats = {
    total: number;
    complete: number;
    failures: number;
};

export interface Reporter {
    beginRun(name: string, stats?: Stats, supportsSuites?: boolean): void;
    beginSuite(name: string[], stats?: Stats): void;
    beginTest(name: string, stats?: Stats): void;
    beginStep(name: string): void;
    failTest(name: string, detail: FailureDetail): void;
    endRun(stats?: Stats): void;
    failRun(detail: FailureDetail): void;
}

export interface Failure {
    suite: string[];
    test: string;
    step?: string;
    detail: FailureDetail;
}
