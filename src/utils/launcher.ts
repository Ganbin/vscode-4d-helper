import { exec } from 'child_process';
import * as fs from 'fs';

/**
 * Launch options for opening a 4D project.
 */
export interface LaunchOptions {
  /** Opening mode: 'interpreted' or 'compiled' */
  openingMode?: 'interpreted' | 'compiled';
  /** Path to a specific data file (.4DD) */
  dataFile?: string;
  /** Create a new data file if none exists */
  createData?: boolean;
  /** Run without any data file */
  dataless?: boolean;
  /** Run without UI (headless mode) */
  headless?: boolean;
  /** Skip On Startup method */
  skipOnStartup?: boolean;
  /** Custom user parameter string */
  userParam?: string;
  /** Specific startup method to run */
  startupMethod?: string;
}

// Output channel for logging
let outputChannel: { appendLine: (msg: string) => void } | null = null;

export function setOutputChannel(channel: { appendLine: (msg: string) => void }) {
  outputChannel = channel;
}

function log(message: string) {
  console.log(`[4D Helper] ${message}`);
  outputChannel?.appendLine(`[4D Helper] ${message}`);
}

/**
 * Opens a 4D project with the specified 4D application and options.
 * Works on both macOS and Windows.
 */
export async function open4DProject(
  appPath: string,
  projectPath: string,
  options: LaunchOptions = {}
): Promise<void> {
  log(`=== Opening 4D Project ===`);
  log(`App: ${appPath}`);
  log(`Project: ${projectPath}`);
  log(`Options: ${JSON.stringify(options)}`);

  const appExists = await fileExists(appPath);
  if (!appExists) {
    throw new Error(`4D application not found: ${appPath}`);
  }
  log(`App exists: YES`);

  const projectExists = await fileExists(projectPath);
  if (!projectExists) {
    throw new Error(`Project file not found: ${projectPath}`);
  }
  log(`Project exists: YES`);

  if (options.dataFile) {
    const dataExists = await fileExists(options.dataFile);
    if (!dataExists) {
      throw new Error(`Data file not found: ${options.dataFile}`);
    }
  }

  const platform = process.platform;
  log(`Platform: ${platform}`);

  if (platform === 'darwin') {
    await openOnMac(appPath, projectPath, options);
  } else if (platform === 'win32') {
    await openOnWindows(appPath, projectPath, options);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Checks if any options require CLI arguments.
 */
function hasCliOptions(options: LaunchOptions): boolean {
  return !!(
    options.openingMode ||
    options.dataFile ||
    options.createData ||
    options.dataless ||
    options.headless ||
    options.skipOnStartup ||
    options.userParam ||
    options.startupMethod
  );
}

/**
 * Builds CLI arguments string from launch options.
 */
function buildCliArgsString(options: LaunchOptions): string {
  const args: string[] = [];

  if (options.openingMode) {
    args.push(`--opening-mode ${options.openingMode}`);
  }

  if (options.dataFile) {
    args.push(`--data "${options.dataFile}"`);
  }

  if (options.createData) {
    args.push('--create-data');
  }

  if (options.dataless) {
    args.push('--dataless');
  }

  if (options.headless) {
    args.push('--headless');
  }

  if (options.skipOnStartup) {
    args.push('--skip-onstartup');
  }

  if (options.userParam) {
    args.push(`--user-param "${options.userParam}"`);
  }

  if (options.startupMethod) {
    args.push(`--startup-method "${options.startupMethod}"`);
  }

  return args.join(' ');
}

async function openOnMac(
  appPath: string,
  projectPath: string,
  options: LaunchOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;

    if (hasCliOptions(options)) {
      // With CLI options: use --args to pass arguments to 4D
      const cliArgs = buildCliArgsString(options);
      command = `open -a "${appPath}" --args --project "${projectPath}" ${cliArgs}`;
    } else {
      // Simple case: just open the project with the app (ORIGINAL WORKING VERSION)
      command = `open -a "${appPath}" "${projectPath}"`;
    }

    log(`Command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        log(`ERROR: ${error.message}`);
        if (stderr) {
          log(`STDERR: ${stderr}`);
        }
        reject(new Error(`Failed to launch 4D: ${error.message}`));
        return;
      }

      if (stdout) {
        log(`STDOUT: ${stdout}`);
      }
      if (stderr) {
        log(`STDERR: ${stderr}`);
      }

      log(`Command executed successfully`);
      resolve();
    });
  });
}

async function openOnWindows(
  appPath: string,
  projectPath: string,
  options: LaunchOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cliArgs = buildCliArgsString(options);
    const command = `"${appPath}" --project "${projectPath}" ${cliArgs}`;

    log(`Command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        log(`ERROR: ${error.message}`);
        reject(new Error(`Failed to launch 4D: ${error.message}`));
        return;
      }

      log(`Command executed successfully`);
      resolve();
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
