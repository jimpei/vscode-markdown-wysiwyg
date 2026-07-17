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

let outlineUpdateHandle: number | undefined;

function scheduleOutlineUpdate() {
    if (outlineUpdateHandle !== undefined) {
        window.clearTimeout(outlineUpdateHandle);
    }
    outlineUpdateHandle = window.setTimeout(buildOutline, 150);
}

function buildOutline() {
    const panel = document.getElementById('outline');
    if (!panel) {
        return;
    }
    const headings = document.querySelectorAll<HTMLElement>('#editor h1, #editor h2, #editor h3, #editor h4');
    panel.innerHTML = '';
    if (headings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'outline-empty';
        empty.textContent = '見出しがありません';
        panel.appendChild(empty);
        return;
    }
    headings.forEach((heading) => {
        const level = Number(heading.tagName.slice(1));
        const item = document.createElement('div');
        item.className = `outline-item outline-level-${level}`;
        item.textContent = heading.textContent || '';
        item.addEventListener('click', () => {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        panel.appendChild(item);
    });
}

const outlineToggle = document.getElementById('outline-toggle');
const outlinePanel = document.getElementById('outline');
outlineToggle?.addEventListener('click', () => {
    outlinePanel?.classList.toggle('visible');
});

const root = document.getElementById('editor');
if (root) {
    new MutationObserver(scheduleOutlineUpdate).observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    void createEditor(root, '').then(() => {
        vscode.postMessage({ type: 'ready' });
    });
}
