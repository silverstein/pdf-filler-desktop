// Ensure server import doesn't start listening during unit tests
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

