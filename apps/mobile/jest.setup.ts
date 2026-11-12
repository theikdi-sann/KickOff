// Jest runs before any app module is imported. The Supabase client asserts its
// environment at import time, so give it values that cannot reach a real
// project — unit tests must never talk to the local stack or the hosted one.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.EXPO_PUBLIC_FUNCTIONS_URL = 'http://127.0.0.1:54321/functions/v1';
