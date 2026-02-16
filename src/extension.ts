import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const POWERSHELL_PATH = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

async function wslPathToWindows(wslPath: string): Promise<string> {
    const { stdout } = await execAsync(`wslpath -w '${wslPath.replace(/'/g, "'\\''")}'`);
    return stdout.trim();
}

function buildPathList(windowsPaths: string[]): string {
    return windowsPaths.map(p => `"${p}"`).join(',');
}

async function copyFilesToClipboard(windowsPaths: string[]): Promise<void> {
    const pathList = buildPathList(windowsPaths);
    const command = `"${POWERSHELL_PATH}" -NoProfile -STA -ExecutionPolicy Bypass -Command 'Set-Clipboard -Path ${pathList}'`;
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve();
            }
        });
    });
}

function getSelectedUris(uri: vscode.Uri | undefined, selectedUris: vscode.Uri[] | undefined): vscode.Uri[] {
    if (selectedUris && selectedUris.length > 0) {
        return selectedUris;
    }
    if (uri) {
        return [uri];
    }
    return [];
}

function formatSuccessMessage(uris: vscode.Uri[]): string {
    if (uris.length === 1) {
        return `Copied: ${path.basename(uris[0].fsPath)}`;
    }
    return `Copied ${uris.length} files`;
}

async function handleCopyRealFile(uri: vscode.Uri | undefined, selectedUris: vscode.Uri[] | undefined): Promise<void> {
    const uris = getSelectedUris(uri, selectedUris);
    if (uris.length === 0) {
        vscode.window.showErrorMessage('No file selected');
        return;
    }
    try {
        const windowsPaths = await Promise.all(uris.map(u => wslPathToWindows(u.fsPath)));
        await copyFilesToClipboard(windowsPaths);
        vscode.window.showInformationMessage(formatSuccessMessage(uris));
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Copy failed: ${msg}`);
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('wsl-copy.copyRealFile', handleCopyRealFile)
    );
}

export function deactivate() {}
