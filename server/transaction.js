import { createHash } from "node:crypto";
import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
}, { _id: false });

export const transactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  payloadHash: { type: String, required: true },
  createdAt: { type: Date, required: true },
  customer: { type: String, required: true },
  customerId: { type: String, default: null },
  items: { type: [itemSchema], required: true },
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  total: { type: Number, required: true },
  method: { type: String, required: true, enum: ["Card", "Cash"] },
  status: { type: String, required: true, enum: ["pending", "synced"], default: "pending" },
  syncedAt: { type: Date, default: null },
}, { versionKey: false });

export class TransactionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransactionValidationError";
  }
}

const isMoney = (value) => Number.isFinite(value)
  && value >= 0
  && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateTransaction(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TransactionValidationError("Request body must be a transaction object");
  }

  const { id, date, customer, customerId, items, subtotal, tax, total, method } = input;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new TransactionValidationError("Transaction id must contain 1-80 letters, numbers, underscores, or hyphens");
  }
  const createdAt = new Date(date);
  if (typeof date !== "string" || Number.isNaN(createdAt.getTime())) {
    throw new TransactionValidationError("Transaction date must be a valid date string");
  }
  if (typeof customer !== "string" || !customer.trim() || customer.trim().length > 120) {
    throw new TransactionValidationError("Customer must be a non-empty string of at most 120 characters");
  }
  if (customerId !== undefined && customerId !== null
    && (typeof customerId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(customerId))) {
    throw new TransactionValidationError("Customer id must contain 1-80 letters, numbers, underscores, or hyphens");
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new TransactionValidationError("A transaction must contain between 1 and 100 items");
  }
  const normalizedItems = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TransactionValidationError("Each transaction item must be an object");
    }
    const productId = String(item.id ?? "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(productId)) {
      throw new TransactionValidationError("Each item must have a valid product id");
    }
    if (typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 160) {
      throw new TransactionValidationError("Each item must have a name of at most 160 characters");
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) {
      throw new TransactionValidationError("Item quantity must be a positive whole number");
    }
    if (!isMoney(item.price)) {
      throw new TransactionValidationError("Item price must be a non-negative amount with at most two decimal places");
    }
    return {
      productId,
      name: item.name.trim(),
      quantity: item.quantity,
      price: roundMoney(item.price),
    };
  });

  const calculatedSubtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
  if (!isMoney(subtotal) || Math.abs(calculatedSubtotal - subtotal) > 0.001) {
    throw new TransactionValidationError("Subtotal does not match the transaction items");
  }
  if (!isMoney(tax) || Math.abs(roundMoney(subtotal * 0.08) - tax) > 0.001) {
    throw new TransactionValidationError("Tax does not match the configured 8% rate");
  }
  if (!isMoney(tax) || !isMoney(total) || Math.abs(roundMoney(subtotal + tax) - total) > 0.001) {
    throw new TransactionValidationError("Total must equal subtotal plus tax");
  }
  if (!["Card", "Cash"].includes(method)) {
    throw new TransactionValidationError("Payment method must be Card or Cash");
  }

  const normalized = {
    transactionId: id,
    createdAt,
    customer: customer.trim(),
    customerId: customerId || null,
    items: normalizedItems,
    subtotal: roundMoney(subtotal),
    tax: roundMoney(tax),
    total: roundMoney(total),
    method,
  };
  return {
    ...normalized,
    payloadHash: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
  };
}
