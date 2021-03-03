# @da-mkay/ng-builder-typescript

A builder for the Angular CLI to build Node.js apps using the typescript compiler tsc (no webpack or any other bundler used).

## Start project from scratch

First create a new empty workspace:
```
$ ng new --createApplication=false
```

Then install the builder:
```
$ ng add @da-mkay/ng-builder-typescript
```

Finally create a new Node.js/typescript project:
```
$ ng g @da-mkay/ng-builder-typescript:app
```

You will be prompted for the project name. In the following examples `PROJECT` is for the project name and must be replaced in your case accordingly.

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