/**
 * Shared Expo dev-server setup (LAN host, env, spawn).
 * Must use stdio: "inherit" on the Expo process so the QR code renders in the terminal.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal } from "./load-env-local.mjs";
import { pickLanHost } from "./pick-lan-host.mjs";

const EXPO_CLI = join("node_modules", "expo", "bin", "cli");

/** Run Expo CLI via node (keeps TTY on Windows; .cmd wrappers break QR + prompts). */
function spawnExpoCli(args, options) {
  if (!existsSync(EXPO_CLI)) {
    throw new Error(`Missing ${EXPO_CLI} — run bun install or npm install first.`);
  }
  return spawn(process.execPath, [EXPO_CLI, ...args], {
    stdio: "inherit",
    env: process.env,
    ...options,
  });
}

export function prepareExpoDevEnv() {
  loadEnvLocal();
  delete process.env.CI;

  const lanHost = pickLanHost();
  if (lanHost && !process.env.REACT_NATIVE_PACKAGER_HOSTNAME) {
    process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lanHost;
  }
  return lanHost;
}

export function printExpoDevTips(lanHost, { tunnel = false } = {}) {
  if (tunnel) {
    console.log("Expo WebSocket tunnel — scan the QR code below in Expo Go.\n");
    return;
  }
  if (lanHost) {
    console.log(`LAN dev host: ${lanHost} (Expo Go must be on the same Wi‑Fi)`);
    console.log(`Manual URL if QR is hidden: exp://${lanHost}:8081\n`);
  } else {
    console.log("Could not detect a LAN IP — Expo will choose one automatically.\n");
  }
  console.log("Tips:");
  console.log("  • Same Wi‑Fi on phone and PC (not mobile data)");
  console.log("  • Windows Firewall: allow Node.js on port 8081");
  console.log("  • Different networks: npm run dev:tunnel\n");
}

export function spawnExpo(extraArgs = [], { tunnel = false } = {}) {
  const expoArgs = [
    "start",
    ...(tunnel ? ["--tunnel"] : ["--lan"]),
    "--go",
    ...extraArgs,
  ];
  return spawnExpoCli(expoArgs, { stdio: "inherit" });
}
