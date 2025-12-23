import * as net from "net";
import * as dgram from "dgram";
import * as os from "os";

export interface ServerScanResult {
  host: string;
  port: number;
  isOpen: boolean;
  responseTime?: number;
}

/**
 * 4D Server discovery response from UDP protocol
 */
export interface Server4DDiscoveryInfo {
  host: string;        // Machine hostname
  service: string;     // Always "4D Server V"
  database: string;    // Database name
  port: number;        // Application port
}

/**
 * Extended scan result with 4D server info
 */
export interface Server4DScanResult extends ServerScanResult {
  discoveryInfo?: Server4DDiscoveryInfo;
  relatedPorts?: number[];
}

export interface SubnetInfo {
  localIp: string;
  netmask: string;
  networkAddress: string;
  broadcastAddress: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
}

/**
 * Check if a specific port is open on a given host
 */
export async function checkPort(
  host: string,
  port: number,
  timeout: number = 500
): Promise<ServerScanResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      const responseTime = Date.now() - startTime;
      cleanup();
      resolve({ host, port, isOpen: true, responseTime });
    });

    socket.on("timeout", () => {
      cleanup();
      resolve({ host, port, isOpen: false });
    });

    socket.on("error", () => {
      cleanup();
      resolve({ host, port, isOpen: false });
    });

    socket.connect(port, host);
  });
}

/**
 * Scan multiple ports on a single host
 */
export async function scanHostPorts(
  host: string,
  ports: number[],
  timeout: number = 500
): Promise<ServerScanResult[]> {
  const results = await Promise.all(
    ports.map((port) => checkPort(host, port, timeout))
  );
  return results.filter((r) => r.isOpen);
}

/**
 * Get the local network interface information
 */
export function getLocalNetworkInfo(): SubnetInfo | null {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (!addresses) continue;

    for (const addr of addresses) {
      // Skip internal (loopback) and IPv6 addresses
      if (addr.family === "IPv4" && !addr.internal) {
        const subnet = calculateSubnet(addr.address, addr.netmask);
        return subnet;
      }
    }
  }

  return null;
}

/**
 * Calculate subnet information from IP and netmask
 */
function calculateSubnet(ip: string, netmask: string): SubnetInfo {
  const ipParts = ip.split(".").map(Number);
  const maskParts = netmask.split(".").map(Number);

  // Calculate network address
  const networkParts = ipParts.map((part, i) => part & maskParts[i]);
  const networkAddress = networkParts.join(".");

  // Calculate broadcast address
  const invertedMask = maskParts.map((part) => 255 - part);
  const broadcastParts = networkParts.map((part, i) => part | invertedMask[i]);
  const broadcastAddress = broadcastParts.join(".");

  // Calculate first and last host
  const firstHostParts = [...networkParts];
  firstHostParts[3] += 1;
  const firstHost = firstHostParts.join(".");

  const lastHostParts = [...broadcastParts];
  lastHostParts[3] -= 1;
  const lastHost = lastHostParts.join(".");

  // Calculate total hosts
  const totalHosts = invertedMask.reduce((acc, val) => acc * (val + 1), 1) - 2;

  return {
    localIp: ip,
    netmask,
    networkAddress,
    broadcastAddress,
    firstHost,
    lastHost,
    totalHosts,
  };
}

/**
 * Generate all IP addresses in a subnet range
 */
export function generateSubnetIPs(subnetInfo: SubnetInfo): string[] {
  const ips: string[] = [];
  const startParts = subnetInfo.firstHost.split(".").map(Number);
  const endParts = subnetInfo.lastHost.split(".").map(Number);

  // For simplicity, handle /24 subnets (most common)
  // For larger subnets, we'll limit to 254 hosts
  if (
    startParts[0] === endParts[0] &&
    startParts[1] === endParts[1] &&
    startParts[2] === endParts[2]
  ) {
    // Same /24 network
    for (let i = startParts[3]; i <= endParts[3]; i++) {
      ips.push(`${startParts[0]}.${startParts[1]}.${startParts[2]}.${i}`);
    }
  } else {
    // Larger subnet - just scan the local /24
    const localParts = subnetInfo.localIp.split(".").map(Number);
    for (let i = 1; i <= 254; i++) {
      ips.push(`${localParts[0]}.${localParts[1]}.${localParts[2]}.${i}`);
    }
  }

  return ips;
}

/**
 * Scan entire subnet for open ports with progress callback
 */
export async function scanSubnet(
  ports: number[],
  timeout: number = 500,
  batchSize: number = 20,
  onProgress?: (
    scanned: number,
    total: number,
    found: ServerScanResult[]
  ) => void
): Promise<ServerScanResult[]> {
  const subnetInfo = getLocalNetworkInfo();
  if (!subnetInfo) {
    throw new Error("Could not determine local network information");
  }

  const ips = generateSubnetIPs(subnetInfo);
  const allResults: ServerScanResult[] = [];

  // Scan in batches to avoid overwhelming the network
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    const batchPromises = batch.flatMap((ip) =>
      ports.map((port) => checkPort(ip, port, timeout))
    );

    const batchResults = await Promise.all(batchPromises);
    const openPorts = batchResults.filter((r) => r.isOpen);
    allResults.push(...openPorts);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, ips.length), ips.length, allResults);
    }
  }

  return allResults;
}

/**
 * Scan specific hosts for 4D Server ports
 */
export async function scanHosts(
  hosts: string[],
  ports: number[],
  timeout: number = 500,
  onProgress?: (
    scanned: number,
    total: number,
    found: ServerScanResult[]
  ) => void
): Promise<ServerScanResult[]> {
  const allResults: ServerScanResult[] = [];

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    const results = await scanHostPorts(host, ports, timeout);
    allResults.push(...results);

    if (onProgress) {
      onProgress(i + 1, hosts.length, allResults);
    }
  }

  return allResults;
}

/**
 * Generate default 4D port range
 */
export function getDefault4DPorts(
  startPort: number = 19800,
  endPort: number = 19899
): number[] {
  const ports: number[] = [];
  for (let p = startPort; p <= endPort; p++) {
    ports.push(p);
  }
  return ports;
}

/**
 * Build the 4D Server UDP discovery packet (96 bytes)
 * Format:
 * - Bytes 0-31: Null padding
 * - Bytes 32-63: "4D Server V" + null padding
 * - Bytes 64-95: "4DQuicNegociation" + null padding
 */
function build4DDiscoveryPacket(): Buffer {
  const packet = Buffer.alloc(96, 0);

  // Write "4D Server V" at offset 32
  packet.write("4D Server V", 32, "utf8");

  // Write "4DQuicNegociation" at offset 64
  packet.write("4DQuicNegociation", 64, "utf8");

  return packet;
}

/**
 * Send UDP discovery packet to a 4D Server and get server info
 */
export async function discover4DServer(
  host: string,
  port: number,
  timeout: number = 1000
): Promise<Server4DDiscoveryInfo | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const packet = build4DDiscoveryPacket();

    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, timeout);

    socket.on("message", (msg) => {
      clearTimeout(timer);
      socket.close();

      try {
        // Find JSON in response (from first '{' to last '}')
        const msgStr = msg.toString("utf8");
        const jsonStart = msgStr.indexOf("{");
        const jsonEnd = msgStr.lastIndexOf("}");

        if (jsonStart === -1 || jsonEnd === -1) {
          resolve(null);
          return;
        }

        const jsonStr = msgStr.substring(jsonStart, jsonEnd + 1);
        const info = JSON.parse(jsonStr) as Server4DDiscoveryInfo;
        resolve(info);
      } catch {
        resolve(null);
      }
    });

    socket.on("error", () => {
      clearTimeout(timer);
      socket.close();
      resolve(null);
    });

    socket.send(packet, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        resolve(null);
      }
    });
  });
}

/**
 * Scan subnet using UDP discovery (faster than TCP)
 * Then check related ports via TCP
 */
export async function scanSubnetUDP(
  ports: number[],
  timeout: number = 500,
  batchSize: number = 30,
  onProgress?: (
    scanned: number,
    total: number,
    found: Server4DScanResult[]
  ) => void
): Promise<Server4DScanResult[]> {
  const subnetInfo = getLocalNetworkInfo();
  if (!subnetInfo) {
    throw new Error("Could not determine local network information");
  }

  const ips = generateSubnetIPs(subnetInfo);
  const allResults: Server4DScanResult[] = [];
  const foundServers = new Map<string, Server4DScanResult>();

  // Total operations: IPs * ports for UDP, then TCP checks for found servers
  const totalUDPChecks = ips.length * ports.length;
  let completedChecks = 0;

  // Scan in batches - each batch does UDP discovery on multiple IP:port combinations
  for (let ipIdx = 0; ipIdx < ips.length; ipIdx += batchSize) {
    const ipBatch = ips.slice(ipIdx, ipIdx + batchSize);

    // For each IP in batch, try all ports via UDP
    const batchPromises: Promise<void>[] = [];

    for (const ip of ipBatch) {
      for (const port of ports) {
        const promise = discover4DServer(ip, port, timeout).then(async (info) => {
          completedChecks++;

          if (info) {
            const key = `${ip}:${info.port}`;

            // Skip if already found
            if (!foundServers.has(key)) {
              // Found a 4D server! Now check related TCP ports (-2 to +2)
              const relatedPorts: number[] = [];
              const tcpChecks: Promise<ServerScanResult>[] = [];

              for (let offset = -2; offset <= 2; offset++) {
                const relatedPort = info.port + offset;
                if (relatedPort > 0 && relatedPort <= 65535) {
                  tcpChecks.push(checkPort(ip, relatedPort, timeout));
                }
              }

              const tcpResults = await Promise.all(tcpChecks);
              for (const result of tcpResults) {
                if (result.isOpen) {
                  relatedPorts.push(result.port);
                }
              }

              const serverResult: Server4DScanResult = {
                host: ip,
                port: info.port,
                isOpen: true,
                responseTime: undefined,
                discoveryInfo: info,
                relatedPorts: relatedPorts.sort((a, b) => a - b)
              };

              foundServers.set(key, serverResult);
            }
          }
        });

        batchPromises.push(promise);
      }
    }

    await Promise.all(batchPromises);

    // Update progress
    if (onProgress) {
      const currentResults = Array.from(foundServers.values());
      const progress = Math.min(completedChecks, totalUDPChecks);
      onProgress(progress, totalUDPChecks, currentResults);
    }
  }

  return Array.from(foundServers.values());
}
