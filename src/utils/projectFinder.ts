import * as fs from 'fs';
import * as path from 'path';

/**
 * Regex pattern to match Component-like folder names.
 * Matches: Components, Components.src, Components_src, components, etc.
 */
const COMPONENTS_FOLDER_PATTERN = /^components([\._]src)?$/i;

/**
 * Represents a found 4D project file with metadata.
 */
export interface FourDProjectFile {
  /** Full path to the .4DProject file */
  path: string;
  /** Name of the project (filename without extension) */
  name: string;
  /** Parent folder name (usually "Project") */
  parentFolder: string;
  /** Relative path from workspace root for display */
  relativePath: string;
}

/**
 * Finds all .4DProject files in the workspace, excluding those in Components folders.
 *
 * @param workspacePath - The root path of the workspace
 * @param maxDepth - Maximum depth to search (default: 5)
 * @returns Array of found project files
 */
export async function findAll4DProjectFiles(
  workspacePath: string,
  maxDepth: number = 5
): Promise<FourDProjectFile[]> {
  const projects: FourDProjectFile[] = [];
  await searchForAllProjectFiles(workspacePath, workspacePath, 0, maxDepth, projects, []);
  return projects;
}

/**
 * Finds a single .4DProject file, prioritizing the root Project folder.
 * Returns null if none found, or the list if multiple are found.
 *
 * @param workspacePath - The root path of the workspace
 * @returns Single project path, null if none, or array if multiple candidates
 */
export async function find4DProjectFile(
  workspacePath: string
): Promise<string | null | FourDProjectFile[]> {
  const allProjects = await findAll4DProjectFiles(workspacePath);

  if (allProjects.length === 0) {
    return null;
  }

  if (allProjects.length === 1) {
    return allProjects[0].path;
  }

  // Try to find the one in the root "Project" folder
  const rootProject = allProjects.find((p) => {
    const relativeDir = path.dirname(p.relativePath);
    return relativeDir === 'Project' || relativeDir === '.';
  });

  if (rootProject) {
    return rootProject.path;
  }

  // Multiple candidates found, return all for user selection
  return allProjects;
}

async function searchForAllProjectFiles(
  basePath: string,
  currentPath: string,
  currentDepth: number,
  maxDepth: number,
  results: FourDProjectFile[],
  pathSegments: string[]
): Promise<void> {
  if (currentDepth > maxDepth) {
    return;
  }

  // Check if current path is inside a Components folder
  if (isInsideComponentsFolder(pathSegments)) {
    return;
  }

  try {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });

    // First, find any .4DProject files in current directory
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.4DProject')) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        results.push({
          path: fullPath,
          name: entry.name.replace('.4DProject', ''),
          parentFolder: path.basename(currentPath),
          relativePath,
        });
      }
    }

    // Then, recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await searchForAllProjectFiles(
          basePath,
          path.join(currentPath, entry.name),
          currentDepth + 1,
          maxDepth,
          results,
          [...pathSegments, entry.name]
        );
      }
    }
  } catch {
    // Ignore permission errors or inaccessible directories
  }
}

/**
 * Checks if any segment in the path matches the Components folder pattern.
 */
function isInsideComponentsFolder(pathSegments: string[]): boolean {
  return pathSegments.some((segment) => COMPONENTS_FOLDER_PATTERN.test(segment));
}
