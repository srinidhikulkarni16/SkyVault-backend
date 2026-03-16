const supabase = require("../config/supabaseClient");

/* ---------------- CREATE FOLDER ---------------- */
const createFolder = async (req, res) => {
  try {
    const { name, parent_id } = req.body;

    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: "Folder name is required" });
    }

    // Verify parent folder exists if parent_id provided
    if (parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parent_id)
        .eq("owner_id", req.user.id)
        .eq("is_deleted", false)
        .single();

      if (parentError || !parent) {
        return res.status(404).json({ message: "Parent folder not found or no permission" });
      }
    }

    // Check for duplicate name in same parent
    const { data: existing } = await supabase
      .from("folders")
      .select("id")
      .eq("name", name.trim())
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .eq("parent_id", parent_id || null)
      .single();

    if (existing) {
      return res.status(409).json({ message: "A folder with this name already exists in this location" });
    }

    // Create folder
    const { data, error } = await supabase
      .from("folders")
      .insert([{
        name: name.trim(),
        parent_id: parent_id || null,
        owner_id: req.user.id,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) return res.status(400).json(error);

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ---------------- GET FOLDERS ---------------- */
const getFolders = async (req, res) => {
  try {
    const { parent_id } = req.query;

    let query = supabase
      .from("folders")
      .select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .order("name", { ascending: true });

    if (parent_id !== undefined) {
      if (parent_id === 'root' || parent_id === '') {
        query = query.is("parent_id", null);
      } else {
        query = query.eq("parent_id", parent_id);
      }
    }

    const { data, error } = await query;
    if (error) return res.status(400).json(error);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ---------------- EXPORT CONTROLLERS ---------------- */
module.exports = {
  createFolder,
  getFolders
};