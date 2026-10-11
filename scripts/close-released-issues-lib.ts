/**
 * The discovery half of `close-released-issues.ts`, copied with it (and its
 * spec) into each library repository's `scripts/`: which issues a published
 * `<package>@<version>` fixes. It imports nothing from the plugin; it
 * duplicates `lib/release-prs.ts` and `lib/release-git.ts` on purpose
 * (AGENTS.md lists the four files); the git reads are in `close-released-issues-git.ts`.
 *
 * The PRs are the CHANGELOG section's `[#N]` links that touched the package
 * (`git diff` of the merge commit), plus the PRs the first-parent log of
 * `packages/<dir>` names since the previous tag. Each PR gives its closing
 * issues (`closingIssuesReferences`, then body keywords outside code and
 * quotes); a PR merged into `feat/*` leads to the PR merged from that branch
 * (`gh pr list --head`), which the comment names, unless it merged in an earlier
 * release (a reused branch). A listed slice that did not
 * touch the package still leads to its integration PR, counted when that
 * merge touched the package, its own issues read at rank 0.
 */

import { touches, unreleased } from './close-released-issues-git';

export type Exec = (
	argv: string[],
	stdin?: string,
	cwd?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;
/** `dir` is `.` for a package at the repository root. */
export interface Pkg {
	name: string;
	version: string;
	tag: string;
	dir: string;
}
export interface Ctx {
	exec: Exec;
	repo: string;
	dry: boolean;
	log: (line: string) => void;
	cwd: string;
}
type Obj = Record<string, unknown>;

export const obj = (v: unknown): Obj =>
	v && typeof v === 'object' ? (v as Obj) : {};
export const rows = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
export const inDir = (dir: string, file: string) =>
	dir === '.' || file.startsWith(`${dir}/`);

/** The package names a filed issue's `## Versions` section lists. */
export const versionNames = (body: string): string[] => {
	const text = body.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, '');
	const section = /^## Versions\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text);
	return [...(section?.[1] ?? '').matchAll(/^- `([^`]+)`/gm)].map(
		(m) => m[1] ?? '',
	);
};

export const lower = (v: unknown) => String(v).toLowerCase();
export const message = (e: unknown) =>
	e instanceof Error ? e.message : String(e);
export const warn = (c: Ctx, what: string, e: unknown) =>
	c.log(`warning: ${what}: ${message(e)}`);

const CLOSING =
	/(?<![\w-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:([\w.-]+\/[\w.-]+)?#(\d+)|https:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+))(?!\w)/gi;

/** Text outside fenced blocks, code spans and `>` quote lines: where a keyword means it. */
const unquoted = (text: string) =>
	text
		.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, '')
		.replace(/`[^`\n]*`/g, '')
		.split('\n')
		.filter((line) => !/^\s*>/.test(line))
		.join('\n');

/** Issues of `repo` a text closes by keyword (`Fixes #1`, `closes owner/repo#2`, a github.com URL). */
export function closedBy(text: string, repo: string): number[] {
	return [...unquoted(text).matchAll(CLOSING)]
		.filter((m) => lower(m[1] ?? m[3] ?? repo) === lower(repo))
		.map((m) => Number(m[2] ?? m[4]));
}

/** The `[#N]` links of the `## <version>` section of a changelog. */
export function changelogPrs(changelog: string, version: string): number[] {
	const section = changelog
		.split(/^## /m)
		.find((s) => s.split('\n')[0]?.trim() === version);
	return [...(section ?? '').matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1]));
}

export async function run(
	c: Ctx,
	cmd: string,
	args: string[] = [],
	stdin?: string,
) {
	const r = await c.exec(cmd.split(' ').concat(args), stdin);
	if (r.code !== 0) throw new Error(`${cmd}: ${r.stderr.trim().slice(0, 200)}`);
	return r.stdout;
}
export const gh = async (c: Ctx, cmd: string, ...args: string[]) =>
	JSON.parse(await run(c, `gh ${cmd}`, [...args, '-R', c.repo]));

const FIELDS =
	'number,baseRefName,headRefName,body,closingIssuesReferences,mergeCommit,mergedAt,files';

function toPr(raw: Obj, repo: string) {
	const issues = new Set(closedBy(String(raw['body'] ?? ''), repo));
	for (const ref of rows(raw['closingIssuesReferences'])) {
		const where = obj(ref['repository']);
		const name = `${obj(where['owner'])['login']}/${where['name']}`;
		if (!where['name'] || lower(name) === lower(repo)) {
			issues.add(Number(ref['number']));
		}
	}
	return {
		number: Number(raw['number']),
		feat: String(raw['baseRefName']).startsWith('feat/'),
		head: String(raw['headRefName']),
		sha: String(obj(raw['mergeCommit'])['oid'] ?? ''),
		mergedAt: typeof raw['mergedAt'] === 'string' ? raw['mergedAt'] : '',
		issues: [...issues],
		files: rows(raw['files']).map((f) => String(f['path'])),
	};
}
export type Pr = ReturnType<typeof toPr>;

/** The tag before this release's, in this clone (undefined without one). */
async function previousOf(c: Ctx, p: Pkg) {
	// A root package of a single-package repository is tagged `v1.2.3` by changesets.
	const plain = p.dir === '.' ? `v${p.version}` : '';
	const patterns = `${p.name}@*${plain ? ' v[0-9]*' : ''}`;
	const all = (
		await run(c, `git tag --list ${patterns} --sort=-version:refname`)
	)
		.split('\n')
		.filter(Boolean);
	const tag = all.includes(p.tag) ? p.tag : plain;
	const same = all.filter((t) =>
		(tag === plain
			? /^v\d/
			: RegExp(`^${p.name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}@`)
		).test(t),
	);
	const previous = same[same.indexOf(tag) + 1];
	return tag && previous && all.includes(tag) ? previous : undefined;
}

/** PR numbers named by the first-parent commits touching the package since its previous tag. */
async function loggedPrs(c: Ctx, p: Pkg, previous: string | undefined) {
	if (!previous) return [];
	const log = await run(
		c,
		`git log --first-parent --format=%s ${previous}..HEAD -- ${p.dir}`,
	);
	return log.split('\n').flatMap((subject) => {
		const m = /^Merge pull request #(\d+)\b|\(#(\d+)\)\s*$/.exec(subject);
		return m ? [Number(m[1] ?? m[2])] : [];
	});
}

/** The PRs that merged the `feat/*` branch on and touched the package, released before or not; none when the lookup fails (the issues then name the slice). */
async function integrationOf(c: Ctx, p: Pkg, base: string) {
	const args = ['--state', 'merged', '--head', base, '--json', FIELDS];
	const list = await gh(c, 'pr list', ...args).catch((e) => {
		warn(c, `integration PR of ${base}`, e);
		return [];
	});
	const touching: Pr[] = [];
	for (const r of rows(list).map((x) => toPr(x, c.repo))) {
		if (!r.feat && (await touches(c, p, r))) touching.push(r);
	}
	return touching;
}

/** The PRs read and the issues the release fixes, each with the PR its comment names and its rank (0 best). */
export async function fixes(c: Ctx, p: Pkg) {
	const path = p.dir === '.' ? 'CHANGELOG.md' : `${p.dir}/CHANGELOG.md`;
	const show = await c.exec(['git', 'show', `HEAD:${path}`]);
	const listed = changelogPrs(show.stdout, p.version);
	const previous = await previousOf(c, p).catch(() => undefined);
	const logged = await loggedPrs(c, p, previous).catch((e): number[] => {
		warn(c, 'git log', e);
		return [];
	});
	// rank 0: a direct or integration PR's issues; 1: a slice's, named after its integration PR; 2: a slice with none yet
	const found = new Map<number, { pr: number; rank: number; info: Pr }>();
	const keep = (issue: number, info: Pr, rank: number) => {
		if (rank < (found.get(issue)?.rank ?? 3)) {
			found.set(issue, { pr: info.number, rank, info });
		}
	};
	const merged = new Map<string, Pr[]>();
	const read: number[] = [];
	const count = (n: number) => {
		if (!read.includes(n)) read.push(n);
	};
	for (const number of new Set([...listed, ...logged])) {
		try {
			const raw = obj(await gh(c, 'pr view', String(number), '--json', FIELDS));
			const pr = toPr(raw, c.repo);
			if (pr.head.startsWith('changeset-release/')) continue;
			// The path-limited log proves a logged PR touched the package; a listed one may belong to another.
			const mine = logged.includes(number) || (await touches(c, p, pr));
			if (!(mine || pr.feat)) continue;
			if (!pr.feat) {
				count(number);
				for (const issue of pr.issues) keep(issue, pr, 0);
				continue;
			}
			// A slice that did not touch the package still leads to its integration PR: the CHANGELOG credits the slice.
			const base = String(raw['baseRefName']);
			if (!merged.has(base)) {
				merged.set(base, await integrationOf(c, p, base));
			}
			// "Released before" is judged per slice, against its own merge date.
			const since = pr.mergedAt ?? '';
			const parents = await unreleased(
				c,
				merged.get(base) ?? [],
				previous,
				since,
			);
			if (mine) {
				count(number);
				for (const issue of pr.issues)
					keep(issue, parents[0] ?? pr, parents[0] ? 1 : 2);
			}
			for (const parent of parents) {
				count(parent.number);
				for (const issue of parent.issues) keep(issue, parent, 0);
			}
		} catch (error) {
			warn(c, `PR #${number}`, error);
		}
	}
	return { prs: read, found: [...found].sort((a, b) => a[1].rank - b[1].rank) };
}
