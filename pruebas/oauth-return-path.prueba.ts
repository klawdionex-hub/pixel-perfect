import { describe, it, expect } from "bun:test";
import { oauthReturnPath } from "../src/lib/oauth-return-path";

describe("retorno seguro al consentimiento", () => {
  it("conserva la autorización y el fragmento", () => {
    expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#detalle")).toBe("/.lovable/oauth/consent?authorization_id=abc#detalle");
  });
  it("rechaza destinos externos y caracteres inseguros", () => {
    for (const path of ["https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/\nlogin", "/%2f/outside.invalid".replace("%2f", "/")]) {
      expect(oauthReturnPath(path)).toBe("/");
    }
  });
});