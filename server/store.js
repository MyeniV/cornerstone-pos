import mongoose from "mongoose";

export const productSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, trim: true, maxlength: 40 },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40, unique: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  unit: { type: String, required: true, trim: true, maxlength: 30 },
  color: { type: String, required: true, default: "sand" },
  mark: { type: String, required: true, default: "◉" },
}, { versionKey: false });

export const customerSchema = new mongoose.Schema({
  customerId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  visits: { type: Number, required: true, min: 0, default: 0 },
  initials: { type: String, required: true, maxlength: 4 },
  tone: { type: String, required: true, default: "lavender" },
}, { versionKey: false });

export class StoreValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StoreValidationError";
  }
}

const isMoney = (value) => Number.isFinite(value)
  && value >= 0
  && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;

export function validateProduct(input, productId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new StoreValidationError("Request body must be a product object");
  }
  const { name, category, sku, price, stock, unit } = input;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 160) {
    throw new StoreValidationError("Product name must be between 1 and 160 characters");
  }
  if (typeof category !== "string" || !category.trim() || category.trim().length > 40) {
    throw new StoreValidationError("Product category must be between 1 and 40 characters");
  }
  if (typeof sku !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(sku.trim())) {
    throw new StoreValidationError("SKU must contain 1-40 letters, numbers, underscores, or hyphens");
  }
  if (!isMoney(price)) throw new StoreValidationError("Price must be a non-negative amount with at most two decimal places");
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000) {
    throw new StoreValidationError("Stock must be a whole number between 0 and 1,000,000");
  }
  if (typeof unit !== "string" || !unit.trim() || unit.trim().length > 30) {
    throw new StoreValidationError("Unit must be between 1 and 30 characters");
  }
  return {
    productId,
    name: name.trim(),
    category: category.trim(),
    sku: sku.trim().toUpperCase(),
    price,
    stock,
    unit: unit.trim(),
    color: ["sand", "olive", "peach", "gold", "blue", "lilac", "pink", "brown"].includes(input.color) ? input.color : "sand",
    mark: typeof input.mark === "string" && input.mark.length <= 8 ? input.mark : "◉",
  };
}

export function validateCustomer(input, customerId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new StoreValidationError("Request body must be a customer object");
  }
  const { name, email = "" } = input;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) {
    throw new StoreValidationError("Customer name must be between 1 and 120 characters");
  }
  if (typeof email !== "string" || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new StoreValidationError("Enter a valid email address of at most 254 characters");
  }
  return {
    customerId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    visits: 0,
    initials: name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    tone: "lavender",
  };
}

export const defaultProducts = [
  { productId: "1", name: "House Blend Coffee", category: "Pantry", sku: "COF-001", price: 14.5, stock: 24, unit: "bag", color: "sand", mark: "☕" },
  { productId: "2", name: "Olive Oil · Extra Virgin", category: "Pantry", sku: "OIL-014", price: 18, stock: 8, unit: "bottle", color: "olive", mark: "◉" },
  { productId: "3", name: "Sourdough Loaf", category: "Bakery", sku: "BAK-003", price: 8.25, stock: 12, unit: "loaf", color: "peach", mark: "♨" },
  { productId: "4", name: "Wildflower Honey", category: "Pantry", sku: "PAN-022", price: 11.75, stock: 6, unit: "jar", color: "gold", mark: "✳" },
  { productId: "5", name: "Ceramic Travel Mug", category: "Home", sku: "HOM-008", price: 22, stock: 15, unit: "each", color: "blue", mark: "◒" },
  { productId: "6", name: "Oat Milk", category: "Pantry", sku: "PAN-017", price: 5.5, stock: 3, unit: "carton", color: "lilac", mark: "◡" },
  { productId: "7", name: "Linen Tea Towel", category: "Home", sku: "HOM-011", price: 16, stock: 19, unit: "each", color: "pink", mark: "▤" },
  { productId: "8", name: "Dark Chocolate Bar", category: "Pantry", sku: "PAN-031", price: 6.75, stock: 2, unit: "bar", color: "brown", mark: "▰" },
];

export const defaultCustomers = [
  { customerId: "1", name: "Olivia Chen", email: "olivia.chen@email.com", visits: 12, initials: "OC", tone: "lavender" },
  { customerId: "2", name: "James Wilson", email: "james.w@email.com", visits: 8, initials: "JW", tone: "mint" },
  { customerId: "3", name: "Amara Okafor", email: "amara.o@email.com", visits: 5, initials: "AO", tone: "peach" },
  { customerId: "4", name: "Noah Patel", email: "noah.p@email.com", visits: 3, initials: "NP", tone: "blue" },
];
