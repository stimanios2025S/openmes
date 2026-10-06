import assert from "node:assert/strict";
import { test } from "node:test";
import { FULL_ROUTE, PRODUCTS, MATERIALS } from "../lib/domain";
import { passwordHash, verifyPassword } from "../lib/password";

test("only the two specified chairs are orderable", () => {
  assert.deepEqual(PRODUCTS.map(product => product.code), ["PRD-CAN-01", "PRD-G21-01"]);
  for (const product of PRODUCTS) {
    const amount = (code: string) => product.bom.find(line => line.material === code)?.qtyPerUnit;
    assert.equal(amount("MP-INSERT-M6"), product.insertCount);
    assert.equal(amount("MP-CAP-OVAL"), product.capCount);
    assert.equal(amount("MP-SABOT"), 4);
    assert.equal(amount("MP-TISSU"), 1.2);
    assert.equal(amount("MP-CARTON"), 0.25);
    assert.equal(amount("SF-CHASSIS-PEINT"), 1);
  }
  assert(MATERIALS.some(material => material.code === "MP-CARTON" && material.division === "MOBILIX"));
});

test("stages follow the six-plus-four factory route", () => {
  assert.deepEqual(FULL_ROUTE, ["COUPE", "USINAGE", "SOUDAGE", "MEULAGE", "VISSAGE", "POUDRAGE", "DECOUPE-BOIS", "COUTURE", "TAPISSAGE", "ASSEMBLAGE"]);
});

test("password hashes are salted and reject incorrect passwords", () => {
  const first = passwordHash("Password123!");
  assert.notEqual(first, passwordHash("Password123!"));
  assert(verifyPassword("Password123!", first));
  assert(!verifyPassword("wrong", first));
  assert(!verifyPassword("Password123!", "invalid"));
});
