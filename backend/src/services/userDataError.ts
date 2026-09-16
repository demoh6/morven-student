/**
 * Shared error for the account-scoped user-data services (tasks, exams,
 * flashcards, notes, user files, pomodoro stats, adhkar progress,
 * preferences). Mirrors the existing per-feature error classes
 * (ResourceError / GroupError / AdhkarError) so route handlers can map the
 * status directly.
 */
export class UserDataError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "UserDataError";
    this.status = status;
    this.code = code;
  }
}