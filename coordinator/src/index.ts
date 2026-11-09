import { createApi } from "./api.ts";
import { config } from "./config.ts";
import { startWatcher } from "./watcher.ts";

console.log(`[coordinator] ${config.coordinatorId} on contract ${config.contractId} via ${config.rpcUrl}`);
createApi().listen(config.port, () => console.log(`[api] listening on http://localhost:${config.port}`));
startWatcher();
