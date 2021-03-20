import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { defer, Observable, of, combineLatest } from 'rxjs';
import { readFileSync, removeSync, existsSync } from 'fs-extra';
import { JsonObject } from '@angular-devkit/core';
import * as ts from 'typescript';
import * as path from 'path';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AssetOption, Assets } from './assets';

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
        const tsconfigPath = path.resolve(context.workspaceRoot, options.tsConfig);
        if (!existsSync(tsconfigPath)) {
            throw new Error(`tsconfig file could not be found: ${tsconfigPath}`);
        }
        const parsedCommandLine = readTsconfig(tsconfigPath, context);
        if (options.outputPath) {
            parsedCommandLine.options.outDir = path.resolve(context.workspaceRoot, options.outputPath);
        } else if (!parsedCommandLine.options.outDir) {
            throw new Error('outputPath in angular.json not set and no outDir set in tsconfig!');
        } else {
            parsedCommandLine.options.outDir = path.resolve(context.workspaceRoot, parsedCommandLine.options.outDir);
        }
        if (options.cleanOutputPath && parsedCommandLine.options.outDir) {
            removeSync(parsedCommandLine.options.outDir);
        }
        const assets = new Assets(context, parsedCommandLine.options.outDir, options.assets || []);
        initFileReplacementHandling(context, options.fileReplacements);
        const result: [ts.ParsedCommandLine, Assets] = [parsedCommandLine, assets];
        return of(result);
    }).pipe(
        switchMap(([parsedCommandLine, assets]) => {
            if (options.watch) {
                return combineLatest([buildWatch(parsedCommandLine.options.outDir, options, context), assets.watchAndCopy()]).pipe(
                    map(([buildResult, assetResult]) => ({
                        success: buildResult.success && assetResult.success,
                    }))
                );
            }
            assets.copy();
            return buildOnce(parsedCommandLine, context);
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
function buildWatch(outDir: string, options: BuildOptions, context: BuilderContext) {
    return new Observable<BuilderOutput>((subscriber) => {
        const host = ts.createWatchCompilerHost(
            options.tsConfig,
            { outDir },
            ts.sys,
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
async function buildOnce(parsedCommandLine: ts.ParsedCommandLine, context: BuilderContext) {
    const p: ts.Program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options);
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

function initFileReplacementHandling(context: BuilderContext, fileReplacements: { replace: string; with: string }[] = []) {
    const replacements = new Map<string, string>(
        fileReplacements.map((fr) => [path.resolve(context.workspaceRoot, fr.replace), path.resolve(context.workspaceRoot, fr.with)])
    );

    const origReadFile = ts.sys.readFile.bind(ts.sys);
    ts.sys.readFile = ((p, enc) => {
        p = replacements.get(p) || p;
        return origReadFile(p, enc);
    }).bind(ts.sys);

    const origWatch = ts.sys.watchFile.bind(ts.sys);
    ts.sys.watchFile = ((p, cb, pi, opts) => {
        p = replacements.get(p) || p;
        return origWatch(p, cb, pi, opts);
    }).bind(ts.sys);
}

export default createBuilder<BuildOptions, BuilderOutput>(execute);
