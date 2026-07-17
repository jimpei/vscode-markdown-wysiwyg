import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { nord } from '@milkdown/theme-nord';

declare global {
    interface Window {
        acquireVsCodeApi: () => {
            postMessage: (message: unknown) => void;
        };
    }
}

const vscode = window.acquireVsCodeApi();

let editor: Editor | undefined;
let lastKnownMarkdown = '';
let suppressNextUpdate = false;

async function createEditor(root: HTMLElement, markdown: string) {
    lastKnownMarkdown = markdown;

    editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, markdown);
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .config((ctx) => {
            const listenerApi = ctx.get(listenerCtx);
            listenerApi.markdownUpdated((_, markdown) => {
                if (suppressNextUpdate) {
                    suppressNextUpdate = false;
                    return;
                }
                if (markdown === lastKnownMarkdown) {
                    return;
                }
                lastKnownMarkdown = markdown;
                vscode.postMessage({ type: 'edit', markdown });
            });
        })
        .create();
}

async function replaceContent(markdown: string) {
    if (markdown === lastKnownMarkdown) {
        return;
    }
    lastKnownMarkdown = markdown;
    suppressNextUpdate = true;
    if (editor) {
        await editor.destroy();
    }
    const root = document.getElementById('editor');
    if (root) {
        root.innerHTML = '';
        await createEditor(root, markdown);
    }
}

window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'init') {
        void replaceContent(message.markdown);
    }
});

const root = document.getElementById('editor');
if (root) {
    void createEditor(root, '').then(() => {
        vscode.postMessage({ type: 'ready' });
    });
}
