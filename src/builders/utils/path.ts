import * as path from 'path';

export function normalizePath(p: string) {
    p = path.normalize(p).replace(/\\/g, '/');
    if (p.endsWith('/')) {
        p = p.slice(0, -1);
    }
    return p;
}
