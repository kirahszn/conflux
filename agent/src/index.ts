import { config } from "./config.ts";
import { assertRpcChain } from "./network.ts";
import { start } from "./runner.ts";

await assertRpcChain(config.rpcUrl);
start();
