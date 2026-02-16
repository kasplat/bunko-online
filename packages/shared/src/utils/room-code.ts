// 23-char alphabet excluding confusing characters (O, I, L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
