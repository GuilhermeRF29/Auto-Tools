import fs from 'fs';
import path from 'path';

export function isPathSafe(filePath, allowedDir) {
    if (!filePath || !allowedDir) return false;
    try {
        const resolvedFile = fs.realpathSync(path.resolve(filePath));
        const resolvedDir = fs.realpathSync(path.resolve(allowedDir));
        return resolvedFile.startsWith(resolvedDir + path.sep) || resolvedFile === resolvedDir;
    } catch {
        return false;
    }
}
