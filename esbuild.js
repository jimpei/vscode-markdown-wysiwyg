const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const commonOptions = {
    bundle: true,
    sourcemap: true,
    minify: !watch,
    logLevel: 'info',
};

async function build() {
    const extensionCtx = await esbuild.context({
        ...commonOptions,
        entryPoints: ['src/extension.ts'],
        outfile: 'dist/extension.js',
        platform: 'node',
        format: 'cjs',
        external: ['vscode'],
    });

    const webviewCtx = await esbuild.context({
        ...commonOptions,
        entryPoints: ['src/webview/main.ts'],
        outfile: 'dist/webview.js',
        platform: 'browser',
        format: 'iife',
    });

    if (watch) {
        await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
        console.log('watching...');
    } else {
        await extensionCtx.rebuild();
        await webviewCtx.rebuild();
        await extensionCtx.dispose();
        await webviewCtx.dispose();
    }
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
