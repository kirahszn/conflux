import { createApi } from "./api.ts";
import { config } from "./config.ts";
import { startWatcher } from "./watcher.ts";

console.log(`[coordinator] ${config.coordinatorId} on contract ${config.contractId} via ${config.rpcUrl}`);
console.log(
  `[coordinator] signing key from ${config.keySource}; NEAR AI key from ${config.nearAiKeySource}; ` +
    `data in ${config.dbPath}; CORS origin ${config.websiteOrigin}`,
);
createApi().listen(config.port, () => console.log(`[api] listening on port ${config.port}`));
startWatcher();
