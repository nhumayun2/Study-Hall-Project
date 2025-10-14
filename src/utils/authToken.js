import jwt from "jsonwebtoken";

/**
 * @desc Creates a JSON Web Token (JWT).
 * @param {object} jwtPayload - The payload to sign into the token.
 * @param {string} secret - The secret key for signing the token.
 * @param {string} expiresIn - The expiration time (e.g., '1d', '5m').
 * @returns {string} The signed JWT.
 */
export const createToken = (jwtPayload, secret, expiresIn) => {
  const options = { expiresIn: expiresIn };
  return jwt.sign(jwtPayload, secret, options);
};

/**
 * @desc Verifies a JSON Web Token (JWT).
 * @param {string} token - The JWT string to verify.
 * @param {string} secret - The secret key used for signing the token.
 * @returns {object} The decoded payload if the token is valid.
 */
export const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};
