import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const dir = dirname(fileURLToPath(import.meta.url)); // scripts/
const functionsDir = resolve(dir, ".."); // functions/

export const apps = [
  {
    name: "claudeCodeGateway",
    cwd: functionsDir,
    script: "npm",
    args: "start",
    max_memory_restart: "100M",
    log_file: resolve(dir, "claudeCodeGateway.log"),
    time: true,
    wait_ready: true,
  },
];
