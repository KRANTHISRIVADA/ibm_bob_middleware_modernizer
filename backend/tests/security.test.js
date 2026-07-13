'use strict';
const { maskCredentials, sanitizeFilePath, validateFileExtension } = require('../src/utils/security');

describe('Security Utils', () => {
  test('maskCredentials hides API keys', () => {
    const input = 'apikey: mySecretKey123';
    const result = maskCredentials(input);
    expect(result).toContain('***MASKED***');
    expect(result).not.toContain('mySecretKey123');
  });

  test('maskCredentials hides passwords', () => {
    const input = 'password=SuperSecret99';
    expect(maskCredentials(input)).not.toContain('SuperSecret99');
  });

  test('maskCredentials hides Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.abc.def';
    expect(maskCredentials(input)).not.toContain('eyJhbGciOiJSUzI1NiJ9');
  });

  test('sanitizeFilePath removes path traversal', () => {
    expect(sanitizeFilePath('../../etc/passwd')).not.toContain('..');
  });

  test('validateFileExtension allows .yaml', () => {
    expect(validateFileExtension('api.yaml')).toBe(true);
  });

  test('validateFileExtension blocks .exe', () => {
    expect(validateFileExtension('malware.exe')).toBe(false);
  });
});
