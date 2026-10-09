require("dotenv").config();

const app = require("./server");
const { initDB } = require("./db/initDB");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Cuure Meta bot running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  }
}

startServer();