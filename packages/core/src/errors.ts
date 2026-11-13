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
