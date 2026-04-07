// Stub for @supabase/functions-js — not used in this app.
// Replaces the full package at build time to reduce bundle size.

export const FunctionRegion = { Any: 'any', ApNortheast1: 'ap-northeast-1', ApNortheast2: 'ap-northeast-2', ApSouth1: 'ap-south-1', ApSoutheast1: 'ap-southeast-1', ApSoutheast2: 'ap-southeast-2', CaCentral1: 'ca-central-1', EuCentral1: 'eu-central-1', EuWest1: 'eu-west-1', EuWest2: 'eu-west-2', EuWest3: 'eu-west-3', SaEast1: 'sa-east-1', UsEast1: 'us-east-1', UsWest1: 'us-west-1', UsWest2: 'us-west-2' }

export class FunctionsError       extends Error { constructor(m, n, c) { super(m); this.name = n; this.context = c } }
export class FunctionsFetchError  extends FunctionsError { constructor(m) { super(m, 'FunctionsFetchError', {}) } }
export class FunctionsHttpError   extends FunctionsError { constructor(ctx) { super('FunctionsHttpError', 'FunctionsHttpError', ctx) } }
export class FunctionsRelayError  extends FunctionsError { constructor(ctx) { super('FunctionsRelayError', 'FunctionsRelayError', ctx) } }

export class FunctionsClient {
  constructor() {}
  invoke() { return Promise.resolve({ data: null, error: new FunctionsError('Functions not enabled', 'FunctionsError', {}) }) }
  setAuth() {}
}
