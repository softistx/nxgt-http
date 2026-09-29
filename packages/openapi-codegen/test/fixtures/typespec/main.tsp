// A pet store authored in TypeSpec, compiled to OpenAPI 3.1 by
// @typespec/openapi3: the constructs an nxgt service writes, so the generator
// is held to what TypeSpec emits for each.
import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

@service(#{ title: "Pet store (TypeSpec)" })
@server("https://api.example.com", "Production")
namespace PetStore;

/** How far a pet has come through adoption. */
enum Status {
  available,
  pending,
  adopted,
}

/** A pet's size, as the API spells it. */
enum Size {
  Small: "S",
  Medium: "M",
  Large: "L",
}

/** A dog. */
model Dog {
  kind: "dog";
  /** Whether it barks at the post. */
  barks: boolean;
}

/** A cat. */
model Cat {
  kind: "cat";
  @minValue(0)
  @maxValue(9)
  lives: int32;
}

/** What a pet is, told apart by its `kind`. */
@discriminated(#{ envelope: "none", discriminatorPropertyName: "kind" })
union Species {
  dog: Dog,
  cat: Cat,
}

model Pet {
  @visibility(Lifecycle.Read)
  @format("uuid")
  id: string;

  @minLength(1)
  @maxLength(64)
  name: string;

  status: Status;
  size?: Size;
  species: Species;

  /** Free-form labels. */
  tags?: string[];

  /** Counts per vaccine. */
  vaccines?: Record<int32>;

  /** When it was adopted, if it was. */
  adoptedAt: utcDateTime | null;

  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;

  /** An id wider than 2^53. */
  @visibility(Lifecycle.Read)
  serial: int64;
}

/** A page of items, and the cursor to the next one. */
@friendlyName("{name}Page", Item)
model Page<Item> {
  items: Item[];
  nextCursor?: string;
}

@error
model Problem {
  code: string;
  message: string;
}

model NotFound {
  @statusCode _: 404;
  @body problem: Problem;
}

model Invalid {
  @statusCode _: 422;
  @body problem: Problem;
}

@route("/pets")
@tag("Pets")
interface Pets {
  /** Lists pets, a page at a time. */
  @get
  @operationId("listPets")
  list(
    @query status?: Status,
    @query(#{ explode: true }) tags?: string[],
    @query @minValue(1) @maxValue(100) limit?: int32 = 20,
    @query cursor?: string,
    @header("X-Request-Id") requestId?: string,
  ): Page<Pet>;

  @get
  read(@path @format("uuid") petId: string): Pet | NotFound;

  // `Create<Pet>`, not `Pet`: without it the body reuses `Pet`, whose
  // read-only properties are required, and the generator ignores `readOnly`.
  @post
  create(@body pet: Create<Pet>): {
    @statusCode _: 201;
    @header location: string;
    @body pet: Pet;
  } | Invalid;

  @patch
  update(@path @format("uuid") petId: string, @body pet: MergePatchUpdate<Pet>):
    | Pet
    | NotFound
    | Invalid;

  @delete
  delete(@path @format("uuid") petId: string): NoContentResponse | NotFound;
}
