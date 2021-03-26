import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { defer, Observable, of, combineLatest } from 'rxjs';
import { readFileSync, removeSync, existsSync } from 'fs-extra';
import { JsonObject } from '@angular-devkit/core';
import * as ts from 'typescript';
import * as path from 'path';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AssetOption, Assets } from './assets';
import { normalizePath } from '../utils/path';

/**
 * Options for the "build" builder.
 */
export interface BuildOptions extends JsonObject {
    cleanOutputPath: boolean;
    outputPath?: string;
    tsConfig: string;
    watch: boolean;
    assets?: AssetOption[];
    fileReplacements?: { replace: string; with: string }[];
}

const formatHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getCanonicalFileName: (f) => f,
    getNewLine: () => '\n',
};

/**
 * Use typescript compiler to compile a project.
 */
export const execute = (options: BuildOptions, context: BuilderContext): Observable<BuilderOutput> => {
    return defer(() => {
        const parsedCommandLine = parseTsConfig(context, options.tsConfig, options.outputPath);
        if (options.cleanOutputPath && parsedCommandLine.options.outDir) {
            removeSync(parsedCommandLine.options.outDir);
        }
        const assets = new Assets(context, parsedCommandLine.options.outDir, options.assets || []);
        const customTsSys = createFileReplacementTsSystem(context, options.fileReplacements);
        const result: [ts.ParsedCommandLine, ts.System, Assets] = [parsedCommandLine, customTsSys, assets];
        return of(result);
    }).pipe(
        switchMap(([parsedCommandLine, customTsSys, assets]) => {
            if (options.watch) {
                return combineLatest([
                    buildWatch(parsedCommandLine.options.outDir, options, context, customTsSys),
                    assets.watchAndCopy(),
                ]).pipe(
                    map(([buildResult, assetResult]) => ({
                        success: buildResult.success && assetResult.success,
                    }))
                );
            }
            assets.copy();
            return buildOnce(parsedCommandLine, context, customTsSys);
        }),
        catchError((err) => {
            context.logger.error(err.message || err + '');
            return of({ success: false });
        })
    );
};

/**
 * Compile the project, then wait for file changes and re-compile on each change.
 */
function buildWatch(outDir: string, options: BuildOptions, context: BuilderContext, customTsSys: ts.System) {
    return new Observable<BuilderOutput>((subscriber) => {
        const host = ts.createWatchCompilerHost(
            options.tsConfig,
            { outDir },
            customTsSys,
            ts.createEmitAndSemanticDiagnosticsBuilderProgram,
            (diagnostic) => logDiagnostics(diagnostic, context),
            (diagnostic, newLine, opts, errorCount?) => {
                if (diagnostic.code === 6031 || diagnostic.code === 6032) {
                    // Starting compilation in watch mode...
                    // or
                    // File change detected. Starting incremental compilation...
                    context.reportRunning();
                } else if (diagnostic.code === 6193 || diagnostic.code === 6194) {
                    // Found 1 error. Watching for file changes.
                    // or
                    // Found {0} errors. Watching for file changes.
                    // NOTE: errorCount argument is not provided if typescript<3.7 is used. In that case get error count from message.
                    // TODO: improve: get errors from diagnostics, e.g. in host.afterProgramCreate (see original ts-code of emitFilesAndReportErrors)
                    if (errorCount === undefined) {
                        if (typeof diagnostic.messageText === 'string') {
                            const m = diagnostic.messageText.match(/\d+/);
                            errorCount = m === null ? 0 : Number(m[0]);
                        } else {
                            errorCount = 0;
                        }
                    }
                    subscriber.next({ success: errorCount === 0 });
                }
                logDiagnostics(diagnostic, context);
            }
        );
        const watchProgram = ts.createWatchProgram(host);
        return () => {
            watchProgram.close();
        };
    });
}

/**
 * Compile the project once, then complete.
 */
async function buildOnce(parsedCommandLine: ts.ParsedCommandLine, context: BuilderContext, customTsSys: ts.System) {
    // We use createIncrementalCompilerHost, s.t. we can specify a custom ts.System to use ...
    const host = ts.createIncrementalCompilerHost(parsedCommandLine.options, customTsSys);
    // ... but we use createProgram instead of createIncrementalProgram because we are not interested in incremental builds (for now)
    const p = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options, host);
    const emitResult = p.emit();
    const diagnostics = ts.getPreEmitDiagnostics(p).concat(emitResult.diagnostics);
    logDiagnostics(diagnostics, context);
    const success = !emitResult.emitSkipped && !diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error);
    if (success) {
        context.logger.info('Build successfully.');
    }
    return { success };
}

/**
 * TS logs end with newline which we remove here.
 */
function removeTrailingWS(s: string) {
    return s.replace(/\s+$/g, '');
}

function logDiagnostics(diagnostics: ts.Diagnostic | ts.Diagnostic[], context: BuilderContext) {
    const ds = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
    for (const d of ds) {
        if (d.category === ts.DiagnosticCategory.Message) {
            // Do not log prefix "message TS12345: "
            context.logger.info(removeTrailingWS(ts.flattenDiagnosticMessageText(d.messageText, formatHost.getNewLine())));
        } else {
            const msg = removeTrailingWS(ts.formatDiagnostic(d, formatHost));
            if (d.category === ts.DiagnosticCategory.Error) {
                context.logger.error(msg);
            } else if (d.category === ts.DiagnosticCategory.Warning) {
                context.logger.warn(msg);
            } else {
                context.logger.info(msg);
            }
        }
    }
}

/**
 * Parse tsconfig file.
 * @param context The builder context.
 * @param tsConfig The path to the tsconfig file (relative to workspace root).
 * @param outputPath The path to an output folder to use (relative to workspace root). This overrides the tsconfig's outDir option.
 */
export function parseTsConfig(context: BuilderContext, tsConfig: string, outputPath?: string) {
    const tsconfigPath = path.resolve(context.workspaceRoot, tsConfig);
    if (!existsSync(tsconfigPath)) {
        throw new Error(`tsconfig file could not be found: ${tsconfigPath}`);
    }
    const parsedCommandLine = readTsconfig(tsconfigPath, context);
    if (outputPath) {
        parsedCommandLine.options.outDir = path.resolve(context.workspaceRoot, outputPath);
    } else if (!parsedCommandLine.options.outDir) {
        throw new Error('outputPath in angular.json not set and no outDir set in tsconfig!');
    } else {
        parsedCommandLine.options.outDir = path.resolve(context.workspaceRoot, parsedCommandLine.options.outDir);
    }
    return parsedCommandLine;
}

function readTsconfig(tsconfigPath: string, context: BuilderContext) {
    const tsconfigText = readFileSync(tsconfigPath, { encoding: 'utf8' });
    const tsconfigJSON = ts.parseConfigFileTextToJson(tsconfigPath, tsconfigText);
    if (!tsconfigJSON.config) {
        logDiagnostics(tsconfigJSON.error, context);
        throw new Error('Failed to parse tsconfig');
    }
    const basePath = path.dirname(tsconfigPath);
    const parsedCommandLine = ts.parseJsonConfigFileContent(tsconfigJSON.config, ts.sys, basePath, undefined, tsconfigPath);
    if (parsedCommandLine.errors.length) {
        logDiagnostics(parsedCommandLine.errors, context);
        throw new Error('Failed to parse tsconfig');
    }
    return parsedCommandLine;
}

function createFileReplacementTsSystem(context: BuilderContext, fileReplacements: { replace: string; with: string }[] = []) {
    const replacements = new Map<string, string>(
        fileReplacements.map((fr) => [
            normalizePath(path.join(context.workspaceRoot, fr.replace)),
            normalizePath(path.join(context.workspaceRoot, fr.with)),
        ])
    );

    // use Proxy, s.t. we don't need to monkey-patch ts.sys
    const customTsSys = new Proxy(ts.sys, {
        get: function (target, prop, receiver) {
            if (prop === 'readFile') {
                return function (path, encoding?) {
                    path = replacements.get(path) || path;
                    return target[prop](path, encoding);
                }.bind(target);
            }
            if (prop === 'watchFile') {
                return function (path, callback, pollingInterval?, options?) {
                    path = replacements.get(path) || path;
                    return target[prop](path, callback, pollingInterval, options);
                }.bind(target);
            }
            return Reflect.get(target, prop, receiver);
        },
    });

    return customTsSys;
}

export default createBuilder<BuildOptions, BuilderOutput>(execute);
