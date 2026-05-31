/**
 * Vitest setup shared across the Feature 007 test suite.
 *
 * msw server is currently OPTIONAL — most tests mock supabase-js + the API
 * client directly rather than at the HTTP layer. When integration tests
 * arrive that need real HTTP, register handlers here.
 */
import '@testing-library/jest-dom/vitest'
