import { Schema, model, type Document, type Model } from 'mongoose';
import { HTTP_METHODS, type HttpMethod, type EndpointJsonSchema } from '@mock-api-engine/schema';

/**
 * The persisted shape of one user-defined mock endpoint. This is what gets
 * created via POST /admin/endpoints and read back on every server boot to
 * repopulate the in-memory route registry (see route-loader.service.ts).
 */
export interface IApiConfig {
  /** e.g. "/api/users" — always stored with a leading slash. */
  endpointName: string;
  httpMethod: HttpMethod;
  /** The validation rules a client request must satisfy. Free-form at the
   *  Mongoose level (Schema.Types.Mixed) because its internal shape is
   *  defined by EndpointJsonSchema, not by Mongoose's own type system —
   *  see jsonSchemaToZod() for where it's actually interpreted. */
  jsonSchema: EndpointJsonSchema;
  /** Soft toggle so an endpoint can be disabled without deleting its config
   *  or its history of request logs (Phase 2). Defaults to true. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApiConfigDocument extends IApiConfig, Document {}

const ApiConfigSchema = new Schema<IApiConfigDocument>(
  {
    endpointName: {
      type: String,
      required: [true, 'endpointName is required'],
      trim: true,
      validate: {
        validator: (value: string) => value.startsWith('/'),
        message: (props: { value: string }) =>
          `"${props.value}" must start with a leading "/" (e.g. "/api/users")`,
      },
    },
    httpMethod: {
      type: String,
      required: true,
      enum: { values: HTTP_METHODS as unknown as string[], message: '{VALUE} is not a supported HTTP method' },
      uppercase: true,
    },
    jsonSchema: {
      type: Schema.Types.Mixed,
      required: [true, 'jsonSchema is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// One config per (path, method) pair — this is the natural key the dynamic
// router looks up on, so it doubles as a data-integrity guarantee (no two
// configs can silently race to serve the same mock endpoint).
ApiConfigSchema.index({ endpointName: 1, httpMethod: 1 }, { unique: true });

export const ApiConfigModel: Model<IApiConfigDocument> = model<IApiConfigDocument>(
  'ApiConfig',
  ApiConfigSchema
);
