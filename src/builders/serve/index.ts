import { BuilderContext, BuilderOutput, createBuilder, scheduleTargetAndForget, targetFromTargetString } from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';
import { combineLatest, defer, Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { dim } from 'ansi-colors';
import { nodeLauncher, NodeLauncherOptions } from '../utils/node-launcher';
import { PrefixLogger } from '../utils/prefix-logger';
import { BuildOptions, parseTsConfig } from '../build';
import { existsSync } from 'fs-extra';
import * as path from 'path';
import { normalizePath } from '../utils/path';
import * as ts from 'typescript';

/**
 * Options for the "serve" builder.
 */
export interface ServeOptions extends JsonObject {
    buildTarget: string;
    main: string;
    nodeBin?: string;
    cwd?: string;
    args?: string[];
}

/**
 * Run a @da-mkay/ng-builder-typescript build target in watch mode and run it in a Node.js process each time
 * the compilation succeeded.
 */
export const execute = (options: ServeOptions, context: BuilderContext): Observable<BuilderOutput> => {
    return defer(async () => {
        if (options.nodeBin && !existsSync(options.nodeBin)) {
            throw new Error(`node binary not found: ${options.nodeBin}`);
        }
        const buildTarget = targetFromTargetString(options.buildTarget);
        const buildTargetOptions = (await context.getTargetOptions(buildTarget)) as BuildOptions;
        const parsedCommandLine = parseTsConfig(context, buildTargetOptions.tsConfig, ts.sys, buildTargetOptions.outputPath);
        const outputPath = normalizePath(parsedCommandLine.options.outDir);
        let cwd = outputPath;
        if (options.cwd) {
            if (!existsSync(options.cwd)) {
                throw new Error(`cwd not found: ${options.cwd}`);
            }
            cwd = options.cwd;
        }
        const main = normalizePath(path.join(outputPath, options.main));
        if (!main.startsWith(outputPath + '/')) {
            throw new Error(`main file must be beneath outputPath`);
        }
        const nodeLauncherOpts: NodeLauncherOptions = {
            main,
            cwd,
            nodeBin: options.nodeBin,
            args: options.args,
        };
        return nodeLauncherOpts;
    }).pipe(
        switchMap((nodeLauncherOpts) => {
            const parentLogger = context.logger.createChild('');
            const logger = new PrefixLogger('Serve', parentLogger, null, true);
            const buildLogger = new PrefixLogger('Build', parentLogger, null, true);
            const mainLogger = new PrefixLogger('Main', parentLogger, dim, true);
            logger.info(`Schedule build target "${options.buildTarget}" in watch mode`);
            const buildOutput$ = scheduleTargetAndForget(
                context,
                targetFromTargetString(options.buildTarget),
                { watch: true },
                { logger: buildLogger }
            );
            return combineLatest([buildOutput$, nodeLauncher(mainLogger, nodeLauncherOpts)]).pipe(
                tap(([buildOutput, node]) => {
                    if (buildOutput.success) {
                        if (existsSync(nodeLauncherOpts.main)) {
                            node.open();
                        } else {
                            logger.error(`Cannot launch Node.js process. Main file not found: ${nodeLauncherOpts.main}`);
                        }
                    }
                }),
                map(([buildOutput]) => buildOutput)
            );
        })
    );
};

export default createBuilder<ServeOptions, BuilderOutput>(execute);
