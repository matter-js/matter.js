/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Progress, STATUS_ICON_FAILURE, STATUS_ICON_SKIPPED, STATUS_ICON_SUCCESS } from "@matter/tools";
import colors from "ansi-colors";
import { chip } from "./chip/chip.js";
import { InvalidPicsExpressionError, PicsExpression } from "./chip/pics/expression.js";
import { createNodejsMocha } from "./nodejs.js";
import { TestRunner } from "./runner.js";
import { TestDescriptor } from "./test-descriptor.js";

/**
 * Dump test details to the console.
 */
export function printReport(descriptor: TestDescriptor, includeDisabled?: boolean) {
    printDescriptor(descriptor, includeDisabled);
}

function printDescriptor(descriptor: TestDescriptor, includeDisabled?: boolean, prefix = "", path?: string) {
    const { members } = descriptor;
    if (!members?.length) {
        return;
    }

    let hasPrinted = false;

    for (const member of members) {
        let title = member.name;

        let submembers = member.members ?? [];

        let steps: undefined | number;
        if (submembers.length) {
            if (member.kind === "py" || member.kind === "yaml" || member.kind === "manual") {
                steps = submembers.length;
                submembers = [];
            } else {
                title = colors.bold(title);
            }
        }

        if (member.isDisabled) {
            if (!includeDisabled) {
                continue;
            }
            title = colors.dim(title);
        }

        if (member.kind === "suite") {
            if (prefix === "" && hasPrinted) {
                console.log();
            }
        } else {
            switch (member.passed) {
                case true:
                    title = `${STATUS_ICON_SUCCESS} ${title}`;
                    break;

                case false:
                    title = `${STATUS_ICON_FAILURE} ${title}`;
                    break;

                default:
                    title = `${STATUS_ICON_SKIPPED} ${title}`;
            }
        }

        if (member.durationMs !== undefined) {
            title = `${title} ${Progress.formatDuration(member.durationMs)}`;
        }

        if (member.kind !== "suite") {
            title = `${title} ${colors.cyan(member.kind)}`;
        }

        if (steps) {
            title = `${title} ${colors.cyan(`(${steps} steps)`)}`;
        }

        if (member.pics) {
            try {
                const expr = new PicsExpression(member.pics);
                if (expr.evaluate(member.picsValues ?? chip.defaultPics)) {
                    title = `${title} ${colors.dim.green(member.pics)}`;
                } else {
                    title = `${title} ${colors.dim.red(member.pics)}`;
                }
            } catch (e) {
                if (e instanceof InvalidPicsExpressionError) {
                    title = `${title} ${colors.dim.strikethrough.red(member.pics)}`;
                } else {
                    throw e;
                }
            }
        }

        if (member.path && member.path !== path) {
            let { path } = member;
            if (member.subpath) {
                path = `${path}#${member.subpath}`;
            }
            title = `${title} ${colors.dim.blueBright(path)}`;
        }

        if (member.kind === "manual") {
            title = colors.strikethrough(title);
        }

        console.log(`${prefix}${title}`);
        hasPrinted = true;

        if (submembers.length) {
            printDescriptor(member, includeDisabled, `${prefix}    `, member.path ?? path);
        }
    }
}

/**
 * Obtain a descriptor describing configured tests.
 *
 * This is the same as {@link Mocha.suite.descriptor} except it includes persisted information and unused CHIP tests if
 * loaded.
 */
export async function defaultDescriptor(runner: TestRunner) {
    const mocha = await createNodejsMocha(runner, "esm");

    let descriptor = { ...mocha.suite.descriptor };

    if (chip.isInitialized) {
        const used = new Set<TestDescriptor>();
        TestDescriptor.visit(descriptor, descriptor => {
            used.add(descriptor);
        });

        let unused = TestDescriptor.filter(chip.tests.descriptor, {
            predicate(descriptor) {
                return (descriptor.kind !== "py" && descriptor.kind !== "yaml") || !used.has(descriptor);
            },
        });

        if (unused) {
            unused = {
                ...unused,
                name: "CHIP (unused)",
            };

            TestDescriptor.visit(unused, descriptor => {
                descriptor.isDisabled = true;
            });

            descriptor = {
                ...descriptor,
                members: descriptor.members ? [...descriptor.members, unused] : [unused],
            };
        }
    }

    const previous = await TestDescriptor.open(runner.pkg.resolve(TestDescriptor.DEFAULT_FILENAME));

    descriptor = TestDescriptor.merge(previous, descriptor);

    return descriptor;
}
