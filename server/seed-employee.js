import mongoose from "mongoose";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { employeeSchema, hashPassword, isValidEmployeeNo, normalizeEmployeeNo } from "./auth.js";

const localMongoUri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/cornerstone_pos";
const Employee = mongoose.model("Employee", employeeSchema, "employees");

function readHiddenPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password can be entered securely");
  }

  return new Promise((resolve, reject) => {
    stdout.write("Password (8-128 characters): ");
    stdin.setRawMode(true);
    stdin.resume();
    let password = "";

    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (input) => {
      for (const character of input.toString("utf8")) {
        if (character === "\u0003") return finish(new Error("Password entry cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else if (character >= " ") password += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  let employeeNo = "";
  let displayName = "";
  try {
    employeeNo = normalizeEmployeeNo(await prompt.question("Employee number: "));
    displayName = (await prompt.question("Employee name: ")).trim();
  } finally {
    prompt.close();
  }
  if (!isValidEmployeeNo(employeeNo)) {
    throw new Error("Employee number must contain 1-32 letters, numbers, underscores, or hyphens");
  }
  if (!displayName || displayName.length > 80) {
    throw new Error("Employee name must contain 1-80 characters");
  }

  const password = await readHiddenPassword();
  const passwordHash = await hashPassword(password);
  await mongoose.connect(localMongoUri, { serverSelectionTimeoutMS: 10000 });
  await Employee.updateOne(
    { employeeNo },
    { $set: { displayName, passwordHash } },
    { upsert: true, runValidators: true },
  );
  console.info(`Employee ${employeeNo} (${displayName}) added or updated in the local database`);
}

main()
  .catch((error) => {
    console.error("Unable to add employee:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
