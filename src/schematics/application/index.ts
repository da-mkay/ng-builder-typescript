import { join, normalize, strings } from '@angular-devkit/core';
import {
    apply,
    applyTemplates,
    chain,
    mergeWith,
    move,
    Rule,
    SchematicContext,
    SchematicsException,
    Tree,
    url,
} from '@angular-devkit/schematics';
import { updateWorkspace, getWorkspace } from '@schematics/angular/utility/workspace';
import { relativePathToWorkspaceRoot } from '@schematics/angular/utility/paths';
import { ProjectType } from '@schematics/angular/utility/workspace-models';

interface ApplicationOptions {
    projectRoot?: string;
    name: string;
}

export default function (options: ApplicationOptions): Rule {
    return async (tree: Tree, context: SchematicContext) => {
        if (!options.name) {
            throw new SchematicsException(`Invalid options, "name" is required.`);
        }

        const workspace = await getWorkspace(tree);
        const newProjectRoot = (workspace.extensions.newProjectRoot as string) || '';
        const isRootApp = options.projectRoot !== undefined;
        const appDir = isRootApp ? normalize(options.projectRoot || '') : join(normalize(newProjectRoot), strings.dasherize(options.name));
        const root = appDir ? `${appDir}/` : appDir;
        const sourceRoot = join(normalize(root), 'src');

        return chain([
            updateWorkspace((workspace) => {
                workspace.projects.add({
                    name: options.name,
                    projectType: ProjectType.Application,
                    root,
                    sourceRoot,
                    targets: {
                        build: {
                            builder: '@da-mkay/ng-builder-typescript:build',
                            options: {
                                outputPath: `dist/${options.name}`,
                                tsConfig: `${root}tsconfig.json`,
                            },
                            configurations: {
                                production: {
                                    fileReplacements: [
                                        {
                                            replace: `${sourceRoot}/environments/environment.ts`,
                                            with: `${sourceRoot}/environments/environment.prod.ts`,
                                        },
                                    ],
                                },
                            },
                        },
                        serve: {
                            builder: '@da-mkay/ng-builder-typescript:serve',
                            options: {
                                buildTarget: `${options.name}:build`,
                                main: `main.js`,
                            },
                            configurations: {
                                production: {
                                    buildTarget: `${options.name}:build:production`,
                                },
                            },
                        },
                    },
                });
            }),
            mergeWith(
                apply(url('./files'), [applyTemplates({ relativePathToWorkspaceRoot: relativePathToWorkspaceRoot(appDir) }), move(root)])
            ),
        ]);
    };
}
