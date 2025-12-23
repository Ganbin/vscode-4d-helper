import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Server4DDiscoveryInfo } from "./serverScanner";

export interface Server4D {
  name: string;
  host: string;
  port: number;
}

export interface Server4DWithStatus extends Server4D {
  isOnline: boolean;
  responseTime?: number;
  detectedPorts?: number[]; // All ports detected for this server instance
  discoveryInfo?: Server4DDiscoveryInfo; // Info from UDP discovery
}

// Valid 4D client bundle identifiers (macOS)
const VALID_4D_CLIENT_BUNDLE_IDS = [
  "com.4D.4D", // 4D IDE/Client
  "com.4D.4DRuntimeVolumeLicense", // 4D Volume Desktop (merged clients)
];

// 4D Server bundle identifier to exclude
const SERVER_BUNDLE_ID = "com.4D.4DServer";

/**
 * Check if a 4D application is a valid client (not a server) on macOS
 */
export async function is4DClient(appPath: string): Promise<boolean> {
  if (process.platform !== "darwin") {
    // On Windows, check if the executable name contains "Server"
    const appName = path.basename(appPath).toLowerCase();
    return !appName.includes("server");
  }

  // On macOS, read the Info.plist
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");

  try {
    // Use PlistBuddy to read the bundle identifier
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "${infoPlistPath}"`
    );

    const bundleId = stdout.trim();
    return VALID_4D_CLIENT_BUNDLE_IDS.includes(bundleId);
  } catch {
    // Fallback: check app name
    const appName = path.basename(appPath).toLowerCase();
    return !appName.includes("server");
  }
}

/**
 * Get saved servers from configuration
 */
export function getSavedServers(): Server4D[] {
  const config = vscode.workspace.getConfiguration("4d-helper");
  return config.get<Server4D[]>("servers", []);
}

/**
 * Save servers to configuration
 */
export async function saveServers(
  servers: Server4D[],
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
): Promise<void> {
  const config = vscode.workspace.getConfiguration("4d-helper");
  await config.update("servers", servers, target);
}

/**
 * Add a server to the saved list
 */
export async function addServer(
  server: Server4D,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
): Promise<void> {
  const servers = getSavedServers();

  // Check for duplicates
  const exists = servers.some(
    (s) => s.host === server.host && s.port === server.port
  );
  if (exists) {
    throw new Error(`Server ${server.host}:${server.port} already exists`);
  }

  servers.push(server);
  await saveServers(servers, target);
}

/**
 * Remove a server from the saved list
 */
export async function removeServer(host: string, port: number): Promise<void> {
  const servers = getSavedServers();
  const filtered = servers.filter((s) => !(s.host === host && s.port === port));

  if (filtered.length === servers.length) {
    throw new Error(`Server ${host}:${port} not found`);
  }

  await saveServers(filtered, vscode.ConfigurationTarget.Global);
}

/**
 * Get scan settings from configuration
 */
export function getScanSettings(): {
  portStart: number;
  portEnd: number;
  timeout: number;
  defaultPort: number;
  cacheTimeout: number;
} {
  const config = vscode.workspace.getConfiguration("4d-helper");
  return {
    portStart: config.get<number>("serverScan.portRange.start", 19800),
    portEnd: config.get<number>("serverScan.portRange.end", 19899),
    timeout: config.get<number>("serverScan.timeout", 500),
    defaultPort: config.get<number>("serverScan.defaultPort", 19813),
    cacheTimeout: config.get<number>("serverScan.cacheTimeout", 120),
  };
}

// Scan cache - stored in memory
export interface ScanCache {
  servers: Server4DWithStatus[];
  timestamp: number;
  portsByHost: Map<string, Set<number>>;
}

let scanCache: ScanCache | null = null;

export function getScanCache(): ScanCache | null {
  return scanCache;
}

export function setScanCache(
  servers: Server4DWithStatus[],
  portsByHost: Map<string, Set<number>>
): void {
  scanCache = {
    servers,
    timestamp: Date.now(),
    portsByHost,
  };
}

export function clearScanCache(): void {
  scanCache = null;
}

export function isScanCacheStale(cacheTimeoutSeconds: number): boolean {
  if (!scanCache) return true;
  const ageMs = Date.now() - scanCache.timestamp;
  return ageMs > cacheTimeoutSeconds * 1000;
}

export function getScanCacheAge(): string {
  if (!scanCache) return "";
  const ageMs = Date.now() - scanCache.timestamp;
  const ageSeconds = Math.floor(ageMs / 1000);
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  const ageMinutes = Math.floor(ageSeconds / 60);
  return `${ageMinutes}m ago`;
}

/**
 * Generate a temporary 4DLink file for connecting to a server
 */
export async function generate4DLink(server: Server4D): Promise<string> {
  const tempDir = os.tmpdir();
  const linkFileName = `4d-helper-${server.host.replace(/\./g, "-")}-${
    server.port
  }.4dlink`;
  const linkPath = path.join(tempDir, linkFileName);

  // Use a placeholder database name - 4D will figure it out
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<database_shortcut is_remote="true" server_database_name="RemoteDatabase" server_path="${server.host}:${server.port}"/>`;

  await fs.writeFile(linkPath, xml, "utf8");
  return linkPath;
}

/**
 * Clean up old temporary 4DLink files
 */
export async function cleanupOld4DLinks(): Promise<void> {
  const tempDir = os.tmpdir();

  try {
    const files = await fs.readdir(tempDir);
    const linkFiles = files.filter(
      (f) => f.startsWith("4d-helper-") && f.endsWith(".4dlink")
    );

    for (const file of linkFiles) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = await fs.stat(filePath);
        const ageMs = Date.now() - stats.mtimeMs;
        // Delete files older than 1 hour
        if (ageMs > 60 * 60 * 1000) {
          await fs.unlink(filePath);
        }
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Format server for display in QuickPick
 */
export function formatServerForDisplay(
  server: Server4DWithStatus
): vscode.QuickPickItem {
  const statusIcon = server.isOnline ? "$(circle-filled)" : "$(circle-outline)";
  const statusText = server.isOnline
    ? `Online${server.responseTime ? ` (${server.responseTime}ms)` : ""}`
    : "Offline";

  return {
    label: `${statusIcon} ${server.name}`,
    description: `${server.host}:${server.port}`,
    detail: statusText,
  };
}

/**
 * Generate auto name for a discovered server
 * If discovery info is available, uses "database (hostname)" format
 */
export function generateServerName(
  host: string,
  port: number,
  discoveryInfo?: Server4DDiscoveryInfo
): string {
  // If we have discovery info, use database name + hostname
  if (discoveryInfo) {
    return `${discoveryInfo.database} (${discoveryInfo.host})`;
  }

  // Fallback: If it's an IP, create a simple name
  const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    return `Server @ ${host}:${port}`;
  }
  // If it's a hostname, use it
  return `${host}:${port}`;
}
