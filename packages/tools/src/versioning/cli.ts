/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { commander } from "../util/commander.js";
import { Package } from "../util/package.js";
import { Progress } from "../util/progress.js";
import { Versioner } from "./versioner.js";

interface Args {
    version?: string;
    prefix?: string;
    set?: boolean;
    apply?: boolean;
    tag?: boolean;
}

export async function main(argv = process.argv) {
    const program = commander("matter-version", "Manipulate monorepo package versions.")
        .argument("[version]")
        .option("-p, --prefix <prefix>", "specify monorepo directory")
        .option("-s, --set", "sets the release version")
        .option("-a, --apply", "sets package versions to the release version")
        .option("-t, --tag", "adds git tag for release version")
        .parse(argv);

    const args = program.opts<Args>();
    args.version = program.args[0];

    const version = args.version;
    const pkg = new Package({ path: args.prefix });
    const versioner = new Versioner(pkg, version);

    const progress = new Progress();

    progress.startup(`Release ${versioner.version}`, versioner.pkg);
    if (args.set) {
        await progress.run(`Set version to ${progress.emphasize(versioner.version)}`, () => versioner.set());
    }

    if (args.apply) {
        await versioner.apply(progress);
    }

    if (args.tag) {
        await progress.run(`Tagging version ${progress.emphasize(versioner.version)}`, () => versioner.tag());
    }

    progress.close();
}
