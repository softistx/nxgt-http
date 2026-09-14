/**
 * `@nxgt/openapi-codegen/hono`: the runtime `hono.ts` binds to its spec.
 * Import `createApi` and `createRoutes` from `hono.ts`, not from here.
 */
export {
	createApi,
	type OperationTable,
	type RuntimeMedia,
	type RuntimeOperation,
	type Validator,
} from './engine';
export {
	type SchemaIssue,
	type ValidationErrorHook,
	type ValidationFailure,
	type ValidationIssue,
	type ValidationTarget,
	validationErrorHandler,
} from './errors';
export type {
	Api,
	ApiOptions,
	ApiSpec,
	Chain,
	Method,
	RouteHandler,
	Routes,
	RoutesOptions,
	Scope,
	ScopeOf,
	Tagged,
	Whole,
} from './types';
