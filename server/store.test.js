import test from "node:test";
import assert from "node:assert/strict";
import { StoreValidationError, validateCustomer, validateProduct } from "./store.js";

test("normalizes valid product fields for database storage", () => {
  const product = validateProduct({
    name: " Ground coffee ",
    category: " Pantry ",
    sku: "cof-002",
    price: 12.5,
    stock: 6,
    unit: " bag ",
  }, "product-1");

  assert.equal(product.productId, "product-1");
  assert.equal(product.name, "Ground coffee");
  assert.equal(product.sku, "COF-002");
  assert.equal(product.stock, 6);
});

test("rejects invalid product prices and fractional stock", () => {
  const product = { name: "Coffee", category: "Pantry", sku: "COF-1", price: 1.001, stock: 2, unit: "bag" };
  assert.throws(() => validateProduct(product, "product-1"), StoreValidationError);
  assert.throws(() => validateProduct({ ...product, price: 1, stock: 2.5 }, "product-1"), /whole number/);
});

test("normalizes valid customer information", () => {
  const customer = validateCustomer({ name: " Taylor Rivera ", email: "TAYLOR@example.com " }, "customer-1");
  assert.equal(customer.customerId, "customer-1");
  assert.equal(customer.name, "Taylor Rivera");
  assert.equal(customer.email, "taylor@example.com");
  assert.equal(customer.initials, "TR");
  assert.equal(customer.visits, 0);
});

test("rejects invalid customer emails", () => {
  assert.throws(() => validateCustomer({ name: "Taylor", email: "not-an-email" }, "customer-1"), /valid email/);
});
