import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const dir = dirname(fileURLToPath(import.meta.url)); // gateway/

export const apps = [
    {
        name: "claudeCodeGateway",
        cwd: dir,
        script: "npm",
        args: "start",
        max_memory_restart: "100M",
        log_file: resolve(dir, "gateway.log"),
        time: true,
        wait_ready: true,
    },
];
