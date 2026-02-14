import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

export const VERSION = packageJson.version;