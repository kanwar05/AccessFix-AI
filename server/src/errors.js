export class ScanError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.name = 'ScanError';
    this.status = status;
    this.code = code;
  }
}
