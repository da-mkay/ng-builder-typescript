import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { addPackageJsonDependency, getPackageJsonDependency, NodeDependencyType } from '@schematics/angular/utility/dependencies';
import * as inquirer from 'inquirer';

export default function (): Rule {
    return async (tree: Tree, context: SchematicContext) => {
        const dep = getPackageJsonDependency(tree, '@types/node');
        if (dep) {
            return; // @types/node already in package.json
        }
        const matchNodeVersion = process.version.match(/v(.*)/);
        const defaultNodeVersion = matchNodeVersion ? `^${matchNodeVersion[1]}` : 'latest';
        if (context.interactive) {
            const answerInstall = await inquirer.prompt<{ install: boolean }>([
                {
                    name: 'install',
                    message: 'Your package.json contains no @types/node dependency. Do you want to add @types/node as dev dependency now?',
                    type: 'confirm',
                },
            ]);
            if (!answerInstall.install) {
                return;
            }
            const answerVersion = await inquirer.prompt<{ version: string }>([
                {
                    name: 'version',
                    message: 'Which @types/node version do you want to install?',
                    type: 'input',
                    default: defaultNodeVersion,
                    validate: (input) => !!input,
                },
            ]);
            addPackageJsonDependency(tree, {
                name: '@types/node',
                type: NodeDependencyType.Dev,
                version: answerVersion.version,
            });
        } else {
            addPackageJsonDependency(tree, {
                name: '@types/node',
                type: NodeDependencyType.Dev,
                version: defaultNodeVersion,
            });
        }
        context.addTask(new NodePackageInstallTask());
    };
}
