// Thrown by adapters when the data source could not be reached (timeout, outage).
// It means "couldn't check", which callers must not confuse with "checked and found nothing".
export class RepositoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryUnavailableError";
  }
}

// The row changed after the admin opened it (optimistic concurrency): reload rather than overwrite.
export class ConflictError extends Error {
  constructor(message = "The record changed since it was loaded") {
    super(message);
    this.name = "ConflictError";
  }
}

// Another product already uses this slug (unique constraint).
export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Slug already in use: ${slug}`);
    this.name = "SlugTakenError";
  }
}

// place_order() found too few units of a tracked product (ADR-023). Nothing was written.
export class OutOfStockError extends Error {
  constructor(readonly productId: string) {
    super(`Out of stock: ${productId}`);
    this.name = "OutOfStockError";
  }
}

// The product appears in at least one order, so it can only be archived, never deleted (ADR-023).
export class HasOrdersError extends Error {
  constructor(readonly productId: string) {
    super(`Product has orders: ${productId}`);
    this.name = "HasOrdersError";
  }
}
