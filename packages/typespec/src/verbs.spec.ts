/** The English rule `@operationIds` takes a resource's singular by, and the verbs it completes. */
import { expect, it } from 'bun:test';
import { idWithVerb, METHODS, singularOf, VERBS, verbIn } from './verbs';

it.each([
	['Users', 'User'],
	['BlogPosts', 'BlogPost'],
	['APIKeys', 'APIKey'],
	['Categories', 'Category'],
	['Pies', 'Pie'],
	['Addresses', 'Address'],
	['Boxes', 'Box'],
	['Matches', 'Match'],
	['Branches', 'Branch'],
	['Wishes', 'Wish'],
	['Caches', 'Cache'],
	['Houses', 'House'],
	['Statuses', 'Status'],
	['Buses', 'Bus'],
	['People', 'Person'],
	['Children', 'Child'],
	['Movies', 'Movie'],
	['Series', 'Series'],
	['Status', 'Status'],
	['Access', 'Access'],
	['Staff', 'Staff'],
	['users', 'user'],
	['Constructors', 'Constructor'],
	['PageConstructor', 'PageConstructor'],
])('takes %s to %s', (plural, singular) => {
	expect(singularOf(plural)).toBe(singular);
});

const users = () => ({ singular: 'User', plural: 'Users' });

it.each([
	['list', 'listUsers'],
	['query', 'queryUsers'],
	['delete', 'deleteUser'],
	['deleteMany', 'deleteManyUsers'],
	['findById', 'findUserById'],
	['getByEmailAndName', 'getUserByEmailAndName'],
	['deleteManyByTeam', 'deleteManyUsersByTeam'],
	['createManyByIds', 'createManyUsersByIds'],
	['groupByStatus', 'groupUserByStatus'],
	['findPostComments', undefined],
	['listing', undefined],
	['By', undefined],
	['ById', undefined],
	['toString', undefined],
	['constructor', undefined],
])('names %s %s', (name, id) => {
	expect(idWithVerb(name, users, { ...VERBS, group: 'plural' })).toBe(id);
});

it('takes the resource only for a verb', () => {
	let taken = 0;
	const counted = () => {
		taken += 1;
		return users();
	};
	idWithVerb('findPostComments', counted, VERBS);
	expect(taken).toBe(0);
});

it.each([
	['list', { verb: 'list', rest: '' }],
	['findById', { verb: 'find', rest: 'ById' }],
	['deleteManyByTeam', { verb: 'deleteMany', rest: 'ByTeam' }],
	['findPostComments', undefined],
	['ById', undefined],
])('finds the verb in %s', (name, found) => {
	expect(verbIn(name, VERBS)).toEqual(found);
});

it('gives every verb of the library its methods', () => {
	expect(Object.keys(METHODS).sort()).toEqual(Object.keys(VERBS).sort());
});
