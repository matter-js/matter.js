/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GLOBSTAR, Minimatch, ParseReturnFiltered } from "minimatch";
import { FilesystemSync } from "./file.js";

export class GlobError extends Error {}

export function globSync(pattern: string | string[], fs = FilesystemSync()) {
    if (typeof pattern === "string") {
        return [...globOneSync(pattern, fs)];
    }

    const result = Array<string>();
    for (const p of pattern) {
        result.push(...globOneSync(p, fs));
    }

    return result;
}

function globOneSync(pattern: string, fs: FilesystemSync) {
    // Parse the glob
    const mm = new Minimatch(pattern.replace(/\\/g, "/"), {});
    const results = new Set<string>();
    for (const part of mm.set) {
        for (const path of globOnePartSync(mm, part, fs)) {
            results.add(path);
        }
    }
    return results;
}

function globOnePartSync(mm: Minimatch, segments: ParseReturnFiltered[], fs: FilesystemSync) {
    // Find the starting path
    let rootPath = "";
    let didOne = false;
    while (typeof segments[0] === "string") {
        if (didOne) {
            rootPath += "/";
        } else {
            didOne = true;
        }
        rootPath += segments.shift() as string;
    }

    // If we are out of segments, this is not a glob.  Just check for presence
    if (!segments.length) {
        const stat = fs.stat(rootPath);

        if (stat?.[rootPath.endsWith("/") ? "isDirectory" : "isFile"]) {
            return [fs.resolve(rootPath)];
        }

        return [];
    }

    // Walk filesystem and apply glob
    const results = new Set<string>();

    function match(path: string, segments: ParseReturnFiltered[]) {
        // If the filter is empty then match current path
        if (!segments.length) {
            results.add(fs.resolve(path));
            return;
        }

        // If filter starts without magic then just stat that one path
        if (typeof segments[0] === "string") {
            const subpath = fs.resolve(path, segments[0]);
            if (fs.stat(fs.resolve(path, segments[0]))) {
                match(subpath, segments.slice(1));
                return;
            }
        }

        // If filter is just GLOBSTAR then all paths match but search continues
        if (segments.length === 1 && segments[0] === GLOBSTAR) {
            results.add(fs.resolve(path));
        }

        // Filter starts with magic so load directory entries to match
        const subnames = fs.readdir(path);
        if (!subnames) {
            return;
        }

        // Test each directory entry
        for (const subname of subnames) {
            const subpath = fs.resolve(path, subname);

            // Anything but GLOBSTAR is 1:1 subname/segment match
            if (segments[0] !== GLOBSTAR) {
                if (mm.matchOne([subname], segments, true)) {
                    match(subpath, segments.slice(1));
                }
                continue;
            }

            // GLOBSTAR matches nothing so test second segment
            if (segments.length > 1) {
                if (mm.matchOne([subname], segments.slice(1), true)) {
                    match(subpath, segments.slice(2));
                }
            }

            // GLOBSTAR matches everything
            match(subpath, segments);
        }
    }

    match(rootPath, segments);

    return results;
}
