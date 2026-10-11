/**
 * The git reads of `close-released-issues.ts`, copied with it: whether a PR's
 * merge touched a package, the packages its added changesets name, whether a
 * package has a tag in this clone, and whether a reused branch's earlier merge
 * is an ancestor of the previous tag (already shipped). Imports only types from
 * the lib file.
 */

import type { Ctx, Pkg, Pr } from './close-released-issues-lib';

const inPkg = (dir: string, file: string) =>
	dir === '.' || file.startsWith(`${dir}/`);

/** The package names a changeset's frontmatter lists; the closing rule sits on a line of its own. */
export function changesetNames(text: string): string[] {
	const found = /^---\r?\n([\s\S]*?)^---\s*$/m.exec(
		text.replace(/^\uFEFF/, ''),
	);
	const front = found?.index === 0 ? (found[1] ?? '') : '';
	return [...front.matchAll(/^["']?([^"':\n]+?)["']?\s*:/gm)].map(
		(m) => m[1] ?? '',
	);
}

/** Whether the PR's merge (or squash) commit changed the package; its files when git cannot say. */
export async function touches(c: Ctx, p: Pick<Pkg, 'dir'>, pr: Pr) {
	const args = [
		'git',
		'diff',
		'--name-only',
		`${pr.sha}^1`,
		pr.sha,
		'--',
		p.dir,
	];
	const diff = pr.sha && (await c.exec(args));
	if (diff && diff.code === 0) return diff.stdout.trim() !== '';
	return pr.files.some((f) => inPkg(p.dir, f));
}

/** The packages a merge commit's added changesets name (what is really published with it); undefined when git cannot say. */
export async function addedChangesets(c: Ctx, sha: string) {
	const diff = `git diff --name-only --diff-filter=A ${sha}^1 ${sha} -- .changeset/`;
	const listing = await c.exec(diff.split(' '));
	if (listing.code !== 0) return undefined;
	const names: string[] = [];
	const files = listing.stdout
		.split('\n')
		.filter((f) => f.endsWith('.md') && !f.endsWith('/README.md'));
	for (const file of files) {
		const shown = await c.exec(['git', 'show', `${sha}:${file}`]);
		if (shown.code !== 0) return undefined;
		names.push(...changesetNames(shown.stdout));
	}
	return names;
}

/** Whether the package has a tag in this clone, so its own run can read the log since it. */
export async function hasTags(c: Ctx, name: string) {
	const out = await c.exec(['git', 'tag', '--list', `${name}@*`]);
	return out.stdout.split('\n').some((t) => t.startsWith(`${name}@`));
}

/**
 * Whether an integration PR shipped in an earlier release (a reused `feat/*`
 * branch lists every merge it ever had): its merge commit is an ancestor of the
 * previous tag; with no previous tag, or when git cannot say, a merge older
 * than the slice's (`since`) was.
 */
export async function releasedBefore(
	c: Ctx,
	pr: Pr,
	previous: string | undefined,
	since: string,
) {
	if (pr.sha && previous) {
		const r = await c.exec([
			'git',
			'merge-base',
			'--is-ancestor',
			pr.sha,
			previous,
		]);
		if (r.code === 0) return true;
		if (r.code === 1 && r.stderr.trim() === '') return false;
	}
	return Boolean(pr.mergedAt && since && pr.mergedAt < since);
}

/** Those of `prs` that did not ship in an earlier release, judged against the slice's own merge date. */
export async function unreleased(
	c: Ctx,
	prs: Pr[],
	previous: string | undefined,
	since: string,
) {
	const kept: Pr[] = [];
	for (const pr of prs) {
		if (!(await releasedBefore(c, pr, previous, since))) kept.push(pr);
	}
	return kept;
}
