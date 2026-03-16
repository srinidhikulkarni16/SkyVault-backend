const bcrypt = require("bcrypt");
const supabase = require("../config/supabaseClient");
const generateToken = require("../utils/jwt");

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  try {
    const { token } = req.body; // Token received from Frontend (Google Login)
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const { email, name, sub: googleId } = ticket.getPayload();

    // Check if user exists
    let { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    // If not, create them (password_hash is random for OAuth users)
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([{ 
          email, 
          name, 
          password_hash: `oauth_${googleId}` // Placeholder
        }])
        .select().single();
      user = newUser;
    }

    const jwtToken = generateToken(user.id);
    res.json({ user, token: jwtToken });
  } catch (err) {
    res.status(401).json({ message: "Google authentication failed" });
  }
};

exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (existingUser) return res.status(409).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ email: email.toLowerCase(), name, password_hash: hash }])
      .select()
      .single();

    if (error) return res.status(400).json(error);

    const token = generateToken(data.id);
    const { password_hash, ...user } = data;

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !user) return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user.id);
    const { password_hash, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, created_at")
      .eq("id", req.user.id)
      .single();

    if (error) return res.status(404).json({ message: "User not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};