# Changelog

All notable changes to the 4D Helper extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-23

### Added
- **4D Server Connection**: Connect to 4D servers directly from VS Code
- **UDP Discovery Protocol**: Automatically discover 4D servers on the local network with database name and hostname
- **Network Scanning**: Scan configurable port range (default: 19800-19899) for 4D servers
- **Server Management**: Save, remove, and manage frequently used servers
- **4DLink Generation**: Generate temporary 4DLink files for seamless client connection
- **Smart Display**: Show discovered servers with database name, hostname, and related ports
- **Scan Caching**: Cache scan results with configurable timeout (default: 2 minutes)
- **Client Filtering**: Automatically filter 4D applications to only show clients (not servers)
- New commands:
  - `4D: Connect to 4D Server` - Connect to a saved or discovered server
  - `4D: Add Server` - Manually add a server
  - `4D: Remove Server` - Remove a saved server
  - `4D: Scan for 4D Servers` - Scan network for servers
- New settings:
  - `4d-helper.servers` - List of saved servers
  - `4d-helper.serverScan.portRange.start` - Start of port scan range
  - `4d-helper.serverScan.portRange.end` - End of port scan range
  - `4d-helper.serverScan.timeout` - Connection timeout in milliseconds
  - `4d-helper.serverScan.defaultPort` - Default 4D server port
  - `4d-helper.serverScan.cacheTimeout` - Cache timeout in seconds

## [0.1.1] - 2025-12-22

### Changed
- Updated README with version management documentation
- Refreshed extension logo

### Fixed
- Added `.env` to `.gitignore` to exclude environment configuration files

## [0.1.0] - 2025-12-22

### Added
- Initial release
- **Open 4D Project**: Open 4D projects with different 4D versions
- **Version Management**: Add and remove 4D application versions
- **Launch Options**: Configure launch options (interpreted/compiled mode, skip startup, headless, etc.)
- **Multi-Project Support**: Handle workspaces with multiple 4D projects
- Commands:
  - `4D: Open 4D Project` - Open the current project with a selected 4D version
  - `4D: Add Version` - Add a new 4D application to the list
  - `4D: Remove Version` - Remove a 4D application from the list
- Settings:
  - `4d-helper.applications` - List of configured 4D applications
  - `4d-helper.selectedProject` - Remember selected project in multi-project workspaces

[0.2.0]: https://github.com/ganbin/vscode-4d-helper/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ganbin/vscode-4d-helper/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ganbin/vscode-4d-helper/releases/tag/v0.1.0
