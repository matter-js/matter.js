import { ServerNode } from "@matter/main";

const node = await ServerNode.create();

await node.run();
