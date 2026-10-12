import express from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSessionToken,
  dummyPasswordHash,
  employeeSchema,
  employeeSessionSchema,
  hashSessionToken,
  isValidEmployeeNo,
  normalizeEmployeeNo,
  shouldUseSecureCookie,
  verifyPassword,
} from "./auth.js";
import { observeRequest, renderMetrics, setGauge } from "./metrics.js";
import { transactionSchema, TransactionValidationError, validateTransaction } from "./transaction.js";
import {
  customerSchema,
  defaultCustomers,
  defaultProducts,
  productSchema,
  StoreValidationError,
  validateCustomer,
  validateProduct,
} from "./store.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const localMongoUri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/cornerstone_pos";
const cloudMongoUri = process.env.CLOUD_MONGODB_URI;
const localDatabase = mongoose.connection;
const LocalTransaction = mongoose.model("Transaction", transactionSchema, "transactions");
const Product = mongoose.model("Product", productSchema, "products");
const Customer = mongoose.model("Customer", customerSchema, "customers");
const Employee = mongoose.model("Employee", employeeSchema, "employees");
const EmployeeSession = mongoose.model("EmployeeSession", employeeSessionSchema, "employee_sessions");
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientBuildDirectory = path.resolve(currentDirectory, "..", "dist");
const sessionCookieName = "cornerstone_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;

let cloudConnection;
let cloudConnecting;
let CloudTransaction;
let syncRunning = false;

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb", strict: true }));
app.use((request, response, next) => {
  if (request.path === "/metrics") return next();
  const start = process.hrtime.bigint();
  response.on("finish", () => {
    const route = request.route?.path
      ? `${request.baseUrl}${request.route.path}`
      : request.path === "/" ? "/" : "/unmatched";
    observeRequest(request.method, route, response.statusCode, Number(process.hrtime.bigint() - start) / 1e9);
  });
  next();
});

app.get("/healthz", (_request, response) => response.status(200).json({ status: "alive" }));
app.get("/readyz", (_request, response) => {
  const ready = localDatabase.readyState === 1;
  setGauge("pos_mongodb_up", ready ? 1 : 0, "Whether the local MongoDB connection is ready");
  response.status(ready ? 200 : 503).json({ ready });
});
app.get("/metrics", async (_request, response, next) => {
  try {
    setGauge("pos_mongodb_up", localDatabase.readyState === 1 ? 1 : 0, "Whether the local MongoDB connection is ready");
    setGauge("pos_cloud_mongodb_up", cloudConnection?.readyState === 1 ? 1 : 0, "Whether the cloud MongoDB connection is ready");
    setGauge("pos_cloud_mongodb_configured", cloudMongoUri ? 1 : 0, "Whether a cloud MongoDB URI is configured");
    setGauge("pos_pending_transactions", await LocalTransaction.countDocuments({ status: "pending" }), "Number of transactions awaiting cloud synchronization");
    response.type("text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
  } catch (error) {
    next(error);
  }
});

function getSessionToken(request) {
  const cookie = request.headers.cookie?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie?.slice(sessionCookieName.length + 1) || "";
}

function setSessionCookie(response, request, token, maxAgeSeconds) {
  const secure = shouldUseSecureCookie(request) ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`,
  );
}

async function requireSession(request, response, next) {
  try {
    const token = getSessionToken(request);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return response.status(401).json({ error: "Authentication required" });
    }
    const session = await EmployeeSession.findOne({
      tokenHash: hashSessionToken(token),
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!session) return response.status(401).json({ error: "Authentication required" });
    request.employeeNo = session.employeeNo;
    next();
  } catch (error) {
    next(error);
  }
}

async function connectCloud() {
  if (!cloudMongoUri) return false;
  if (cloudConnection?.readyState === 1) return true;
  if (cloudConnecting) return cloudConnecting;

  cloudConnecting = (async () => {
    const connection = mongoose.createConnection(cloudMongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    try {
      await connection.asPromise();
      cloudConnection = connection;
      CloudTransaction = connection.model("Transaction", transactionSchema, "transactions");
      console.info("Cloud MongoDB connection established");
      return true;
    } catch (error) {
      console.error("Cloud MongoDB connection failed; local transactions will remain queued:", error.message);
      await connection.close().catch((closeError) => {
        console.error("Unable to close failed cloud MongoDB connection:", closeError.message);
      });
      return false;
    } finally {
      cloudConnecting = undefined;
    }
  })();
  return cloudConnecting;
}

app.post("/api/login", async (request, response, next) => {
  try {
    const employeeNo = normalizeEmployeeNo(request.body?.employeeNo);
    const password = request.body?.password;
    if (typeof password !== "string" || password.length < 1 || password.length > 128) {
      return response.status(400).json({ error: "Enter a valid employee number and password" });
    }
    const employee = isValidEmployeeNo(employeeNo)
      ? await Employee.findOne({ employeeNo }).select("+passwordHash").lean()
      : null;
    const validPassword = await verifyPassword(password, employee?.passwordHash || await dummyPasswordHash);
    if (!employee || !validPassword) {
      return response.status(401).json({ error: "Invalid employee number or password" });
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionDurationMs);
    await EmployeeSession.create({
      tokenHash: hashSessionToken(token),
      employeeNo: employee.employeeNo,
      expiresAt,
    });
    setSessionCookie(response, request, token, sessionDurationMs / 1000);
    response.json({ employeeNo: employee.employeeNo, displayName: employee.displayName || employee.employeeNo });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", requireSession, (request, response) => {
  Employee.findOne({ employeeNo: request.employeeNo }).select("employeeNo displayName").lean()
    .then((employee) => {
      if (!employee) return response.status(401).json({ error: "Authentication required" });
      response.json({ employeeNo: employee.employeeNo, displayName: employee.displayName || employee.employeeNo });
    })
    .catch((error) => {
      console.error("Unable to load signed-in employee profile:", error);
      response.status(500).json({ error: "The employee profile could not be loaded" });
    });
});

app.post("/api/logout", async (request, response, next) => {
  try {
    const token = getSessionToken(request);
    if (token) await EmployeeSession.deleteOne({ tokenHash: hashSessionToken(token) });
    setSessionCookie(response, request, "", 0);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use("/api/transactions", requireSession);
app.use("/api/sync", requireSession);
app.use("/api/health", requireSession);
app.use("/api/products", requireSession);
app.use("/api/customers", requireSession);

app.get("/api/products", async (_request, response, next) => {
  try {
    const products = await Product.find().sort({ name: 1 }).lean();
    response.json(products.map(({ productId, ...product }) => ({ ...product, id: productId })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", async (request, response, next) => {
  try {
    const product = validateProduct(request.body, randomUUID());
    const saved = await Product.create(product);
    const { productId, ...result } = saved.toObject();
    response.status(201).json({ ...result, id: productId });
  } catch (error) {
    if (error instanceof StoreValidationError) return response.status(400).json({ error: error.message });
    if (error.code === 11000) return response.status(409).json({ error: "A product with this SKU already exists" });
    next(error);
  }
});

app.get("/api/customers", async (_request, response, next) => {
  try {
    const customers = await Customer.find().sort({ name: 1 }).lean();
    response.json(customers.map(({ customerId, ...customer }) => ({ ...customer, id: customerId })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/customers", async (request, response, next) => {
  try {
    const customer = validateCustomer(request.body, randomUUID());
    const saved = await Customer.create(customer);
    const { customerId, ...result } = saved.toObject();
    response.status(201).json({ ...result, id: customerId });
  } catch (error) {
    if (error instanceof StoreValidationError) return response.status(400).json({ error: error.message });
    next(error);
  }
});

async function synchronizePending() {
  if (syncRunning) {
    return { synced: 0, pending: await LocalTransaction.countDocuments({ status: "pending" }) };
  }
  syncRunning = true;
  try {
    if (!await connectCloud()) {
      return { synced: 0, pending: await LocalTransaction.countDocuments({ status: "pending" }) };
    }
    const pendingTransactions = await LocalTransaction.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    if (pendingTransactions.length === 0) {
      return { synced: 0, pending: 0 };
    }

    await CloudTransaction.bulkWrite(pendingTransactions.map((transaction) => ({
      updateOne: {
        filter: { transactionId: transaction.transactionId },
        update: {
          $setOnInsert: {
            ...transaction,
            status: "synced",
            syncedAt: new Date(),
          },
        },
        upsert: true,
      },
    })), { ordered: true });

    const cloudCopies = await CloudTransaction.find({
      transactionId: { $in: pendingTransactions.map(({ transactionId }) => transactionId) },
    }).select("transactionId payloadHash").lean();
    const cloudHashes = new Map(cloudCopies.map(({ transactionId, payloadHash }) => [transactionId, payloadHash]));
    const conflicts = pendingTransactions.filter(({ transactionId, payloadHash }) => cloudHashes.get(transactionId) !== payloadHash);
    if (conflicts.length) {
      throw new Error(`Cloud transaction id conflict for ${conflicts.map(({ transactionId }) => transactionId).join(", ")}`);
    }

    const syncedAt = new Date();
    const result = await LocalTransaction.updateMany(
      { transactionId: { $in: pendingTransactions.map(({ transactionId }) => transactionId) }, status: "pending" },
      { $set: { status: "synced", syncedAt } },
    );
    const pending = await LocalTransaction.countDocuments({ status: "pending" });
    return { synced: result.modifiedCount, pending };
  } catch (error) {
    console.error("Differential cloud synchronization failed; transactions remain queued:", error.message);
    return { synced: 0, pending: await LocalTransaction.countDocuments({ status: "pending" }) };
  } finally {
    syncRunning = false;
  }
}

app.get("/api/health", async (_request, response, next) => {
  try {
    const pending = await LocalTransaction.countDocuments({ status: "pending" });
    setGauge("pos_mongodb_up", localDatabase.readyState === 1 ? 1 : 0, "Whether the local MongoDB connection is ready");
    setGauge("pos_cloud_mongodb_up", cloudConnection?.readyState === 1 ? 1 : 0, "Whether the cloud MongoDB connection is ready");
    setGauge("pos_cloud_mongodb_configured", cloudMongoUri ? 1 : 0, "Whether a cloud MongoDB URI is configured");
    setGauge("pos_pending_transactions", pending, "Number of transactions awaiting cloud synchronization");
    response.json({
      localDatabase: localDatabase.readyState === 1,
      cloudConfigured: Boolean(cloudMongoUri),
      cloudConnected: cloudConnection?.readyState === 1,
      pending,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/transactions", async (request, response, next) => {
  try {
    const requestedLimit = Number(request.query.limit || 500);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 500;
    const transactions = await LocalTransaction.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    response.json(transactions);
  } catch (error) {
    next(error);
  }
});

app.post("/api/transactions", async (request, response, next) => {
  try {
    const submitted = validateTransaction(request.body);
    const prior = await LocalTransaction.findOne({ transactionId: submitted.transactionId }).lean();
    if (prior) {
      if (prior.payloadHash !== submitted.payloadHash) {
        return response.status(409).json({ error: "Transaction id already exists with different transaction data" });
      }
      const sync = await synchronizePending();
      return response.status(200).json({ ...prior, sync });
    }
    const requestedIds = [...new Set(submitted.items.map((item) => item.productId))];
    const products = await Product.find({ productId: { $in: requestedIds } }).lean();
    if (products.length !== requestedIds.length) {
      return response.status(409).json({ error: "One or more products are no longer available" });
    }
    const productById = new Map(products.map((product) => [product.productId, product]));
    const stalePriceItem = submitted.items.find((item) => productById.get(item.productId).price !== item.price);
    if (stalePriceItem) {
      return response.status(409).json({ error: `The price for ${productById.get(stalePriceItem.productId).name} changed. Review the cart before payment` });
    }
    const canonicalItems = submitted.items.map((item) => {
      const product = productById.get(item.productId);
      return { id: item.productId, name: product.name, quantity: item.quantity, price: product.price };
    });
    const subtotal = Number(canonicalItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
    const tax = Number((subtotal * 0.08).toFixed(2));
    const selectedCustomer = submitted.customerId
      ? await Customer.findOne({ customerId: submitted.customerId }).lean()
      : null;
    if (submitted.customerId && !selectedCustomer) {
      return response.status(409).json({ error: "The selected customer no longer exists" });
    }
    if (submitted.subtotal !== subtotal || submitted.tax !== tax || submitted.total !== Number((subtotal + tax).toFixed(2))) {
      return response.status(409).json({ error: "The cart total changed. Review the cart before payment" });
    }
    const canonical = validateTransaction({
      ...request.body,
      customer: selectedCustomer?.name || submitted.customer,
      items: canonicalItems,
      subtotal,
      tax,
      total: Number((subtotal + tax).toFixed(2)),
    });

    const decremented = [];
    let saved;
    try {
      for (const item of canonical.items) {
        const updated = await Product.findOneAndUpdate(
          { productId: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true },
        ).lean();
        if (!updated) throw new Error(`Insufficient stock for ${item.name}`);
        decremented.push(item);
      }
      [saved] = await LocalTransaction.create([{ ...canonical, status: "pending" }]);
    } catch (error) {
      await Promise.all(decremented.map((item) => Product.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity } },
      )));
      if (error.message.startsWith("Insufficient stock for ")) {
        return response.status(409).json({ error: error.message });
      }
      if (error.code === 11000) {
        const concurrentSale = await LocalTransaction.findOne({ transactionId: canonical.transactionId }).lean();
        if (concurrentSale) {
          if (concurrentSale.payloadHash !== canonical.payloadHash) {
            return response.status(409).json({ error: "Transaction id already exists with different transaction data" });
          }
          const sync = await synchronizePending();
          return response.status(200).json({ ...concurrentSale, sync });
        }
      }
      throw error;
    }
    if (canonical.customerId) {
      try {
        await Customer.updateOne({ customerId: canonical.customerId }, { $inc: { visits: 1 } });
      } catch (error) {
        console.error(`Sale ${canonical.transactionId} was saved, but customer visit count could not be updated:`, error);
      }
    }
    const sync = await synchronizePending();
    response.status(201).json({ ...saved.toObject(), sync });
  } catch (error) {
    if (error instanceof TransactionValidationError) {
      return response.status(400).json({ error: error.message });
    }
    next(error);
  }
});

app.post("/api/sync", async (_request, response, next) => {
  try {
    const result = await synchronizePending();
    response.json({
      ...result,
      cloudConfigured: Boolean(cloudMongoUri),
      cloudConnected: cloudConnection?.readyState === 1,
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(clientBuildDirectory));
app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api/")) return next();
  response.sendFile(path.join(clientBuildDirectory, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "Request body must contain valid JSON" });
  }
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return response.status(error.status).json({ error: error.message });
  }
  console.error("API request failed:", error);
  response.status(500).json({ error: "The request could not be completed" });
});

async function start() {
  await mongoose.connect(localMongoUri, { serverSelectionTimeoutMS: 10000 });
  console.info("Local MongoDB connection established");
  if (await Product.countDocuments() === 0) await Product.insertMany(defaultProducts);
  if (await Customer.countDocuments() === 0) await Customer.insertMany(defaultCustomers);
  setGauge("pos_mongodb_up", 1, "Whether the local MongoDB connection is ready");
  setGauge("pos_cloud_mongodb_configured", cloudMongoUri ? 1 : 0, "Whether a cloud MongoDB URI is configured");
  setGauge("pos_pending_transactions", 0, "Number of transactions awaiting cloud synchronization");
  if (cloudMongoUri) void connectCloud();
  app.listen(port, "0.0.0.0", () => {
    console.info(`Cornerstone POS API listening on port ${port}`);
  });
  setInterval(() => {
    void synchronizePending();
  }, 10000).unref();
}

start().catch((error) => {
  console.error("Unable to start the POS API; verify that the local MongoDB service is available:", error);
  process.exitCode = 1;
});
