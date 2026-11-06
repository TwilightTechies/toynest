// Thrown by adapters when the data source could not be reached (timeout, outage).
// It means "couldn't check", which callers must not confuse with "checked and found nothing".
export class RepositoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryUnavailableError";
  }
}
