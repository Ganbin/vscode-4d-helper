import * as vscode from 'vscode';
import * as path from 'path';
import { find4DProjectFile, FourDProjectFile } from './utils/projectFinder';
import { open4DProject, LaunchOptions, setOutputChannel } from './utils/launcher';
import {
  checkPort,
  scanSubnetUDP,
  getLocalNetworkInfo,
  ServerScanResult,
  Server4DScanResult,
  getDefault4DPorts,
  discover4DServer
} from './utils/serverScanner';
import {
  Server4D,
  Server4DWithStatus,
  getSavedServers,
  addServer,
  removeServer,
  getScanSettings,
  generate4DLink,
  cleanupOld4DLinks,
  is4DClient,
  generateServerName,
  getScanCache,
  setScanCache,
  clearScanCache,
  isScanCacheStale,
  getScanCacheAge
} from './utils/serverManager';

// Output channel for logging
let outputChannel: vscode.OutputChannel;

interface FourDApplication {
  name: string;
  path: string;
}

/** Option IDs for the launch options QuickPick */
type LaunchOptionId =
  | 'compiled'
  | 'interpreted'
  | 'skipOnStartup'
  | 'customData'
  | 'createData'
  | 'dataless'
  | 'headless';

interface LaunchOptionItem extends vscode.QuickPickItem {
  id: LaunchOptionId;
  group?: 'mode' | 'data';
}

const LAUNCH_OPTIONS: LaunchOptionItem[] = [
  {
    id: 'interpreted',
    label: 'Interpreted Mode',
    description: 'Open in interpreted mode',
    group: 'mode',
    picked: true,
  },
  {
    id: 'compiled',
    label: 'Compiled Mode',
    description: 'Open in compiled mode',
    group: 'mode',
  },
  {
    id: 'skipOnStartup',
    label: 'Skip On Startup',
    description: 'Skip the On Startup method',
  },
  {
    id: 'customData',
    label: 'Custom Data File...',
    description: 'Select a specific .4DD data file',
    group: 'data',
  },
  {
    id: 'createData',
    label: 'Create New Data',
    description: 'Create a new data file if none exists',
    group: 'data',
  },
  {
    id: 'dataless',
    label: 'Dataless',
    description: 'Run without any data file',
    group: 'data',
  },
  {
    id: 'headless',
    label: 'Headless',
    description: 'Run without UI',
  },
];

export function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('4D Helper');
  setOutputChannel(outputChannel);
  context.subscriptions.push(outputChannel);

  const openProjectCommand = vscode.commands.registerCommand(
    '4d-helper.openProject',
    async () => {
      // Show output channel immediately
      outputChannel.show(true);
      outputChannel.appendLine('=== 4D Helper: Open Project Command Started ===');
      outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        outputChannel.appendLine('ERROR: No workspace folder open');
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      outputChannel.appendLine(`Workspace: ${workspaceFolder.uri.fsPath}`);

      // Find the project file
      outputChannel.appendLine('Finding project file...');
      const projectFile = await resolveProjectFile(workspaceFolder);
      if (!projectFile) {
        outputChannel.appendLine('ERROR: No project file found or selected');
        return;
      }
      outputChannel.appendLine(`Project file: ${projectFile}`);

      // Get 4D applications from settings
      outputChannel.appendLine('Getting 4D applications from settings...');
      const config = vscode.workspace.getConfiguration('4d-helper');
      const applications = config.get<FourDApplication[]>('applications', []);
      outputChannel.appendLine(`Found ${applications.length} applications`);

      if (applications.length === 0) {
        outputChannel.appendLine('ERROR: No applications configured');
        const openSettings = 'Open Settings';
        const result = await vscode.window.showWarningMessage(
          'No 4D applications configured. Please add applications in settings.',
          openSettings
        );
        if (result === openSettings) {
          vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '4d-helper.applications'
          );
        }
        return;
      }

      // Select 4D application
      outputChannel.appendLine('Showing app selection...');
      const appItems = applications.map((app) => ({
        label: app.name,
        description: app.path,
        path: app.path,
      }));

      const selectedApp = await vscode.window.showQuickPick(appItems, {
        placeHolder: 'Select a 4D application',
        title: 'Open 4D Project - Step 1/2: Select Application',
      });

      if (!selectedApp) {
        outputChannel.appendLine('User cancelled app selection');
        return;
      }
      outputChannel.appendLine(`Selected app: ${selectedApp.label} (${selectedApp.path})`);

      // Select launch options with multi-select
      outputChannel.appendLine('Showing launch options...');
      const launchOptions = await selectLaunchOptions();
      if (launchOptions === undefined) {
        outputChannel.appendLine('User cancelled options selection');
        return; // User cancelled
      }
      outputChannel.appendLine(`Selected options: ${JSON.stringify(launchOptions)}`);

      // Build launch options object
      const options: LaunchOptions = {};

      if (launchOptions.includes('compiled')) {
        options.openingMode = 'compiled';
      } else if (launchOptions.includes('interpreted')) {
        options.openingMode = 'interpreted';
      }

      if (launchOptions.includes('skipOnStartup')) {
        options.skipOnStartup = true;
      }

      if (launchOptions.includes('headless')) {
        options.headless = true;
      }

      if (launchOptions.includes('dataless')) {
        options.dataless = true;
      } else if (launchOptions.includes('createData')) {
        options.createData = true;
      } else if (launchOptions.includes('customData')) {
        const dataFile = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { '4D Data Files': ['4DD'] },
          title: 'Select Data File',
        });

        if (!dataFile || dataFile.length === 0) {
          return; // User cancelled
        }

        options.dataFile = dataFile[0].fsPath;
      }

      // Launch 4D
      outputChannel.appendLine(`Built options: ${JSON.stringify(options)}`);
      outputChannel.appendLine('Calling open4DProject...');
      try {
        await open4DProject(selectedApp.path, projectFile, options);

        const optionsSummary = summarizeLaunchOptions(options);
        vscode.window.showInformationMessage(
          `Opening project with ${selectedApp.label}${optionsSummary}`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to open project: ${message}`);
      }
    }
  );

  context.subscriptions.push(openProjectCommand);

  const addVersionCommand = vscode.commands.registerCommand(
    '4d-helper.addVersion',
    async () => {
      outputChannel.appendLine('=== 4D Helper: Add Version Command Started ===');
      outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);

      // Step 1: Ask for application path
      const platform = process.platform;
      const filters: { [name: string]: string[] } = {};

      if (platform === 'darwin') {
        filters['4D Application'] = ['app'];
      } else if (platform === 'win32') {
        filters['4D Application'] = ['exe'];
      } else {
        filters['All Files'] = ['*'];
      }

      const selectedFiles = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: filters,
        title: 'Select 4D Application',
        openLabel: 'Select'
      });

      if (!selectedFiles || selectedFiles.length === 0) {
        outputChannel.appendLine('User cancelled file selection');
        return;
      }

      const appPath = selectedFiles[0].fsPath;
      outputChannel.appendLine(`Selected path: ${appPath}`);

      // Step 2: Ask for name with default
      const defaultName = getDefaultAppName(appPath);
      outputChannel.appendLine(`Default name: ${defaultName}`);

      const appName = await vscode.window.showInputBox({
        prompt: 'Enter a display name for this 4D version',
        value: defaultName,
        placeHolder: 'e.g., 4D v20 R8',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Name cannot be empty';
          }
          return null;
        }
      });

      if (!appName) {
        outputChannel.appendLine('User cancelled name input');
        return;
      }

      const trimmedName = appName.trim();
      outputChannel.appendLine(`App name: ${trimmedName}`);

      // Check for duplicates in both User and Workspace configs
      const config = vscode.workspace.getConfiguration('4d-helper');
      const userApps = config.inspect<FourDApplication[]>('applications')?.globalValue || [];
      const workspaceApps = config.inspect<FourDApplication[]>('applications')?.workspaceValue || [];

      const allApps = [...userApps, ...workspaceApps];
      const existingByName = allApps.find(app => app.name === trimmedName);
      const existingByPath = allApps.find(app => app.path === appPath);

      if (existingByName || existingByPath) {
        outputChannel.appendLine('Duplicate found - asking user what to do');
        const message = existingByName && existingByPath
          ? `A version with the name "${trimmedName}" and path "${appPath}" already exists.`
          : existingByName
          ? `A version with the name "${trimmedName}" already exists.`
          : `A version with the path "${appPath}" already exists.`;

        const choice = await vscode.window.showWarningMessage(
          message,
          'Overwrite',
          'Cancel'
        );

        if (choice !== 'Overwrite') {
          outputChannel.appendLine('User chose to cancel');
          return;
        }
        outputChannel.appendLine('User chose to overwrite');
      }

      // Step 3: Ask for configuration level
      const configLevel = await vscode.window.showQuickPick(
        [
          {
            label: 'User Settings',
            description: 'Available in all workspaces',
            value: vscode.ConfigurationTarget.Global
          },
          {
            label: 'Workspace Settings',
            description: 'Only available in this workspace',
            value: vscode.ConfigurationTarget.Workspace
          }
        ],
        {
          placeHolder: 'Where do you want to save this 4D version?',
          title: 'Configuration Level'
        }
      );

      if (!configLevel) {
        outputChannel.appendLine('User cancelled config level selection');
        return;
      }

      outputChannel.appendLine(`Config level: ${configLevel.label}`);

      // Get the appropriate config array
      const targetApps = configLevel.value === vscode.ConfigurationTarget.Global
        ? [...userApps]
        : [...workspaceApps];

      // Remove any existing entries with same name or path
      const filteredApps = targetApps.filter(
        app => app.name !== trimmedName && app.path !== appPath
      );

      // Add the new version
      filteredApps.push({
        name: trimmedName,
        path: appPath
      });

      // Save to configuration
      try {
        await config.update('applications', filteredApps, configLevel.value);
        outputChannel.appendLine('Configuration updated successfully');
        vscode.window.showInformationMessage(
          `4D version "${trimmedName}" added successfully to ${configLevel.label}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Error updating configuration: ${message}`);
        vscode.window.showErrorMessage(`Failed to add version: ${message}`);
      }
    }
  );

  const removeVersionCommand = vscode.commands.registerCommand(
    '4d-helper.removeVersion',
    async () => {
      outputChannel.appendLine('=== 4D Helper: Remove Version Command Started ===');
      outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);

      // Get all versions from both User and Workspace configs
      const config = vscode.workspace.getConfiguration('4d-helper');
      const userApps = config.inspect<FourDApplication[]>('applications')?.globalValue || [];
      const workspaceApps = config.inspect<FourDApplication[]>('applications')?.workspaceValue || [];

      outputChannel.appendLine(`User apps: ${userApps.length}`);
      outputChannel.appendLine(`Workspace apps: ${workspaceApps.length}`);

      if (userApps.length === 0 && workspaceApps.length === 0) {
        outputChannel.appendLine('No versions configured');
        vscode.window.showInformationMessage('No 4D versions configured. Nothing to delete.');
        return;
      }

      // Create QuickPick items with source information
      interface VersionQuickPickItem extends vscode.QuickPickItem {
        app: FourDApplication;
        source: 'user' | 'workspace';
        configTarget: vscode.ConfigurationTarget;
      }

      const items: VersionQuickPickItem[] = [
        ...userApps.map(app => ({
          label: app.name,
          description: app.path,
          detail: 'User Settings',
          app: app,
          source: 'user' as const,
          configTarget: vscode.ConfigurationTarget.Global
        })),
        ...workspaceApps.map(app => ({
          label: app.name,
          description: app.path,
          detail: 'Workspace Settings',
          app: app,
          source: 'workspace' as const,
          configTarget: vscode.ConfigurationTarget.Workspace
        }))
      ];

      // Show QuickPick to select version to remove
      const selectedItem = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a 4D version to remove',
        title: 'Remove 4D Version'
      });

      if (!selectedItem) {
        outputChannel.appendLine('User cancelled version selection');
        return;
      }

      outputChannel.appendLine(`Selected: ${selectedItem.label} from ${selectedItem.source}`);

      // Show confirmation dialog
      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to remove "${selectedItem.label}"?`,
        { modal: true },
        'Remove',
        'Cancel'
      );

      if (confirmation !== 'Remove') {
        outputChannel.appendLine('User cancelled removal');
        return;
      }

      // Remove from the appropriate config
      try {
        const sourceApps = selectedItem.source === 'user' ? [...userApps] : [...workspaceApps];
        const filteredApps = sourceApps.filter(
          app => !(app.name === selectedItem.app.name && app.path === selectedItem.app.path)
        );

        await config.update('applications', filteredApps, selectedItem.configTarget);
        outputChannel.appendLine('Version removed successfully');
        vscode.window.showInformationMessage(
          `4D version "${selectedItem.label}" removed successfully`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Error removing version: ${message}`);
        vscode.window.showErrorMessage(`Failed to remove version: ${message}`);
      }
    }
  );

  context.subscriptions.push(addVersionCommand);
  context.subscriptions.push(removeVersionCommand);

  // ============================================
  // Server Connection Commands
  // ============================================

  const connectToServerCommand = vscode.commands.registerCommand(
    '4d-helper.connectToServer',
    async () => {
      outputChannel.show(true);
      outputChannel.appendLine('=== 4D Helper: Connect to Server Command Started ===');
      outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);

      // Clean up old temp files
      cleanupOld4DLinks(); // Don't await - run in background

      const scanSettings = getScanSettings();

      // Define item types for the QuickPick
      interface ServerQuickPickItem extends vscode.QuickPickItem {
        server?: Server4DWithStatus;
        isSaved?: boolean;
        isDiscovered?: boolean;
        isAction?: boolean;
        actionId?: string;
      }

      // Create QuickPick immediately
      const quickPick = vscode.window.createQuickPick<ServerQuickPickItem>();
      quickPick.title = 'Connect to 4D Server';
      quickPick.busy = true;

      // Track state
      const savedServers = getSavedServers();
      const savedServersStatus: Map<string, Server4DWithStatus> = new Map();
      const discoveredServers: Map<string, Server4DWithStatus> = new Map();
      let scanComplete = false;
      let isScanning = false;

      // Helper to generate unique key for a server
      const serverKey = (host: string, port: number) => `${host}:${port}`;

      // Helper to check if server is in saved list
      const isSavedServer = (host: string, port: number) =>
        savedServers.some(s => s.host === host && s.port === port);

      // Helper to rebuild QuickPick items while preserving selection
      const rebuildItems = () => {
        const currentActiveLabel = quickPick.activeItems[0]?.label;
        const items: ServerQuickPickItem[] = [];

        // Saved servers section
        if (savedServers.length > 0) {
          items.push({ label: 'Saved Servers', kind: vscode.QuickPickItemKind.Separator });

          for (const server of savedServers) {
            const key = serverKey(server.host, server.port);
            const status = savedServersStatus.get(key);

            const isOnline = status?.isOnline ?? false;
            const responseTime = status?.responseTime;
            const statusIcon = status === undefined
              ? '$(loading~spin)'
              : (isOnline ? '$(circle-filled)' : '$(circle-outline)');
            const statusText = status === undefined
              ? 'Checking...'
              : (isOnline ? `Online${responseTime ? ` (${responseTime}ms)` : ''}` : 'Offline');

            // Get discovery info from status check or from discovered servers
            const discoveryInfo = status?.discoveryInfo || discoveredServers.get(key)?.discoveryInfo;
            const detectedPorts = status?.detectedPorts || discoveredServers.get(key)?.detectedPorts;
            const portsInfo = detectedPorts && detectedPorts.length > 1
              ? ` · ports: ${detectedPorts.join(', ')}`
              : '';

            // Show database name from discovery if available
            const dbInfo = discoveryInfo ? ` - ${discoveryInfo.database}` : '';

            items.push({
              label: `${statusIcon} ${server.name}${dbInfo}`,
              description: statusText,
              detail: `${server.host}:${server.port}${portsInfo}`,
              server: { ...server, isOnline, responseTime, detectedPorts, discoveryInfo },
              isSaved: true
            });
          }
        }

        // Discovered servers section (exclude ones that are already saved)
        const newDiscovered = Array.from(discoveredServers.values())
          .filter(s => !isSavedServer(s.host, s.port));

        if (newDiscovered.length > 0) {
          const cacheAge = getScanCacheAge();
          const sectionLabel = cacheAge ? `Discovered on Network (${cacheAge})` : 'Discovered on Network';
          items.push({ label: sectionLabel, kind: vscode.QuickPickItemKind.Separator });

          for (const server of newDiscovered) {
            const info = server.discoveryInfo;
            const portsInfo = server.detectedPorts && server.detectedPorts.length > 1
              ? `ports: ${server.detectedPorts.join(', ')}`
              : undefined;

            // Use database name as label if available, otherwise IP:port
            const label = info
              ? `$(database) ${info.database}`
              : `$(server) ${server.host}:${server.port}`;

            // Use hostname as description if available
            const description = info ? info.host : undefined;

            // Detail shows IP:port and related ports
            const detailParts = [`${server.host}:${server.port}`];
            if (portsInfo) {
              detailParts.push(portsInfo);
            }

            items.push({
              label,
              description,
              detail: detailParts.join(' · '),
              server,
              isDiscovered: true
            });
          }
        }

        // Scanning indicator
        if (isScanning && !scanComplete) {
          items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
          items.push({
            label: '$(sync~spin) Scanning network...',
            description: `Ports ${scanSettings.portStart}-${scanSettings.portEnd}`,
            alwaysShow: true
          });
        }

        // Actions
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

        // Rescan button - show when not scanning
        if (!isScanning || scanComplete) {
          const cacheAge = getScanCacheAge();
          items.push({
            label: '$(refresh) Rescan Network',
            description: cacheAge ? `Last scan: ${cacheAge}` : 'Scan for servers',
            isAction: true,
            actionId: 'rescan'
          });
        }

        items.push({
          label: '$(add) Add Server Manually...',
          description: 'Enter IP and port',
          isAction: true,
          actionId: 'add'
        });

        quickPick.items = items;

        // Restore selection
        if (currentActiveLabel) {
          const sameItem = items.find(item => item.label === currentActiveLabel);
          if (sameItem) {
            quickPick.activeItems = [sameItem];
          }
        }
      };

      // Function to start network scan using UDP discovery
      const startScan = () => {
        if (isScanning) return;

        isScanning = true;
        scanComplete = false;
        quickPick.busy = true;
        quickPick.placeholder = 'Select a server to connect to (scanning network...)';
        discoveredServers.clear();
        rebuildItems();

        outputChannel.appendLine('Starting UDP discovery scan...');
        const ports = getDefault4DPorts(scanSettings.portStart, scanSettings.portEnd);

        scanSubnetUDP(
          ports,
          scanSettings.timeout,
          30,
          (scanned, total, found) => {
            // Update discovered servers from UDP results
            for (const result of found) {
              const key = serverKey(result.host, result.port);
              if (!discoveredServers.has(key)) {
                discoveredServers.set(key, {
                  name: generateServerName(result.host, result.port, result.discoveryInfo),
                  host: result.host,
                  port: result.port,
                  isOnline: true,
                  responseTime: result.responseTime,
                  detectedPorts: result.relatedPorts,
                  discoveryInfo: result.discoveryInfo
                });
              }
            }

            const percent = Math.round((scanned / total) * 100);
            quickPick.placeholder = `Select a server (scanning: ${percent}%)`;
            rebuildItems();
          }
        ).then(() => {
          scanComplete = true;
          isScanning = false;
          quickPick.busy = false;
          quickPick.placeholder = 'Select a server to connect to';
          outputChannel.appendLine(`Scan complete. Found ${discoveredServers.size} server(s).`);

          // Save to cache
          setScanCache(Array.from(discoveredServers.values()), new Map());
          rebuildItems();
        }).catch(err => {
          scanComplete = true;
          isScanning = false;
          quickPick.busy = false;
          quickPick.placeholder = 'Select a server to connect to';
          outputChannel.appendLine(`Scan error: ${err.message}`);
          rebuildItems();
        });
      };

      // Load from cache if available and not stale
      const cache = getScanCache();
      if (cache && !isScanCacheStale(scanSettings.cacheTimeout)) {
        outputChannel.appendLine(`Using cached scan results (${getScanCacheAge()})`);
        for (const server of cache.servers) {
          discoveredServers.set(serverKey(server.host, server.port), server);
        }
        scanComplete = true;
        quickPick.busy = false;
        quickPick.placeholder = 'Select a server to connect to';
      } else {
        // Start fresh scan
        startScan();
      }

      // Initial render
      rebuildItems();
      quickPick.show();

      // Start checking saved servers status in background using UDP discovery
      outputChannel.appendLine(`Checking ${savedServers.length} saved servers...`);
      for (const server of savedServers) {
        // Use UDP discovery to get both status and server info
        discover4DServer(server.host, server.port, scanSettings.timeout).then(async (info) => {
          const key = serverKey(server.host, server.port);

          if (info) {
            // Server responded to UDP - it's online and we have info
            // Also check related ports via TCP
            const relatedPorts: number[] = [];
            for (let offset = -2; offset <= 2; offset++) {
              const relatedPort = server.port + offset;
              if (relatedPort > 0 && relatedPort <= 65535) {
                const result = await checkPort(server.host, relatedPort, scanSettings.timeout);
                if (result.isOpen) {
                  relatedPorts.push(relatedPort);
                }
              }
            }

            savedServersStatus.set(key, {
              ...server,
              isOnline: true,
              discoveryInfo: info,
              detectedPorts: relatedPorts.sort((a, b) => a - b)
            });
          } else {
            // UDP failed, try TCP as fallback
            const result = await checkPort(server.host, server.port, scanSettings.timeout);
            savedServersStatus.set(key, {
              ...server,
              isOnline: result.isOpen,
              responseTime: result.responseTime
            });
          }

          rebuildItems();
        });
      }

      // Handle selection
      const selectedItem = await new Promise<ServerQuickPickItem | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
          const selected = quickPick.selectedItems[0];

          // Handle rescan action without closing
          if (selected?.isAction && selected.actionId === 'rescan') {
            clearScanCache();
            startScan();
            return;
          }

          quickPick.hide();
          resolve(selected);
        });
        quickPick.onDidHide(() => {
          quickPick.dispose();
          resolve(undefined);
        });
      });

      if (!selectedItem) {
        outputChannel.appendLine('User cancelled server selection');
        return;
      }

      // Handle add action
      if (selectedItem.isAction && selectedItem.actionId === 'add') {
        vscode.commands.executeCommand('4d-helper.addServer');
        return;
      }

      const selectedServer = selectedItem.server;
      if (!selectedServer) {
        return;
      }

      // Check if offline and confirm
      if (!selectedServer.isOnline) {
        const proceed = await vscode.window.showWarningMessage(
          `Server "${selectedServer.name}" appears to be offline. Try to connect anyway?`,
          'Yes',
          'No'
        );
        if (proceed !== 'Yes') {
          return;
        }
      }

      outputChannel.appendLine(`Selected server: ${selectedServer.name} (${selectedServer.host}:${selectedServer.port})`);

      // Select 4D client application (filter out servers)
      const config = vscode.workspace.getConfiguration('4d-helper');
      const applications = config.get<FourDApplication[]>('applications', []);

      if (applications.length === 0) {
        const openSettings = 'Open Settings';
        const result = await vscode.window.showWarningMessage(
          'No 4D applications configured. Please add applications in settings.',
          openSettings
        );
        if (result === openSettings) {
          vscode.commands.executeCommand('workbench.action.openSettings', '4d-helper.applications');
        }
        return;
      }

      // Filter to only show client applications
      const clientApps: FourDApplication[] = [];
      for (const app of applications) {
        const isClient = await is4DClient(app.path);
        if (isClient) {
          clientApps.push(app);
        }
      }

      if (clientApps.length === 0) {
        vscode.window.showWarningMessage(
          'No 4D client applications found. Only 4D Server applications are configured.'
        );
        return;
      }

      const appItems = clientApps.map(app => ({
        label: app.name,
        description: app.path,
        path: app.path
      }));

      const selectedApp = await vscode.window.showQuickPick(appItems, {
        placeHolder: 'Select a 4D client application',
        title: 'Connect to 4D Server - Select Client'
      });

      if (!selectedApp) {
        outputChannel.appendLine('User cancelled app selection');
        return;
      }

      outputChannel.appendLine(`Selected client: ${selectedApp.label}`);

      // Generate 4DLink file and launch
      try {
        const linkPath = await generate4DLink(selectedServer);
        outputChannel.appendLine(`Generated 4DLink file: ${linkPath}`);

        await open4DProject(selectedApp.path, linkPath, {});

        vscode.window.showInformationMessage(
          `Connecting to ${selectedServer.name} with ${selectedApp.label}`
        );

        // If this was a discovered server (not saved), offer to save it
        if (selectedItem.isDiscovered) {
          const saveChoice = await vscode.window.showInformationMessage(
            `Save "${selectedServer.host}:${selectedServer.port}" for quick access?`,
            'Save',
            'No thanks'
          );

          if (saveChoice === 'Save') {
            const name = await vscode.window.showInputBox({
              prompt: 'Enter a display name for this server',
              value: selectedServer.name,
              validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                  return 'Name cannot be empty';
                }
                return null;
              }
            });

            if (name) {
              try {
                await addServer({
                  name: name.trim(),
                  host: selectedServer.host,
                  port: selectedServer.port
                });
                vscode.window.showInformationMessage(`Server "${name.trim()}" saved`);
              } catch (err) {
                // Already exists, ignore
              }
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Error: ${message}`);
        vscode.window.showErrorMessage(`Failed to connect: ${message}`);
      }
    }
  );

  const addServerCommand = vscode.commands.registerCommand(
    '4d-helper.addServer',
    async () => {
      outputChannel.appendLine('=== 4D Helper: Add Server Command Started ===');

      // Ask for host
      const host = await vscode.window.showInputBox({
        prompt: 'Enter the server IP address or hostname',
        placeHolder: '192.168.1.100 or server.example.com',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Host cannot be empty';
          }
          return null;
        }
      });

      if (!host) {
        return;
      }

      // Ask for port
      const scanSettings = getScanSettings();
      const portStr = await vscode.window.showInputBox({
        prompt: 'Enter the server port',
        value: String(scanSettings.defaultPort),
        validateInput: (value) => {
          const port = parseInt(value, 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            return 'Port must be a number between 1 and 65535';
          }
          return null;
        }
      });

      if (!portStr) {
        return;
      }

      const port = parseInt(portStr, 10);

      // Check if server is reachable
      outputChannel.appendLine(`Checking ${host}:${port}...`);
      const result = await checkPort(host.trim(), port, scanSettings.timeout);

      if (!result.isOpen) {
        const proceed = await vscode.window.showWarningMessage(
          `No 4D server detected at ${host}:${port}. Add anyway?`,
          'Yes',
          'No'
        );
        if (proceed !== 'Yes') {
          return;
        }
      }

      // Ask for name
      const defaultName = generateServerName(host.trim(), port);
      const name = await vscode.window.showInputBox({
        prompt: 'Enter a display name for this server',
        value: defaultName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Name cannot be empty';
          }
          return null;
        }
      });

      if (!name) {
        return;
      }

      // Save server
      try {
        await addServer({
          name: name.trim(),
          host: host.trim(),
          port
        });

        vscode.window.showInformationMessage(`Server "${name.trim()}" added successfully`);
        outputChannel.appendLine(`Server added: ${name.trim()} (${host.trim()}:${port})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to add server: ${message}`);
      }
    }
  );

  const removeServerCommand = vscode.commands.registerCommand(
    '4d-helper.removeServer',
    async () => {
      outputChannel.appendLine('=== 4D Helper: Remove Server Command Started ===');

      const servers = getSavedServers();

      if (servers.length === 0) {
        vscode.window.showInformationMessage('No servers configured. Nothing to remove.');
        return;
      }

      const items = servers.map(server => ({
        label: server.name,
        description: `${server.host}:${server.port}`,
        server
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a server to remove',
        title: 'Remove 4D Server'
      });

      if (!selected) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to remove "${selected.label}"?`,
        { modal: true },
        'Remove',
        'Cancel'
      );

      if (confirm !== 'Remove') {
        return;
      }

      try {
        await removeServer(selected.server.host, selected.server.port);
        vscode.window.showInformationMessage(`Server "${selected.label}" removed`);
        outputChannel.appendLine(`Server removed: ${selected.label}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to remove server: ${message}`);
      }
    }
  );

  const scanServersCommand = vscode.commands.registerCommand(
    '4d-helper.scanServers',
    async () => {
      outputChannel.show(true);
      outputChannel.appendLine('=== 4D Helper: Scan Servers Command Started ===');
      outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);

      const networkInfo = getLocalNetworkInfo();
      if (!networkInfo) {
        vscode.window.showErrorMessage('Could not determine local network information');
        return;
      }

      outputChannel.appendLine(`Local IP: ${networkInfo.localIp}`);
      outputChannel.appendLine(`Subnet: ${networkInfo.networkAddress}/${networkInfo.netmask}`);

      const scanSettings = getScanSettings();
      const ports = getDefault4DPorts(scanSettings.portStart, scanSettings.portEnd);

      outputChannel.appendLine(`Scanning ports ${scanSettings.portStart}-${scanSettings.portEnd}`);

      // Show progress
      const foundServers: Server4DScanResult[] = [];

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Scanning for 4D Servers',
          cancellable: true
        },
        async (progress, token) => {
          return new Promise<void>((resolve) => {
            let cancelled = false;

            token.onCancellationRequested(() => {
              cancelled = true;
              resolve();
            });

            scanSubnetUDP(
              ports,
              scanSettings.timeout,
              30, // batch size
              (scanned: number, total: number, found: Server4DScanResult[]) => {
                if (cancelled) {
                  return;
                }

                const percent = Math.round((scanned / total) * 100);
                progress.report({
                  message: `${percent}% - Found ${found.length} servers`,
                  increment: (1 / total) * 100
                });

                foundServers.length = 0;
                foundServers.push(...found);
              }
            ).then(() => {
              if (!cancelled) {
                resolve();
              }
            }).catch((err: Error) => {
              outputChannel.appendLine(`Scan error: ${err.message}`);
              resolve();
            });
          });
        }
      );

      outputChannel.appendLine(`Scan complete. Found ${foundServers.length} servers.`);

      if (foundServers.length === 0) {
        vscode.window.showInformationMessage('No 4D servers found on the network.');
        return;
      }

      // Show results and let user select which to add
      interface ServerQuickPickItem extends vscode.QuickPickItem {
        host: string;
        port: number;
        discoveryInfo?: import('./utils/serverScanner').Server4DDiscoveryInfo;
      }

      const items: ServerQuickPickItem[] = [];

      for (const server of foundServers) {
        const info = server.discoveryInfo;
        const portsInfo = server.relatedPorts && server.relatedPorts.length > 1
          ? `ports: ${server.relatedPorts.join(', ')}`
          : undefined;

        items.push({
          label: info ? `$(database) ${info.database}` : `$(server) ${server.host}:${server.port}`,
          description: info ? info.host : undefined,
          detail: [`${server.host}:${server.port}`, portsInfo].filter(Boolean).join(' · '),
          host: server.host,
          port: server.port,
          discoveryInfo: info
        });
      }

      const quickPick = vscode.window.createQuickPick<ServerQuickPickItem>();
      quickPick.title = 'Found 4D Servers';
      quickPick.placeholder = 'Select servers to add to your saved list';
      quickPick.canSelectMany = true;
      quickPick.items = items;

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems;
        quickPick.hide();

        if (selected.length === 0) {
          return;
        }

        let added = 0;
        for (const item of selected) {
          const name = generateServerName(item.host, item.port, item.discoveryInfo);
          try {
            await addServer({ name, host: item.host, port: item.port });
            added++;
            outputChannel.appendLine(`Added server: ${name}`);
          } catch {
            // Server already exists, skip
            outputChannel.appendLine(`Server ${item.host}:${item.port} already exists, skipping`);
          }
        }

        if (added > 0) {
          vscode.window.showInformationMessage(`Added ${added} server${added > 1 ? 's' : ''}`);
        }
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    }
  );

  context.subscriptions.push(connectToServerCommand);
  context.subscriptions.push(addServerCommand);
  context.subscriptions.push(removeServerCommand);
  context.subscriptions.push(scanServersCommand);
}

/**
 * Extracts a default name from the application path.
 * For macOS: extracts from .app name
 * For Windows: extracts from .exe name
 */
function getDefaultAppName(appPath: string): string {
  const basename = path.basename(appPath);
  const nameWithoutExt = basename.replace(/\.(app|exe)$/i, '');
  return nameWithoutExt;
}

/**
 * Resolves the project file, handling multiple candidates and saved preferences.
 */
async function resolveProjectFile(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<string | null> {
  const result = await find4DProjectFile(workspaceFolder.uri.fsPath);

  if (result === null) {
    vscode.window.showErrorMessage('No .4DProject file found in workspace');
    return null;
  }

  if (typeof result === 'string') {
    return result;
  }

  // Multiple projects found - check saved preference
  const config = vscode.workspace.getConfiguration('4d-helper');
  const savedProjectPath = config.get<string>('selectedProject');

  if (savedProjectPath) {
    const savedProject = result.find((p) => p.path === savedProjectPath);
    if (savedProject) {
      return savedProject.path;
    }
  }

  // Ask user to select
  const selectedProject = await promptForProjectSelection(result);
  if (!selectedProject) {
    return null;
  }

  // Save selection to workspace settings
  await config.update(
    'selectedProject',
    selectedProject.path,
    vscode.ConfigurationTarget.Workspace
  );

  return selectedProject.path;
}

/**
 * Prompts the user to select a project from multiple candidates.
 */
async function promptForProjectSelection(
  projects: FourDProjectFile[]
): Promise<FourDProjectFile | undefined> {
  const items = projects.map((p) => ({
    label: p.name,
    description: p.relativePath,
    detail: `Parent folder: ${p.parentFolder}`,
    project: p,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Multiple 4D projects found. Select the main project:',
    title: 'Select 4D Project',
  });

  return selected?.project;
}

/**
 * Shows a multi-select QuickPick for launch options with mutual exclusion handling.
 */
async function selectLaunchOptions(): Promise<LaunchOptionId[] | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<LaunchOptionItem>();
    quickPick.title = 'Open 4D Project - Step 2/2: Launch Options';
    quickPick.placeholder = 'Select launch options (optional), then press Enter';
    quickPick.canSelectMany = true;
    quickPick.items = LAUNCH_OPTIONS;

    // Set default selection (interpreted mode)
    const defaultSelected = LAUNCH_OPTIONS.filter((item) => item.picked);
    quickPick.selectedItems = defaultSelected;

    // Track selected items to handle mutual exclusion
    let previousSelection: readonly LaunchOptionItem[] = defaultSelected;
    let resolved = false;

    quickPick.onDidChangeSelection((selectedItems) => {
      const newlySelected = selectedItems.filter(
        (item) => !previousSelection.includes(item)
      );

      if (newlySelected.length > 0) {
        const newItem = newlySelected[0];

        // Handle mutual exclusion for groups
        if (newItem.group) {
          const filtered = selectedItems.filter(
            (item) => item.group !== newItem.group || item.id === newItem.id
          );

          if (filtered.length !== selectedItems.length) {
            quickPick.selectedItems = filtered;
            previousSelection = filtered;
            return;
          }
        }
      }

      previousSelection = selectedItems;
    });

    quickPick.onDidAccept(() => {
      if (!resolved) {
        resolved = true;
        const selected = quickPick.selectedItems.map((item) => item.id);
        quickPick.hide();
        quickPick.dispose();
        resolve(selected);
      }
    });

    quickPick.onDidHide(() => {
      if (!resolved) {
        resolved = true;
        quickPick.dispose();
        resolve(undefined);
      }
    });

    quickPick.show();
  });
}

/**
 * Creates a summary string of the selected launch options.
 */
function summarizeLaunchOptions(options: LaunchOptions): string {
  const parts: string[] = [];

  if (options.openingMode) {
    parts.push(options.openingMode);
  }

  if (options.skipOnStartup) {
    parts.push('skip startup');
  }

  if (options.headless) {
    parts.push('headless');
  }

  if (options.dataless) {
    parts.push('dataless');
  } else if (options.createData) {
    parts.push('new data');
  } else if (options.dataFile) {
    parts.push('custom data');
  }

  if (parts.length === 0) {
    return '';
  }

  return ` (${parts.join(', ')})`;
}

export function deactivate() {}
