/** The English rule `@operationIds` takes a resource's singular by. */
import { expect, it } from 'bun:test';
import { singularOf } from './verbs';

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
])('takes %s to %s', (plural, singular) => {
	expect(singularOf(plural)).toBe(singular);
});
