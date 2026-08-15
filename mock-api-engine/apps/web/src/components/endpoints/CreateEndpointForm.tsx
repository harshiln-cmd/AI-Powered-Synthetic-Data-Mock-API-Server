import { useState, type FormEvent } from 'react';
import { HTTP_METHODS, CreateEndpointConfigSchema, type CreateEndpointConfigInput, type HttpMethod } from '@mock-api-engine/schema';
import { ApiError } from '../../lib/api-client';
import { formatZodIssues } from '../../lib/format-zod-issues';
import { Button } from '../ui/Button';

const EXAMPLE_JSON_SCHEMA = `{
  "response": {
    "type": "object",
    "required": ["id", "name", "email"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    }
  }
}`;

const FIELD_CLASSES =
  'w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand';

interface CreateEndpointFormProps {
  onCreate: (input: CreateEndpointConfigInput) => Promise<unknown>;
  onSuccess: () => void;
}

export function CreateEndpointForm({ onCreate, onSuccess }: CreateEndpointFormProps) {
  const [endpointName, setEndpointName] = useState('/api/users');
  const [httpMethod, setHttpMethod] = useState<HttpMethod>('GET');
  const [jsonSchemaText, setJsonSchemaText] = useState(EXAMPLE_JSON_SCHEMA);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);

    let parsedSchema: unknown;
    try {
      parsedSchema = JSON.parse(jsonSchemaText);
    } catch (parseError) {
      setErrors([`jsonSchema is not valid JSON: ${(parseError as Error).message}`]);
      return;
    }

    // Reuses the exact schema apps/api validates against server-side, so a
    // config that passes here is guaranteed to pass there too — the only
    // way these could disagree is a version mismatch across the workspace.
    const result = CreateEndpointConfigSchema.safeParse({
      endpointName,
      httpMethod,
      jsonSchema: parsedSchema,
    });

    if (!result.success) {
      setErrors(formatZodIssues(result.error.issues));
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate(result.data);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.issues) {
        setErrors(formatZodIssues(err.issues));
      } else {
        setErrors([err instanceof Error ? err.message : 'Something went wrong creating this endpoint.']);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="endpointName" className="mb-1.5 block text-sm font-medium text-ink">
          Endpoint path
        </label>
        <input
          id="endpointName"
          type="text"
          value={endpointName}
          onChange={(event) => setEndpointName(event.target.value)}
          placeholder="/api/users"
          className={`${FIELD_CLASSES} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="httpMethod" className="mb-1.5 block text-sm font-medium text-ink">
          HTTP method
        </label>
        <select
          id="httpMethod"
          value={httpMethod}
          onChange={(event) => setHttpMethod(event.target.value as HttpMethod)}
          className={FIELD_CLASSES}
        >
          {HTTP_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="jsonSchema" className="mb-1.5 block text-sm font-medium text-ink">
          JSON schema
        </label>
        <textarea
          id="jsonSchema"
          value={jsonSchemaText}
          onChange={(event) => setJsonSchemaText(event.target.value)}
          rows={10}
          spellCheck={false}
          className={`${FIELD_CLASSES} font-mono text-code resize-y`}
        />
        <p className="mt-1.5 text-xs text-ink-muted">
          <code className="text-accent">body</code>, <code className="text-accent">query</code>, and/or{' '}
          <code className="text-accent">response</code> — see the README for the full shape.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-3.5 py-3">
          <ul className="space-y-1 text-sm text-error">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create endpoint'}
        </Button>
      </div>
    </form>
  );
}
