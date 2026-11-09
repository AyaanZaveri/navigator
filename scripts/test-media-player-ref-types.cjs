const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Type-check the real video/audio wrappers against the installed React,
// Radix, and Media Chrome declarations without loading the entire application.
const file = 'components/ui/media-player.tsx';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['MediaPlayerVideoProps', 'MediaPlayerVideo', 'MediaPlayerAudioProps', 'MediaPlayerAudio']);
const declarations = ast.statements.filter(node => names.has(node.name?.getText(ast))).map(node => node.getText(ast));
assert.equal(declarations.length, 4, 'Exercise the actual video and audio wrapper declarations');
const fixture = `
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { useMediaRef, useMediaDispatch, MediaActionTypes } from 'media-chrome/react/media-store';
import { useComposedRefs } from '@/lib/compose-refs';
// Mux loads media-tracks' global HTMLMediaElement extensions in the real app.
import '@mux/mux-video';
declare function useMediaPlayerContext(name: string): {
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  mediaId: string; labelId: string; descriptionId: string;
};
${declarations.join('\n')}
`;
const fixturePath = path.resolve('scripts/__media-player-ref-types__.tsx');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const options = { ...parsed.options, noEmit: true, incremental: false };
delete options.tsBuildInfoFile;
const host = ts.createCompilerHost(options);
const getSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, ...args) => path.resolve(name) === fixturePath
  ? ts.createSourceFile(name, fixture, languageVersion, true, ts.ScriptKind.TSX)
  : getSourceFile(name, languageVersion, ...args);
// Include the app's ambient media-element extensions, not just stock lib.dom.
const declarationsFiles = parsed.fileNames.filter(name => name.endsWith('.d.ts') && !name.includes('/.next/'));
const program = ts.createProgram([fixturePath, ...declarationsFiles], options, host);
const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else {
  console.log('PASS: real video/audio wrapper refs type-check against React, Radix, and Media Chrome.');
}
