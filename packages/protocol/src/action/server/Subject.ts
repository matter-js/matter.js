/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { EndpointNumber, GroupId, NodeId } from "#types";

export type Subject = Subject.Node | Subject.Group;

export namespace Subject {
    export function Node(data: Omit<Node, "kind">): Subject {
        return {
            kind: "node",
            ...data,
        };
    }

    export function isNode(subject?: Subject): subject is Node {
        return subject?.kind === "node";
    }

    export interface Node {
        kind: "node";
        id: NodeId;
        catSubjects?: NodeId[];
    }

    export function Group(data: Omit<Group, "kind">): Subject {
        return {
            kind: "group",
            ...data,
        };
    }

    export function isGroup(subject?: Subject): subject is Group {
        return subject?.kind === "group";
    }

    export interface Group {
        kind: "group";
        id: GroupId;
        hasValidMapping: boolean;
        endpoints: EndpointNumber[];
    }
}
