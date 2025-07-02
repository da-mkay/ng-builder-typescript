# Changelog

## Version 19.0.2, 2025-07-02

- fix: added missing dependency minimatch

## Version 19.0.1, 2025-01-05

- support for Angular 19

## Version 18.0.5, 2025-01-04

- support for Angular 18
- fix: @types/node packages do not exist for all minor/patch version combinations. This will cause the ng-add schematic to fail if, for example, it tries to install ^18.20.5. Thus, we default to the major node js version from now on. For example ^18.0.0.

## Version 15.0.2, 16.0.3 and 17.0.4, 2024-01-29

### `build` builder:

- fix: when running build-builder in non-watch mode using file replacements both versions of a file end up in build (file to replace and the replacement file)

## Version 15.0.1 and 16.0.2, 2024-01-28

### `build` builder:

- fix: problems when using file replacements
    1. on case-insensitive filesystems the wrong file may be rebuild in watch mode
    2. in watch mode both files (file to replace and the replacement file) end up in dist dir
- fix: asset configuration does not allow to take assets from workspace root

## Version 17.0.3, 2024-01-27

- updated supported typescript version range to match Angular's version compatibility list

### `build` builder:
- fix: problems when using file replacements
    1. on case-insensitive filesystems the wrong file may be rebuild in watch mode
    2. in watch mode both files (file to replace and the replacement file) end up in dist dir
- fix: asset configuration does not allow to take assets from workspace root

## Version 17.0.2, 2023-12-13

- updated README

## Version 17.0.1, 2023-12-13

- support for Angular 17

## Version 16.0.1, 2023-12-13

- updated README

## Version 16.0.0, 2023-12-13

- support for Angular 16

## Version 14.0.1, 2023-12-13

- updated supported typescript version range to match Angular's version compatibility list

## Version 15.0.0, 2023-12-12

- support for Angular 15

## Version 14.0.0, 2023-12-12

- support for Angular 14

## Version 13.0.2, 2023-12-12

- removed rxjs from peer dependencies

## Version 13.0.1, 2023-12-12

- updated README

## Version 13.0.0, 2023-12-12

- support for Angular 13

## Version 12.0.0, 2021-06-07

- support for Angular 12

## Version 0.3.0, 2021-06-07

### `build` builder:

- fix: asset output path itself is not allowed

## Version 0.2.0, 2020-03-26

### `build` builder:

- fix: file replacements do not work when running on Windows

### `serve` builder:

-   feat: added serve builder to run app in a Node.js process each time the code is updated

### `app` schematic:

-   feat: added serve target to generated app project

## Version 0.1.1, 2020-03-20

### `build` builder:

-   feat: use proxy around ts.sys to avoid monkey patching

## Version 0.1.0, 2020-03-20

### `build` builder:

-   feat: added support for fileReplacements
-   feat: added support for assets

### `app` schematic:

-   feat: added environment files for application schematic
