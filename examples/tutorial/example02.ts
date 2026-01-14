import { ServerNode } from "@matter/main";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";

const node = await ServerNode.create();

await node.add(OnOffLightDevice);

await node.run();
