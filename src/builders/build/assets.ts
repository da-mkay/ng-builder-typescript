import { JsonObject } from '@angular-devkit/core';
import { copySync } from 'fs-extra';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as glob from 'glob';
import * as chokidar from 'chokidar';
import { Observable, of } from 'rxjs';
import { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
import { normalizePath } from '../utils/path';

export interface AssetOption extends JsonObject {
    /**
     * Glob relative to input.
     */
    glob: string;
    /**
     * Relative to workspace root.
     */
    input: string;
    /**
     * Relative to outputPath.
     */
    output: string;
    /**
     * Globs relative to input.
     */
    ignore?: string[];
}

/**
 * Queue of asset files that should be copied.
 */
class AssetQueue {
    private assets = new Map<string, Set<AssetOption>>();

    contains(file: string, asset: AssetOption) {
        const assetSet = this.assets.get(file);
        return assetSet && assetSet.has(asset);
    }

    add(file: string, asset: AssetOption) {
        let assetSet = this.assets.get(file);
        if (!assetSet) {
            assetSet = new Set();
            this.assets.set(file, assetSet);
        }
        assetSet.add(asset);
    }

    remove(file: string, asset: AssetOption) {
        const assetSet = this.assets.get(file);
        if (assetSet) {
            assetSet.delete(asset);
            if (assetSet.size === 0) {
                this.assets.delete(file);
            }
        }
    }

    forEach(cb: (file: string, asset: AssetOption) => void) {
        for (const [file, assets] of this.assets.entries()) {
            for (const asset of assets) {
                cb(file, asset);
            }
        }
    }
}

/**
 * Handle assets:
 *  - search files using glob and copy them
 *  - watch folder for added/changed files and copy them
 */
export class Assets {
    private defaultIgnore = ['**/.DS_Store', '**/Thumbs.db'];
    private absRoot: string;
    private assets: AssetOption[];

    constructor(private context: BuilderContext, private absOutput: string, assets: AssetOption[]) {
        this.absRoot = normalizePath(context.workspaceRoot);
        this.absOutput = normalizePath(absOutput);
        this.assets = this.normalizeAssetOptions(assets);
    }

    private normalizeAssetOptions(assets: AssetOption[]): AssetOption[] {
        return assets.map((asset) => {
            asset.input = normalizePath(path.join(this.absRoot, asset.input));
            asset.output = normalizePath(path.join(this.absOutput, asset.output));
            asset.ignore = this.defaultIgnore.concat(asset.ignore || []);
            if (!asset.input.startsWith(this.absRoot + '/') && asset.input !== this.absRoot) {
                throw new Error('Invalid asset configuration. Asset input path must be beneath workspace root.');
            }
            if (asset.output !== this.absOutput && !asset.output.startsWith(this.absOutput + '/')) {
                throw new Error('Invalid asset configuration. Asset output path must be beneath project output path.');
            }
            return asset;
        });
    }

    private copyAsset(asset: AssetOption, file: string) {
        const inFile = path.join(asset.input, file);
        const outFile = path.join(asset.output, file);
        copySync(inFile, outFile);
    }

    copy() {
        for (const asset of this.assets) {
            const files = glob.sync(asset.glob, { cwd: asset.input, nodir: true, ignore: asset.ignore });
            for (const file of files) {
                this.copyAsset(asset, file);
            }
        }
    }

    watchAndCopy(): Observable<BuilderOutput> {
        if (this.assets.length === 0) {
            return of({ success: true });
        }
        return new Observable<BuilderOutput>((subscriber) => {
            const failedFiles = new AssetQueue();
            const waitingFiles = new AssetQueue();
            const ready = this.assets.map(() => false);
            const watcherReady = (i: number) => {
                ready[i] = true;
                if (ready.some((r) => !r)) {
                    return;
                }
                // Once all watchers have emitted ready event: copy files
                let success = true;
                waitingFiles.forEach((file, asset) => {
                    waitingFiles.remove(file, asset);
                    try {
                        this.copyAsset(asset, file);
                    } catch (err) {
                        success = false;
                        failedFiles.add(file, asset);
                        this.context.logger.error(`Failed to copy asset "${file}".`);
                    }
                });
                subscriber.next({ success });
            };
            const watchers = this.assets.map((asset, i) => {
                const watcher = chokidar.watch('.', {
                    cwd: asset.input,
                    ignored: (path) => {
                        return (asset.ignore ?? []).some((ignore) => minimatch(path, ignore));
                    },
                    awaitWriteFinish: true,
                });
                const onFileAddedOrChanged = (file: string) => {
                    if (!minimatch(file, asset.glob)) {
                        return;
                    }
                    if (!ready[i]) {
                        waitingFiles.add(file, asset);
                        return;
                    }
                    // first retry copying previously failed files
                    let success = true;
                    failedFiles.forEach((file, asset) => {
                        try {
                            this.copyAsset(asset, file);
                            failedFiles.remove(file, asset);
                        } catch (err) {
                            success = false;
                        }
                    });
                    // then copy new added/modified file
                    if (!failedFiles.contains(file, asset)) {
                        try {
                            this.copyAsset(asset, file);
                        } catch (err) {
                            success = false;
                            failedFiles.add(file, asset);
                            this.context.logger.error(`Failed to copy asset "${file}".`);
                        }
                    }
                    subscriber.next({ success });
                };
                watcher.on('ready', () => {
                    watcherReady(i);
                });
                watcher.on('add', onFileAddedOrChanged);
                watcher.on('change', onFileAddedOrChanged);
                watcher.on('error', (error) => {
                    this.context.logger.warn('File watcher failed: ' + error);
                });
                return watcher;
            });
            return () => {
                for (const watcher of watchers) {
                    watcher.close();
                }
            };
        });
    }
}
