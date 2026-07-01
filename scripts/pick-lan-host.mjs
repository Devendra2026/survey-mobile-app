import os from "node:os";

/** Virtual / VPN adapters often break Expo Go on Windows when picked first. */
const DEPRIORITIZED_PREFIXES = [
  "127.",
  "169.254.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
];

function scoreAddress(address) {
  if (DEPRIORITIZED_PREFIXES.some((p) => address.startsWith(p))) return 0;
  if (address.startsWith("192.168.")) return 3;
  if (address.startsWith("10.")) return 2;
  if (address.startsWith("172.")) return 1;
  return 1;
}

/**
 * Best-effort LAN IPv4 for Metro / Expo Go (same Wi‑Fi, no tunnel).
 * Returns null if none found (Expo will pick its own).
 */
export function pickLanHost() {
  const candidates = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      candidates.push(iface.address);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreAddress(b) - scoreAddress(a));
  return candidates[0];
}
