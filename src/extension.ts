import * as vscode from 'vscode';
import * as path from 'path';
import { find4DProjectFile, FourDProjectFile } from './utils/projectFinder';
import { open4DProject, LaunchOptions, setOutputChannel } from './utils/launcher';

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
