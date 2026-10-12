import test from "node:test";
import assert from "node:assert/strict";
import { TransactionValidationError, validateTransaction } from "./transaction.js";

const validSale = () => ({
  id: "sale_123",
  date: "2026-10-04T10:00:00.000Z",
  customer: "Walk-in customer",
  items: [{ id: 1, name: "Coffee", quantity: 2, price: 14.5 }],
  subtotal: 29,
  tax: 2.32,
  total: 31.32,
  method: "Card",
});

test("normalizes valid sale items and generates a payload hash", () => {
  const result = validateTransaction(validSale());
  assert.equal(result.transactionId, "sale_123");
  assert.equal(result.items[0].productId, "1");
  assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
});

test("rejects a subtotal that does not match the line items", () => {
  assert.throws(() => validateTransaction({ ...validSale(), subtotal: 28 }), TransactionValidationError);
});

test("rejects tax that does not match the configured rate", () => {
  assert.throws(() => validateTransaction({ ...validSale(), tax: 2, total: 31 }), /8% rate/);
});

test("rejects non-integer quantities", () => {
  const sale = validSale();
  sale.items[0].quantity = 1.5;
  assert.throws(() => validateTransaction(sale), /positive whole number/);
});

test("rejects unsupported payment methods", () => {
  assert.throws(() => validateTransaction({ ...validSale(), method: "Cheque" }), /Payment method/);
});
