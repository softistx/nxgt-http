/**
 * `@operationIds`: the blog fixture marks its namespace, so every operation's
 * id is its name, as written, and the generated client's methods follow.
 * The programs in `test/programs/` are compiled without emitting: a marked
 * namespace, a spec that does not use it, and the ids it must refuse.
 */
import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
	compile,
	NodeHost,
	navigateProgram,
	type Program,
} from '@typespec/compiler';
import { getOperationId } from '@typespec/openapi';
import { operations as operations31 } from '../test/generated/blog/3.1.0/operations';
import { operations as operations32 } from '../test/generated/blog/3.2.0/operations';

function checked(name: string): Promise<Program> {
	const main = fileURLToPath(
		new URL(`../test/programs/${name}.tsp`, import.meta.url),
	);
	return compile(NodeHost, main, { noEmit: true });
}

it.each([
	['3.1.0', operations31],
	['3.2.0', operations32],
])('names the operations from OpenAPI %s as written', (_, operations) => {
	expect(Object.keys(operations).sort()).toEqual([
		'createAuthor',
		'createPost',
		'createPostComment',
		'deleteAuthor',
		'deletePost',
		'deletePostComment',
		'findPostComments',
		'getAuthor',
		'getPost',
		'listAuthors',
		'listPosts',
		'patchAuthor',
		'patchPost',
		'searchAuthors',
		'updateAuthor',
		'updatePost',
	]);
});

it('names every operation of a marked namespace as written, however deep', async () => {
	const program = await checked('namespace-marked');
	const ids: (string | undefined)[] = [];
	navigateProgram(program, {
		operation(operation) {
			ids.push(getOperationId(program, operation));
		},
	});
	expect(program.diagnostics).toEqual([]);
	expect(ids.sort()).toEqual([
		'fetchPet',
		'findPetToys',
		'health',
		'health',
		'health',
		'health',
		'listAll',
		'listOrders',
		'readFirstPet',
		'readFirstToy',
		undefined,
	]);
}, 30_000);

it('names the operations of a marked template in each interface extending it', async () => {
	const program = await checked('template-marked');
	const ids: (string | undefined)[] = [];
	navigateProgram(program, {
		operation(operation) {
			ids.push(getOperationId(program, operation));
		},
	});
	expect(program.diagnostics).toEqual([]);
	expect(ids).toEqual(['listAll']);
}, 30_000);

it('sets no id outside the interfaces it marks', async () => {
	const program = await checked('unmarked');
	const ids: (string | undefined)[] = [];
	navigateProgram(program, {
		operation(operation) {
			ids.push(getOperationId(program, operation));
		},
	});
	expect(program.diagnostics).toEqual([]);
	expect(ids).toEqual([undefined, undefined]);
}, 30_000);

it.each([
	['duplicate-operation-ids', 'listPets'],
	['inherited-operation-id', 'readPost'],
	['unmarked-operation-id', 'listPets'],
	['namespace-operation', 'listPets'],
	['nested-services', 'health'],
])(
	'refuses %s: two operations named %s',
	async (name, id) => {
		const program = await checked(name);
		expect(
			program.diagnostics.map(({ code, message }) => ({ code, message })),
		).toEqual([
			{
				code: '@nxgt/typespec/duplicate-operation-id',
				message: `Two operations are named ${id}: an OpenAPI operation id must be unique.`,
			},
		]);
	},
	30_000,
);

it("completes a known verb with the interface's resource, and leaves any other name as written", async () => {
	const program = await checked('verbs');
	expect(program.diagnostics).toEqual([]);
	const ids: string[] = [];
	navigateProgram(program, {
		operation(operation) {
			ids.push(
				`${operation.interface?.name ?? '-'}.${operation.name}=${getOperationId(program, operation)}`,
			);
		},
	});
	expect(ids).toEqual([
		'-.list=list',
		'Users.list=listUsers',
		'Users.read=readUsers',
		'Users.find=findUsers',
		'Users.search=searchUsers',
		'Users.count=countUsers',
		'Users.createMany=createManyUsers',
		'Users.updateMany=updateManyUsers',
		'Users.deleteMany=deleteManyUsers',
		'Users.get=getUser',
		'Users.create=createUser',
		'Users.update=updateUser',
		'Users.patch=patchUser',
		'Users.replace=replaceUser',
		'Users.upsert=upsertUser',
		'Users.delete=deleteUser',
		'Users.findById=findUserById',
		'Users.getByEmail=getUserByEmail',
		'Users.archive=archiveUser',
		'Users.export=exportUsers',
		'Users.findActiveUsers=findActiveUsers',
		'Categories.create=createCategory',
		'Addresses.create=createAddress',
		'Statuses.create=createStatus',
		'People.create=createPerson',
		'Staff.create=createMember',
		'Staff.export=exportMember',
	]);
}, 30_000);

it('refuses a resource name on a namespace', async () => {
	const program = await checked('namespace-resource');
	expect(program.diagnostics.map(({ code }) => code)).toEqual([
		'@nxgt/typespec/resource-name-on-namespace',
	]);
}, 30_000);

it('inherits verbs, inner over outer, but names only its own resource', async () => {
	const program = await checked('verbs-lineage');
	expect(
		program.diagnostics.map(({ code, message }) => ({ code, message })),
	).toEqual([
		{
			code: '@nxgt/typespec/duplicate-operation-id',
			message:
				'Two operations are named listUsers: an OpenAPI operation id must be unique.',
		},
	]);
	const ids: string[] = [];
	navigateProgram(program, {
		operation(operation) {
			const id = getOperationId(program, operation);
			if (id !== undefined)
				ids.push(`${operation.interface?.name}.${operation.name}=${id}`);
		},
	});
	expect(ids.sort()).toEqual([
		'Pets.archive=archivePet',
		'Pets.findById=findPetById',
		'Staff.archive=archiveStaff',
		'Users.archive=archiveUser',
		'Users.list=listUsers',
		'Users.listUsers=listUsers',
	]);
}, 30_000);

it('refuses a verb of another grammar', async () => {
	const program = await checked('verbs-invalid');
	expect(program.diagnostics.map(({ code }) => code)).toEqual([
		'invalid-argument',
	]);
}, 30_000);
