import * as vscode from 'vscode';

class MarkdownWysiwygEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'markdownWysiwyg.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

        let applyingRemoteChange = false;

        const postDocument = () => {
            webviewPanel.webview.postMessage({
                type: 'init',
                markdown: document.getText(),
            });
        };

        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'ready') {
                postDocument();
                return;
            }
            if (message.type === 'edit') {
                if (message.markdown === document.getText()) {
                    return;
                }
                applyingRemoteChange = true;
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, document.lineCount, 0),
                    message.markdown,
                );
                await vscode.workspace.applyEdit(edit);
                applyingRemoteChange = false;
            }
        });

        const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString() && !applyingRemoteChange) {
                postDocument();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeSub.dispose();
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css'),
        );
        const nonce = String(Date.now());

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${styleUri}">
    <title>Markdown WYSIWYG</title>
</head>
<body>
    <button id="outline-toggle" type="button" aria-label="アウトラインの表示切り替え">&#9776;</button>
    <nav id="outline" class="outline-panel"></nav>
    <div id="editor"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            MarkdownWysiwygEditorProvider.viewType,
            new MarkdownWysiwygEditorProvider(context),
            { webviewOptions: { retainContextWhenHidden: true } },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownWysiwyg.openWithWysiwyg', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            await vscode.commands.executeCommand(
                'vscode.openWith',
                editor.document.uri,
                MarkdownWysiwygEditorProvider.viewType,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('markdownWysiwyg.toggleWysiwyg', async () => {
            const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
            if (!tab) {
                return;
            }

            if (
                tab.input instanceof vscode.TabInputCustom &&
                tab.input.viewType === MarkdownWysiwygEditorProvider.viewType
            ) {
                await vscode.commands.executeCommand('vscode.openWith', tab.input.uri, 'default');
                return;
            }

            let uri: vscode.Uri | undefined;
            if (tab.input instanceof vscode.TabInputText) {
                uri = tab.input.uri;
            } else if (tab.input instanceof vscode.TabInputCustom) {
                uri = tab.input.uri;
            }
            if (!uri) {
                return;
            }
            await vscode.commands.executeCommand(
                'vscode.openWith',
                uri,
                MarkdownWysiwygEditorProvider.viewType,
            );
        }),
    );
}

export function deactivate() {}
