import type { Entry } from './entry';

// The numeric formats are the ones TypeSpec writes from the base type: no
// `@format` in `lib/`. `-0` is refused by the GraphQL scalars and accepted by every schema here:
// no JSON Schema can express it, so it has no sample.
export const number: readonly Entry[] = [
	{
		name: 'BigInt',
		scalar: 'bigInt',
		accept: ['0', '-1', '123456789012345678901234567890'],
		refuse: ['007', '-0', '+1', '1.5', ' 1', '', 1],
	},
	{
		name: 'Long',
		scalar: 'long',
		accept: ['0', '9223372036854775807', '-9223372036854775808'],
		refuse: ['abc', '1.5', 'x', 1.5, true],
	},
	{
		name: 'NegativeFloat',
		scalar: 'negativeFloat',
		format: 'double',
		accept: [-0.5, -1e300],
		refuse: [0, 0.5, '-0.5'],
	},
	{
		name: 'NegativeInt',
		scalar: 'negativeInt',
		format: 'int32',
		accept: [-1, -2147483648],
		refuse: [0, 1, -2147483649, -1.5, '-1'],
	},
	{
		name: 'NonNegativeFloat',
		scalar: 'nonNegativeFloat',
		format: 'double',
		accept: [0, 1.5],
		refuse: [-0.5, '1.5'],
	},
	{
		name: 'NonNegativeInt',
		scalar: 'nonNegativeInt',
		format: 'int32',
		accept: [0, 2147483647],
		refuse: [-1, 2147483648, 1.5, '1'],
	},
	{
		name: 'NonPositiveFloat',
		scalar: 'nonPositiveFloat',
		format: 'double',
		accept: [0, -1.5],
		refuse: [0.5, '-1.5'],
	},
	{
		name: 'NonPositiveInt',
		scalar: 'nonPositiveInt',
		format: 'int32',
		accept: [0, -2147483648],
		refuse: [1, -2147483649, -1.5, '-1'],
	},
	{
		name: 'Port',
		scalar: 'port',
		format: 'int32',
		accept: [0, 80, 65535],
		refuse: [-1, 65536, 80.5, '80'],
	},
	{
		name: 'PositiveFloat',
		scalar: 'positiveFloat',
		format: 'double',
		accept: [0.5, 1e300],
		refuse: [0, -0.5, '0.5'],
	},
	{
		name: 'PositiveInt',
		scalar: 'positiveInt',
		format: 'int32',
		accept: [1, 2147483647],
		refuse: [0, -1, 1.5, 2147483648, '1'],
	},
	{
		name: 'SafeInt',
		scalar: 'safeInt',
		format: 'int64',
		accept: [0, -9007199254740991, 9007199254740991],
		refuse: [9007199254740992, -9007199254740992, 1.5, '1'],
	},
];
