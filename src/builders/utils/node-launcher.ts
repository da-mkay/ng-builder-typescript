import { logging } from '@angular-devkit/core';
import { ChildProcess, spawn } from 'child_process';
import { Observable } from 'rxjs';
import { StringDecoder } from 'string_decoder';

// TODO: Code similar to ElectronRunner of @da-mkay/ng-builder-electron --> move to new lib to reduce duplicate code

export interface NodeLauncherOptions {
    main: string;
    nodeBin?: string;
    cwd: string;
    args?: string[];
}

/**
 * NodeLauncher can be used to start a Node.js process and kill it.
 */
export class NodeLauncher {
    private proc: ChildProcess;

    /**
     * Create a new NodeLauncher
     * @param logger The logger to use for the output of the Node.js process.
     * @param options Contains the path to the main file to launch and other optional values like Node.js binary path etc.
     */
    constructor(private logger: logging.Logger, private options: NodeLauncherOptions) {}

    /**
     * Create a new Node.js process, killing any previously created and currently running Node.js process.
     */
    open() {
        if (this.proc) {
            this.kill();
        }
        const args = this.options.args ? this.options.args : [];
        const proc = spawn(this.options.nodeBin || process.execPath, [this.options.main, ...args], {
            cwd: this.options.cwd,
            stdio: [0, 'pipe', 'pipe'],
        });
        this.proc = proc;
        const decOut = new StringDecoder('utf8');
        const decErr = new StringDecoder('utf8');
        let fullOut = '';
        let fullErr = '';
        const log = (s: string) => {
            this.logger.info(s);
        };
        this.proc.stdout.on('data', (data) => {
            fullOut += decOut.write(data);
            const i = fullOut.lastIndexOf('\n');
            if (i >= 0) {
                log(fullOut.substring(0, i));
                fullOut = fullOut.substr(i + 1);
            }
        });
        this.proc.stderr.on('data', (data) => {
            fullErr += decErr.write(data);
            const i = fullErr.lastIndexOf('\n');
            if (i >= 0) {
                log(fullErr.substring(0, i));
                fullErr = fullErr.substr(i + 1);
            }
        });
        this.proc.on('exit', () => {
            fullOut += decOut.end();
            fullErr += decErr.end();
            if (fullOut) {
                log(fullOut);
            }
            if (fullErr) {
                log(fullErr);
            }
            if (this.proc === proc) {
                this.proc = null;
            }
        });
    }

    /**
     * Kill the currently running Node.js process. If there is none, nothing happens.
     */
    kill() {
        if (!this.proc) {
            return;
        }
        this.proc.kill();
        this.proc = null;
    }
}

/**
 * Wraps a NodeLauncher in an Observable, such that the Node.js process is killed during teardown.
 */
export function nodeLauncher(logger: logging.Logger, options: NodeLauncherOptions) {
    return new Observable<NodeLauncher>((observer) => {
        const nodeLauncher = new NodeLauncher(logger, options);
        observer.next(nodeLauncher);
        return () => {
            nodeLauncher.kill();
        };
    });
}
