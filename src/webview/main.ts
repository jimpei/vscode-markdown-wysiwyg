import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism } from '@milkdown/plugin-prism';
import { nord } from '@milkdown/theme-nord';

declare global {
    interface Window {
        acquireVsCodeApi: () => {
            postMessage: (message: unknown) => void;
            getState: () => unknown;
            setState: (state: unknown) => void;
        };
    }
}

const vscode = window.acquireVsCodeApi();

interface UiState {
    themeLight?: boolean;
    reading?: boolean;
    readingFont?: 'serif' | 'sans';
}

const uiState: UiState = (vscode.getState() as UiState) ?? {};

function saveUiState() {
    vscode.setState(uiState);
}

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
        .use(prism)
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
    const visible = outlinePanel?.classList.toggle('visible');
    document.body.classList.toggle('outline-visible', visible);
});

const themeToggle = document.getElementById('theme-toggle');

function applyTheme() {
    document.body.classList.toggle('theme-light', !!uiState.themeLight);
    if (themeToggle) {
        themeToggle.textContent = uiState.themeLight ? '☀' : '☽';
    }
}

themeToggle?.addEventListener('click', () => {
    uiState.themeLight = !uiState.themeLight;
    saveUiState();
    applyTheme();
});

const styleToggle = document.getElementById('style-toggle');

function applyStyle() {
    const reading = !!uiState.reading;
    const sans = reading && uiState.readingFont === 'sans';
    document.body.classList.toggle('style-reading', reading);
    document.body.classList.toggle('reading-sans', sans);
    if (styleToggle) {
        styleToggle.textContent = !reading ? 'Aa' : sans ? 'ゴ' : '明';
        styleToggle.title = !reading
            ? 'リーディングスタイル: オフ'
            : sans
              ? 'リーディングスタイル: ゴシック'
              : 'リーディングスタイル: 明朝';
    }
}

/* エディタ → リーディング(明朝) → リーディング(ゴシック) → エディタ の循環 */
styleToggle?.addEventListener('click', () => {
    if (!uiState.reading) {
        uiState.reading = true;
        uiState.readingFont = 'serif';
    } else if (uiState.readingFont !== 'sans') {
        uiState.readingFont = 'sans';
    } else {
        uiState.reading = false;
    }
    saveUiState();
    applyStyle();
});

applyTheme();
applyStyle();

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
