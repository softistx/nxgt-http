#!/usr/bin/env bun
/**
 * Closes the issues a release fixed, in CI only (HEAD is the release commit;
 * elsewhere use `issues.ts released`), after `changesets/action` publishes:
 *   bun scripts/close-released-issues.ts --published "$PUBLISHED" [--repo owner/repo] [--dry-run]
 * (`PUBLISHED` is `steps.<id>.outputs.published-packages`, a JSON array of
 * `{ name, version }`; `GH_TOKEN` is the workflow's token, with `issues: write`.)
 *
 * Per published package the issues come from `close-released-issues-lib.ts`;
 * they are collected across all packages first. A `feat/*` branch that was
 * merged before is listed with every merge it ever had: an integration PR
 * already shipped (its merge an ancestor of the previous tag, else older than
 * the slice that led to it) is dropped. An issue gets one comment, "Fixed in
 * <pkg>@<version> (#PR)", naming the package its `## Versions` section lists,
 * else the one that found it with the lowest rank, else the first; then the
 * `released` label and the close. An issue whose Versions name a package of
 * this repository that is not published now is left to that release only when
 * its run will surely handle it: the fix is rank 0 (the PR's own closing
 * references name the issue), that PR touched the package and adds a changeset
 * naming it, and the other package has an earlier tag in this clone (its run
 * reads the log since it); if git cannot say, it is handled now. The comment
 * is written last and its hidden marker is the idempotency key: an issue gets
 * at most one such comment ever (any trusted comment with a fixed marker means
 * done), and one reopened after the release is reported, never closed again.
 * Needs only `gh`; imports nothing from the plugin. This is the canonical
 * copy: byte-copy it, the lib and git files and the spec into each library's
 * `scripts/`. It never fails the release: problems print as warnings and the
 * exit code is 0.
 */

import { dirname, join } from 'node:path';
import { addedChangesets, hasTags, touches } from './close-released-issues-git';
import {
	type Ctx,
	type Exec,
	fixes,
	gh,
	lower,
	message,
	obj,
	type Pkg,
	type Pr,
	rows,
	run,
	versionNames,
	warn,
} from './close-released-issues-lib';

type Obj = Record<string, unknown>;
interface Candidate {
	p: Pkg;
	pr: number;
	rank: number;
	info: Pr;
}

const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const FIXED_MARKER = /<!--\s*nxgt-issues:fixed=\S+@\S+\s*-->/;

/** The package the comment names: the one the issue's Versions lists, else the lowest rank, else the first. */
function chosen(named: string[], candidates: Candidate[]): Candidate {
	const listed = candidates.find((k) => named.includes(k.p.name));
	const best = candidates.reduce((a, k) => (k.rank < a.rank ? k : a));
	return listed ?? best;
}

async function release(
	c: Ctx,
	candidates: Candidate[],
	away: Map<string, string>,
	issue: number,
) {
	const n = String(issue);
	const fields = 'state,body,labels,comments';
	const raw = obj(await gh(c, 'issue view', n, '--json', fields));
	const named = versionNames(String(raw['body'] ?? ''));
	// Left to an unpublished sibling only when its run will surely find the issue: rank 0, touched, a changeset names it, and the sibling has an earlier tag.
	const best = chosen(named, candidates);
	for (const [name, dir] of away) {
		if (
			!named.includes(name) ||
			candidates.some((k) => named.includes(k.p.name))
		) {
			continue;
		}
		const sha = best.info.sha;
		const added =
			best.rank === 0 && sha ? await addedChangesets(c, sha) : undefined;
		const left =
			added?.includes(name) &&
			(await touches(c, { dir }, best.info)) &&
			(await hasTags(c, name));
		if (left) {
			return c.log(`  #${issue}: left to ${name}, which is not published now`);
		}
	}
	const { p, pr } = best;
	const body = `Fixed in ${p.tag} (#${pr}).\n\n<!-- nxgt-issues:fixed=${p.tag} -->\n`;
	const done = rows(raw['comments']).some((m) => {
		const bot = obj(m['author'])['login'] === 'github-actions';
		const trusted = bot || TRUSTED.includes(String(m['authorAssociation']));
		return trusted && FIXED_MARKER.test(String(m['body']));
	});
	const open = lower(raw['state']) === 'open';
	const labelled = rows(raw['labels']).some(
		(l) => lower(l['name']) === 'released',
	);
	// The comment, which is the marker, goes last: a failure before it leaves the step to be redone.
	const steps = [
		['label released', !labelled, `issue edit ${n} --add-label released`],
		['close', open && !done, `issue close ${n}`],
		[`comment (#${pr}, ${p.name})`, !done, `issue comment ${n} --body-file -`],
	] as const;
	const todo = steps.filter(([, needed]) => needed);
	const what = todo.map(([label]) => label).join(', ') || 'already released';
	const note =
		open && done ? '; reopened after the release: not closed again' : '';
	c.log(
		`  #${issue}: ${c.dry && todo.length > 0 ? 'would ' : ''}${what}${note}`,
	);
	for (const [, , cmd] of c.dry ? [] : todo) {
		const stdin = cmd.includes('comment') ? body : undefined;
		await run(c, `gh ${cmd} -R ${c.repo}`, [], stdin);
	}
}

/** Every package of the checkout: the root one (single-package repository) and `packages/*`. */
async function workspace(c: Ctx): Promise<{ name: string; dir: string }[]> {
	const files = ['package.json'];
	for (const f of new Bun.Glob('packages/*/package.json').scanSync(c.cwd)) {
		files.push(f);
	}
	const found = [];
	for (const file of files) {
		const json = Bun.file(join(c.cwd, file)).json();
		const name = obj(await json.catch(() => ({})))['name'];
		if (typeof name === 'string') found.push({ name, dir: dirname(file) });
	}
	return found;
}

async function releaseAll(c: Ctx, published: Obj[]) {
	const all = await workspace(c);
	const names = published.map((p) => String(p['name']));
	// The root manifest is a sibling of nothing: only a single-package repository publishes it.
	const away = new Map(
		all
			.filter((w) => w.dir !== '.' && !names.includes(w.name))
			.map((w) => [w.name, w.dir] as const),
	);
	const issues = new Map<number, Candidate[]>();
	for (const { name, version } of published) {
		try {
			const dir = all.find((w) => w.name === name)?.dir;
			if (dir === undefined) {
				c.log(`warning: ${name} is not a package of this checkout`);
				continue;
			}
			const p = {
				name: String(name),
				version: String(version),
				dir,
				tag: `${name}@${version}`,
			};
			const { prs, found } = await fixes(c, p);
			const read =
				prs.length > 0 ? `PRs ${prs.map((n) => `#${n}`).join(', ')}` : 'no PRs';
			c.log(
				`${c.dry ? 'dry run: ' : ''}${p.tag}: ${read}, ${found.length} issue(s)`,
			);
			for (const [issue, { pr, rank, info }] of found) {
				const known = issues.get(issue) ?? [];
				issues.set(issue, [...known, { p, pr, rank, info }]);
			}
		} catch (error) {
			warn(c, `${name}@${version}`, error);
		}
	}
	if (issues.size === 0) return;
	const labels = rows(
		await gh(c, 'label list', '--limit', '200', '--json', 'name'),
	);
	if (!labels.some((l) => lower(l['name']) === 'released')) {
		c.log(`  label released: ${c.dry ? 'would be created' : 'created'}`);
		const create = 'label create released --color 0e8a16 --description';
		if (!c.dry)
			await run(c, `gh ${create}`, ['The fix is published', '-R', c.repo]);
	}
	for (const [issue, candidates] of issues) {
		await release(c, candidates, away, issue).catch((e) =>
			warn(c, `issue #${issue}`, e),
		);
	}
}

/** Always resolves 0: a release is never failed by its issue housekeeping. */
export async function closeReleasedIssues(
	args: string[],
	env: Record<string, string | undefined>,
	exec: Exec,
	log: (line: string) => void,
	cwd: string = process.cwd(),
): Promise<0> {
	const flag = (name: string) =>
		args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
	const repo = flag('--repo') ?? env['GITHUB_REPOSITORY'];
	try {
		const published = rows(JSON.parse(flag('--published') ?? ''));
		if (!repo)
			throw new Error('no repository: pass --repo or set GITHUB_REPOSITORY');
		const inCwd: Exec = (argv, stdin) => exec(argv, stdin, cwd);
		const dry = args.includes('--dry-run');
		await releaseAll({ exec: inCwd, repo, dry, log, cwd }, published);
	} catch (error) {
		log(`warning: nothing closed: ${message(error)}`);
	}
	return 0;
}

if (import.meta.main) {
	const env = {
		...process.env,
		GH_TOKEN: process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? '',
	};
	const exec: Exec = async (argv, stdin, cwd) => {
		const child = Bun.spawn(argv, {
			env,
			...(cwd ? { cwd } : {}),
			stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { code, stdout, stderr };
	};
	process.exit(
		await closeReleasedIssues(
			process.argv.slice(2),
			process.env,
			exec,
			console.log,
		),
	);
}
