/* =====================================================================
   API ERROR
   Throw this anywhere to send a clean error to the frontend:
     throw ApiError.badRequest("Message shown to the user");
   The frontend receives { "message": "..." } with the right status code.
   ===================================================================== */
export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }

  static badRequest = (message: string) => new ApiError(400, message);
  static unauthorized = (message = "Authentification requise.") => new ApiError(401, message);
  static forbidden = (message = "Accès refusé.") => new ApiError(403, message);
  static notFound = (message = "Ressource introuvable.") => new ApiError(404, message);
  static conflict = (message: string) => new ApiError(409, message);
  static unprocessable = (message: string) => new ApiError(422, message);
  static tooManyRequests = (message: string) => new ApiError(429, message);
}
