import type { Client, ClientMethod } from 'openapi-fetch';
import {
	type AuthMiddlewareOptions,
	authMiddleware,
	type CacheMiddlewareOptions,
	cacheMiddleware,
} from './middlewares';
import type { MediaType } from './types';

export type RESTDataSourceOptions<
	Paths extends {},
	Media extends MediaType = MediaType,
> = {
	client: Client<Paths, Media>;
	cacheOptions?: CacheMiddlewareOptions;
	authOptions?: AuthMiddlewareOptions;
};

export class RESTDataSource<
	Paths extends {},
	Media extends MediaType = MediaType,
> {
	protected client: Client<Paths, Media>;

	get: ClientMethod<Paths, 'get', Media>;
	post: ClientMethod<Paths, 'post', Media>;
	put: ClientMethod<Paths, 'put', Media>;
	patch: ClientMethod<Paths, 'patch', Media>;
	delete: ClientMethod<Paths, 'delete', Media>;
	head: ClientMethod<Paths, 'head', Media>;
	options: ClientMethod<Paths, 'options', Media>;
	trace: ClientMethod<Paths, 'trace', Media>;

	constructor(options: RESTDataSourceOptions<Paths, Media>) {
		this.client = options.client;
		this.client.use(cacheMiddleware(options.cacheOptions));
		if (options.authOptions) {
			this.client.use(authMiddleware(options.authOptions));
		}
		this.get = this.client.GET;
		this.post = this.client.POST;
		this.put = this.client.PUT;
		this.patch = this.client.PATCH;
		this.delete = this.client.DELETE;
		this.head = this.client.HEAD;
		this.options = this.client.OPTIONS;
		this.trace = this.client.TRACE;
	}
}
