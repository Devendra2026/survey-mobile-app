/**
 * Dev entry: Expo only. Convex runs from ../sdv-monorepo-apps/packages/backend (`npm run dev`).
 * Both apps must use the same EXPO_PUBLIC_CONVEX_URL / NEXT_PUBLIC_CONVEX_URL.
 */
import { execSync, spawn } from "node:child_process";
import { prepareExpoDevEnv, printExpoDevTips, spawnExpo } from "./expo-dev.mjs";
import { patchExpoNgrok } from "./patch-expo-ngrok.mjs";
import { patchExpoWsTunnel } from "./patch-expo-ws-tunnel.mjs";
import { patchNgrokClient } from "./patch-ngrok-client.mjs";

const tunnel = process.argv.includes("--tunnel");
const extraArgs = process.argv.slice(2).filter((a) => a !== "--tunnel");

if (tunnel) {
  process.env.EXPO_USE_WS_TUNNEL = "1";
  try {
    patchExpoWsTunnel();
    patchExpoNgrok();
    patchNgrokClient();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  try {
    if (process.platform === "win32") {
      execSync("taskkill /F /IM ngrok.exe", { stdio: "ignore" });
    }
  } catch {
    /* none running */
  }
}

const lanHost = prepareExpoDevEnv();

if (!process.env.EXPO_PUBLIC_CONVEX_URL || !process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  console.warn(
    "Warning: EXPO_PUBLIC_CONVEX_URL or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY missing in .env.local\n",
  );
}

console.log(
  "[convex] Backend is not started here — run `npm run dev` in ../sdv-monorepo-apps/packages/backend (convex dev).\n",
);

printExpoDevTips(lanHost, { tunnel });

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

const expo = spawnExpo(extraArgs, { tunnel });

let exiting = false;
function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  killTree(expo);
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
expo.on("exit", (code) => shutdown(code ?? 1));
