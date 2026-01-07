/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Domain } from "#domain.js";
import { MaybePromise } from "#general";
import { Location } from "#location.js";
import colors from "ansi-colors";
import { Command } from "./command.js";

Command({
    usage: "[OPTION]... [PATH]...",
    description: "List properties of the current path or other paths you specify.",
    namedArgs: [
        { name: "a", description: "show hidden properties" },
        { name: "l", description: "use a long listing format" },
        { name: "d", description: "list directories themselves, not their contents" },
    ],
    restArgs: { name: "file", description: "filename to list", type: "string" },

    invoke: async function ls(args) {
        const locations = Array<DisplayLocation>();
        for (const str of args._) {
            const input = `${str}`;
            locations.push(DisplayLocation(await this.location.at(input), !!args.a, input));
        }

        const files = Array<DisplayLocation>();
        const dirs = Array<DisplayLocation>();

        if (locations.length) {
            for (const location of locations) {
                if (location.kind === "directory" && !args.d) {
                    dirs.push(location);
                } else {
                    files.push(location);
                }
            }
        } else {
            for (const basename of await DisplayLocation(this.location, !!args.a).paths) {
                files.push(DisplayLocation(await this.location.at(basename), !!args.a));
            }
        }

        let displayedSomething = false;

        if (files.length) {
            display(this, args.l, files, "");
            displayedSomething = true;
        }

        for (const dir of dirs) {
            if (displayedSomething) {
                this.out("\n");
            }
            let linePrefix;
            if (displayedSomething || dirs.length > 1) {
                this.out(dir.displayName ?? dir.basename, ":\n");
                linePrefix = "  ";
            } else {
                linePrefix = "";
            }
            display(
                this,
                args.l,
                (await Promise.all((await dir.paths).map(path => dir.at(path)))).map(location =>
                    DisplayLocation(location, !!args.a),
                ),
                linePrefix,
            );
        }
    },
});

function display(domain: Domain, long: boolean, files: DisplayLocation[], linePrefix: string) {
    if (long) {
        displayList(domain, files, linePrefix);
    } else {
        const { grid, colWidth } = gridFor(domain, files, linePrefix);
        displayGrid(domain, grid, colWidth, linePrefix);
    }
}

function displayList(domain: Domain, files: DisplayLocation[], linePrefix: string) {
    for (const location of files) {
        const { name, length } = formatName(location);

        let charsAvailable = domain.terminalWidth ?? 80;

        const { name: title, tag } = location;

        domain.out(linePrefix, name, " ", colors.dim(tag));
        charsAvailable -= length + tag.length + linePrefix.length + 1;

        let { id, summary } = location;

        if (id !== undefined) {
            id = `#${id}`;
            domain.out(colors.dim(id));
            charsAvailable -= id.length + 1;
        }

        if (title) {
            domain.out(' "', colors.cyan(title), '"');
            charsAvailable -= title.length + 3;
        }

        if (summary !== undefined && charsAvailable > 10) {
            domain.out(" ");
            charsAvailable -= 1;

            summary = summary.split("\n")[0].trim();
            if (summary.length > charsAvailable) {
                summary = summary.slice(0, charsAvailable - 1) + "…";
            }

            domain.out(summary);
        }
        domain.out("\n");
    }
}

function gridFor(domain: Domain, files: DisplayLocation[], linePrefix: string) {
    const columns = (domain.terminalWidth ?? 80) - linePrefix.length;

    // Maximum width of columns + 1 for special char and +2 for between columns
    const maxWidth = maxWidthOf(files) + 3;

    let colCount = Math.floor(columns / maxWidth);
    if (colCount === 0) {
        colCount = 1;
    }

    const rowCount = Math.ceil(files.length / colCount);

    const grid = Array<DisplayLocation[]>();

    for (let i = 0; i < files.length; i++) {
        const colNum = Math.floor(i / rowCount);
        const rowNum = i - colNum * rowCount;
        (grid[rowNum] ??= [])[colNum] = files[i];
    }

    const colWidth = Math.floor(columns / colCount);

    return { grid, colWidth };
}

function displayGrid(domain: Domain, grid: Array<DisplayLocation[]>, colWidth: number, linePrefix: string) {
    for (const row of grid) {
        domain.out(linePrefix);
        for (const location of row) {
            const { name, length } = formatName(location);
            domain.out(name, "".padStart(colWidth - length));
        }
        domain.out("\n");
    }
}

function formatName(location: DisplayLocation) {
    const name = location.displayName ?? location.basename;
    const length = name.length;

    if (location.kind === "directory") {
        return { name: `${colors.blue(name)}/`, length: length + 1 };
    }

    if (location.kind === "command") {
        return { name: `${colors.green(name)}*`, length: length + 1 };
    }

    if (location.tag === "constructor") {
        return { name: `${colors.green.bold(name)}*`, length: length + 1 };
    }

    if (location.tag === "event") {
        return { name: `${colors.yellow(name)}=`, length: length + 1 };
    }

    return { name, length };
}

function maxWidthOf(locations: DisplayLocation[]) {
    return Math.max(...locations.map(file => (file.displayName ?? file.basename).length));
}

export interface DisplayLocation extends Location {
    displayName: string;
}

function DisplayLocation(location: Location, all: boolean, displayName?: string): DisplayLocation {
    return {
        get kind() {
            return location.kind;
        },

        get basename() {
            return location.basename;
        },

        get name() {
            return location.name;
        },

        get id() {
            return location.id;
        },

        get path() {
            return location.path;
        },

        get paths() {
            const paths = location.paths;

            if (MaybePromise.is(paths)) {
                return paths.then(paths => listPaths(paths, this.definition));
            }

            return listPaths(paths, this.definition);
        },

        get tag() {
            return location.tag;
        },

        get summary() {
            return location.summary;
        },

        get definition() {
            return location.definition;
        },

        get displayName() {
            return displayName ?? location.basename;
        },

        get at() {
            return location.at;
        },

        get maybeAt() {
            return location.maybeAt;
        },
    };

    function listPaths(paths: string[], definition: unknown) {
        const result = new Set(paths);
        if (all && typeof definition === "object" && definition !== null) {
            for (
                let obj = definition;
                obj !== undefined && obj !== null && obj !== Object.prototype;
                obj = Object.getPrototypeOf(obj)
            ) {
                for (const key of Object.getOwnPropertyNames(obj)) {
                    result.add(key);
                }
            }
        }

        return [...result].sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()));
    }
}
