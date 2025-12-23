# 4D Helper - VSCode Extension

A VSCode extension that simplifies 4D development by providing an easy way to launch 4D projects with different versions of 4D applications, connect to 4D servers, and configure various launch options.

> **Note:** This extension was developed for my personal workflow, but I thought it might be useful to others working with 4D. Feel free to use it, and contributions are welcome!
>
> Built with the help of [Claude Code](https://claude.ai/claude-code) 🤖

## Features

### Project Management
- **Automatic Project Detection** - Recursively finds `.4DProject` files in your workspace
- **Smart Filtering** - Automatically excludes projects inside `Components`, `Components.src`, or `Components_src` folders
- **Multiple 4D Versions** - Configure and quickly switch between different 4D application versions
- **Launch Options** - Choose how to open your project:
  - Interpreted or Compiled mode
  - Custom data file (.4DD)
  - Create new data
  - Dataless mode
  - Skip On Startup
  - Headless mode

### Server Connection
- **Network Discovery** - Automatically scan your local network for 4D servers
- **UDP Discovery Protocol** - Detect servers with database name and hostname information
- **Server Management** - Save frequently used servers for quick access
- **Smart Display** - Shows database name, hostname, and all related ports (SQL, App, DB4D, Debugger)
- **Scan Caching** - Results are cached to avoid rescanning (configurable timeout)
- **Client Filtering** - Only shows 4D client applications (filters out 4D Server)

### General
- **Cross-Platform** - Works on macOS and Windows

## Installation

### From VSIX (Manual)

1. Download the `.vsix` file from the [Releases](../../releases) page
2. In VSCode, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run `Extensions: Install from VSIX...`
4. Select the downloaded file

### From Source

```bash
git clone https://github.com/ganbin/vscode-4d-helper.git
cd vscode-4d-helper
npm install
npm run compile
```

Then press `F5` in VSCode to run the extension in development mode.

## Configuration

Before using the extension, configure your 4D applications in VSCode settings.

### macOS

```json
{
  "4d-helper.applications": [
    {
      "name": "4D v20 R8",
      "path": "/Applications/4D v20 R8/4D.app"
    },
    {
      "name": "4D v20.6",
      "path": "/Applications/4D v20.6/4D.app"
    }
  ]
}
```

### Windows

```json
{
  "4d-helper.applications": [
    {
      "name": "4D v20 R8",
      "path": "C:\\Program Files\\4D\\4D v20 R8\\4D.exe"
    },
    {
      "name": "4D v20.6",
      "path": "C:\\Program Files\\4D\\4D v20.6\\4D.exe"
    }
  ]
}
```

## Usage

### Opening a Project

1. Open a folder containing a 4D project in VSCode

2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)

3. Run the command: **4D: Open 4D Project**

4. If you have multiple 4D applications configured, select which version to use

5. Choose your launch options (you can select multiple):

   | Option | Description |
   |--------|-------------|
   | **Interpreted** | Run in interpreted mode (default) |
   | **Compiled** | Run in compiled mode |
   | **Select Data File** | Choose a specific `.4DD` data file |
   | **Create New Data** | Create a new data file on launch |
   | **Dataless** | Open without any data file |
   | **Skip On Startup** | Skip the On Startup database method |
   | **Headless** | Run without the 4D GUI |

6. The extension launches 4D with your project and selected options

### Managing 4D Versions

Instead of manually editing the JSON configuration, you can use the built-in commands to manage your 4D versions:

#### Adding a 4D Version

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run the command: **4D: Add Version**
3. Browse and select your 4D application (.app on macOS, .exe on Windows)
4. Enter a display name for this version (defaults to the application name)
5. Choose where to save the configuration:
   - **User Settings** - Available in all workspaces
   - **Workspace Settings** - Only available in the current workspace

#### Removing a 4D Version

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run the command: **4D: Remove Version**
3. Select the version you want to remove from the list
4. Confirm the removal

### Multiple Projects in Workspace

If your workspace contains multiple 4D projects, the extension will ask you to select one. Your choice is remembered for future launches (stored in workspace settings).

### Connecting to a 4D Server

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)

2. Run the command: **4D: Connect to 4D Server**

3. The extension automatically scans your network for 4D servers and displays:
   - **Saved Servers** - Your previously saved servers with online/offline status
   - **Discovered on Network** - Servers found via UDP discovery showing database name and hostname

4. Select a server to connect to

5. Choose which 4D client application to use (4D Server applications are filtered out)

6. The extension generates a temporary 4DLink file and launches the client

#### Managing Servers

| Command | Description |
|---------|-------------|
| **4D: Add Server** | Manually add a server by entering IP/hostname and port |
| **4D: Remove Server** | Remove a saved server from your list |
| **4D: Scan for 4D Servers** | Standalone network scan with multi-select to save servers |

#### Server Scan Settings

You can configure the server scanning behavior in your settings:

```json
{
  "4d-helper.serverScan.portRange.start": 19800,
  "4d-helper.serverScan.portRange.end": 19899,
  "4d-helper.serverScan.timeout": 500,
  "4d-helper.serverScan.defaultPort": 19813,
  "4d-helper.serverScan.cacheTimeout": 120
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `portRange.start` | 19800 | Start of port range to scan |
| `portRange.end` | 19899 | End of port range to scan |
| `timeout` | 500 | Connection timeout in milliseconds |
| `defaultPort` | 19813 | Default 4D server port |
| `cacheTimeout` | 120 | Seconds before cached scan results expire |

## Requirements

- VSCode 1.85.0 or higher
- One or more 4D applications installed on your system

## License

MIT License - see [LICENSE](LICENSE) file for details.
