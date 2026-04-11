export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AccountLockedError extends AppError {
  constructor(message = 'Account locked. Contact administrator.') {
    super(message, 423);
  }
}

export class UnauthorisedError extends AppError {
  constructor(message = 'Unauthorised') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}
