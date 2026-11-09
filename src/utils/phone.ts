/* =====================================================================
   PHONE HELPERS (Cameroon mobile numbers)
   Accepts: 677123456, 6 77 12 34 56, +237677123456, 237677123456
   Stores:  +237677123456   (one single format, so it can be unique)
   ===================================================================== */
const stripSeparators = (value: string): string => value.replace(/[\s.-]/g, "");

export const isCameroonPhone = (value: string): boolean =>
  /^(\+?237)?6\d{8}$/.test(stripSeparators(value));

export const normalizePhone = (value: string): string =>
  `+237${stripSeparators(value).replace(/^\+?237/, "")}`;
