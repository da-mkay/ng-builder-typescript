# @da-mkay/ng-builder-typescript

A builder for the Angular CLI to build Node.js apps using the typescript compiler tsc (no webpack or any other bundler used).

## Versions

This version of @da-mkay/ng-builder-typescript requires Angular 16. Use the tag `ng16` when installing this version, like so:\
`ng add @da-mkay/ng-builder-typescript@ng16`

For other Angular versions take a look at the table below or at the [Versions page](https://www.npmjs.com/package/@da-mkay/ng-builder-typescript?activeTab=versions).
| Angular Version | Tag for @da-mkay/ng-builder-typescript |
| --------------- | ---------------------------------------|
| Angular 16      | ng16                                   |
| Angular 15      | ng15                                   |
| Angular 14      | ng14                                   |
| Angular 13      | ng13                                   |
| Angular 12      | ng12                                   |
| Angular 11      | ng11                                   |
| Angular 10      | ng10                                   |
| Angular 9       | ng9                                    |
| Angular 8       | ng8                                    |

## Table of Contents

-   [Start project from scratch](#start-project-from-scratch)
-   [Builder options](#builder-options)
    -   [Builder: build](#builder-build)
    -   [Builder: serve](#builder-serve)
-   [Changelog](#changelog)

## Start project from scratch

First create a new empty workspace:

```
$ ng new workspace --create-application=false
$ cd workspace
```

Then install the builder:

```
$ ng add @da-mkay/ng-builder-typescript@ng16
```
(Using the tag `ng16`, the Angular 16 compatible version will be installed)

Finally create a new Node.js/typescript project:

```
$ ng g @da-mkay/ng-builder-typescript:app
```

You will be prompted for the project name. In the following examples `PROJECT` is used for the project name and must be replaced in your case accordingly.

To compile the project run:

```
$ ng build PROJECT
```

By default, the compiled code is written to the `dist/` folder. You can change that by adjusting the `outputPath` option of the project's `build` target.

To compile the project each time the code is changed run:

```
$ ng build PROJECT --watch
```

Of course, you can also configure a target or configuration in your angular.json and set the `watch` option to `true`.

To compile the project and run the built project in a Node.js process each time the code is changed:

```
$ ng serve PROJECT
```

## Builder options

### Builder: build

**outputPath**: `string`\
Target folder for the built app (relative to the workspace root). Will override `compilerOptions.outDir` setting of tsconfig.

**tsConfig**: `string`\
Path to the tsconfig file to use (relative to the workspace root).

**watch**: `boolean`\
(default: `false`)\
Whether to watch source files for changes and recompile.

**cleanOutputPath**: `boolean`\
(default: `true`)\
Whether to clean ouputPath before building app.

**assets**: `{ input: string, glob: string, output: string, ignore?: string[] }[]`\
Files to copy to the `outputPath`. Each asset object has the following properties:

-   `input`: a path relative to the workspace root
-   `glob`: a glob relative to `input`
-   `output`: a path relative to `outputPath`
-   `ignore`: an optional array of globs relative to `input`

In watch mode (`watch` set to `true`) the asset `input` folders will be watched for changes, i.e. added or modified files. On each change the updated file will be copied.

**fileReplacements**: `{ replace: string, with: string }[]`\
Replace files during compilation. Each array item is an object having the following properties:

-   `replace`: A file path relative to the workspace root that should be replaced.
-   `with`: A file path relative to the workspace root that should replace the path specified with `replace`.

### Builder: serve

**buildTarget**: `string`\
(required)\
The build target that uses @da-mkay/ng-builder-typescript builder. It will be started in watch mode. Each time the build target finished compilation successfully, a Node.js process is started that runs the compiled `main` file.\
This options must be a string using the format 'project:build-target[:config]'.

**main**: `string`\
(required)\
The path of the main file relative to the build target's `outputPath` that will be run using Node.js.

**nodeBin**: `string`\
The path to the Node.js binary to use. If none is specified the path of the currently running Node.js process is used.

**cwd**: `string`\
The cwd (current working directory) to use for the spawned Node.js process. If none is specified the build target's `outputPath` is used.

**args**: `string[]`\
Arguments to pass to the spawned Node.js process.

## Changelog

Check out [changelog on Github](https://github.com/da-mkay/ng-builder-typescript/blob/main/CHANGELOG.md).
