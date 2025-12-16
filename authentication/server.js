const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Atlas connection
const MONGO_URI = "mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/SpecMatch";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  firebaseUID: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  provider: { type: String, required: true },
  currentLaptop: {
    company: { type: String, default: "" },
    generation: { type: String, default: "" },
    core: { type: String, default: "" },
    ram: { type: String, default: "" },
    ssd: { type: String, default: "" },
    graphicsCard: { type: String, default: "" }
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// Save or update user endpoint
app.post("/save-user", async (req, res) => {
  try {
    const { firebaseUID, email, name, provider, currentLaptop, createdAt } = req.body;
    
    // Check if user already exists, if so update, otherwise create new
    const user = await User.findOneAndUpdate(
      { firebaseUID: firebaseUID },
      { email, name, provider, currentLaptop, createdAt },
      { upsert: true, new: true }
    );
    
    res.send({ success: true, user });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Get user by Firebase UID
app.get("/get-user/:uid", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUID: req.params.uid });
    if (user) {
      res.send({ success: true, user });
    } else {
      res.status(404).send({ success: false, error: "User not found" });
    }
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Update user laptop specs
app.put("/update-laptop/:uid", async (req, res) => {
  try {
    const { currentLaptop } = req.body;
    const user = await User.findOneAndUpdate(
      { firebaseUID: req.params.uid },
      { currentLaptop },
      { new: true }
    );
    if (user) {
      res.send({ success: true, user });
    } else {
      res.status(404).send({ success: false, error: "User not found" });
    }
  } catch (error) {
    console.error("Error updating laptop:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.listen(5000, () => console.log("Backend running"));
