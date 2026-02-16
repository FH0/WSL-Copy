import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const POWERSHELL_PATH = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

function wslPathToWindows(wslPath: string): string {
    if (wslPath.startsWith('/mnt/')) {
        const parts = wslPath.substring(5).split('/');
        const drive = parts[0].toUpperCase();
        const rest = parts.slice(1).join('\\');
        return `${drive}:\\${rest}`;
    }
    const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
    return `\\\\wsl$\\${distro}${wslPath.replace(/\//g, '\\')}`;
}

function buildPowerShellScript(windowsPaths: string[]): string {
    const filesAdd = windowsPaths.map(p => `$files.Add('${p}')`).join('\n');
    return `
Add-Type -AssemblyName System.Windows.Forms
$files = New-Object System.Collections.Specialized.StringCollection
${filesAdd}
[System.Windows.Forms.Clipboard]::SetFileDropList($files)
`;
}

function copyFilesToClipboard(windowsPaths: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const tempScript = path.join(os.tmpdir(), `wsl-copy-${Date.now()}.ps1`);
        fs.writeFileSync(tempScript, buildPowerShellScript(windowsPaths), 'utf8');

        const winScriptPath = wslPathToWindows(tempScript);
        const command = `"${POWERSHELL_PATH}" -NoProfile -STA -ExecutionPolicy Bypass -File "${winScriptPath}"`;

        exec(command, (error, _, stderr) => {
            fs.unlinkSync(tempScript);
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
        const windowsPaths = uris.map(u => wslPathToWindows(u.fsPath));
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
