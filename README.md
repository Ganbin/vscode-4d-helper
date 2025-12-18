# 4D Helper - VSCode Extension

A VSCode extension that simplifies 4D development by providing an easy way to launch 4D projects with different versions of 4D applications and various launch options.

> **Note:** This extension was developed for my personal workflow, but I thought it might be useful to others working with 4D. Feel free to use it, and contributions are welcome!
>
> Built with the help of [Claude Code](https://claude.ai/claude-code) 🤖

## Features

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

### Multiple Projects in Workspace

If your workspace contains multiple 4D projects, the extension will ask you to select one. Your choice is remembered for future launches (stored in workspace settings).

## Requirements

- VSCode 1.85.0 or higher
- One or more 4D applications installed on your system

## License

MIT License - see [LICENSE](LICENSE) file for details.
