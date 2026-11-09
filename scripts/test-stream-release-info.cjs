const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, require: () => ({}) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/stream-release-info.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const parse = context.exports.parseStreamReleaseInfo;

let info = parse({ behaviorHints: { filename: 'Film.[Bluray-2160p][EAC3 Atmos 5.1][DV HDR10][x265].mkv' },
  url: 'https://host/other.mp4', title: 'Movie title' });
assert.equal(info.resolution, '2160p');
assert.deepEqual(Array.from(info.videoCodecs), ['x265']);
assert.deepEqual(Array.from(info.audioCodecs), ['EAC3']);
assert.equal(info.dynamicRange, 'dolby-vision-hdr10');
assert.equal(info.source, 'bluray');
assert.equal(info.container, 'mkv');
assert.equal(parse({ title: 'Silent TrueHD Dolby Vision' }).videoCodecs.length, 0, 'plain title is not release metadata');
assert.equal(parse({ title: 'Silent TrueHD Dolby Vision' }).dynamicRange, undefined);
assert.equal(parse({ title: 'Dolby Vision' }).dynamicRange, undefined);
assert.deepEqual(Array.from(parse({ title: 'TrueHD' }).audioCodecs), [], 'a codec-like movie title alone is not evidence');
assert.deepEqual(Array.from(parse({ title: '[Atmos]' }).audioCodecs), [], 'Atmos alone does not declare its carrier codec');
assert.deepEqual(Array.from(parse({ title: 'H264 | AAC' }).audioCodecs), ['AAC']);
assert.deepEqual(Array.from(parse({ url: 'https://host/file.mp4', title: '1080p H264 AAC' }).audioCodecs), ['AAC'], 'an opaque URL must not block descriptive release metadata');
assert.equal(parse({ name: 'Provider\n1080p', title: 'Movie' }).resolution, '1080p');
assert.equal(parse({ url: 'https://host/Movie%2E1080p%2Ex264%2EAAC%2Emp4?token=secret' }).container, 'mp4');
assert.deepEqual(Array.from(parse({ title: 'AAC 1080p H264' }).audioCodecs), [], 'movie-name prefix is not metadata');
assert.deepEqual(Array.from(parse({ title: 'Movie_1080p_x264_AAC.mkv' }).audioCodecs), ['AAC']);
info = parse({ title: 'Film.1080p.H264.AAC+DTS.mkv' });
assert.deepEqual(Array.from(info.audioCodecs), ['AAC', 'DTS']);
info = parse({ title: 'Film 2160p DV HEVC TrueHD' });
assert.equal(info.dynamicRange, 'dolby-vision');
assert.deepEqual(Array.from(info.audioCodecs), ['TrueHD']);
info = parse({ title: 'Film WEB-DL 10bit H.264 DDP5.1 no audio' });
assert.equal(info.bitDepth, 10);
assert.equal(info.noAudio, true);
assert.deepEqual(Array.from(info.videoCodecs), ['H.264']);
assert.deepEqual(Array.from(info.audioCodecs), ['DDP']);
info = parse({ behaviorHints: { filename: 'release.720p.x265.AAC.mkv' }, title: 'Film.2160p.H264.DTS' });
assert.equal(info.resolution, '720p', 'filename source wins over conflicting title metadata');
assert.deepEqual(Array.from(info.videoCodecs), ['x265']);
info = parse({ behaviorHints: { filename: 'release.720p.x265.AAC.mkv' }, title: 'Film 2160p H264 DTS', description: 'WEB-DL 10bit DTS-HD MA' });
assert.equal(info.resolution, '720p');
assert.deepEqual(Array.from(info.audioCodecs), ['AAC'], 'authoritative filename wins for present fields');
assert.equal(info.source, 'webdl', 'description fills missing filename attributes');
assert.deepEqual(Array.from(parse({ title: 'Film.1080p.H-264.E-AC-3.DTS-HD_HRA.DTS-X' }).audioCodecs), ['DTS-HD', 'DTS:X', 'EAC3']);
assert.deepEqual(Array.from(parse({ title: 'Film.1080p.H-264.AC-3.DD' }).audioCodecs), ['AC3']);
console.log('PASS: structured release fields, codec sets, explicit audio flags, and filename precedence.');
