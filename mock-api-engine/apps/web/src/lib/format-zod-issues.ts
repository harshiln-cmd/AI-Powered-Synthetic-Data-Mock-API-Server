export interface ZodIssueLike {
  path: PropertyKey[];
  message: string;
}

/** "response.properties.name: Expected string, received number" style lines — same shape whether the issue came from client-side Zod validation or the server's 400 response. */
export function formatZodIssues(issues: ZodIssueLike[]): string[] {
  return issues.map((issue) => {
    // String(segment) rather than template-literal interpolation or
    // Array.prototype.join() — both throw a TypeError on a symbol path
    // segment; Zod 4 types path as PropertyKey[], which includes symbol.
    const path = issue.path.map((segment) => String(segment)).join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
