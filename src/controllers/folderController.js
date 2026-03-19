const supabase = require("../config/supabaseClient");

/* ── CREATE FOLDER ───────────────────────────────────────────────────────────*/
const createFolder = async (req, res) => {
  try {
    const { name, parent_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Folder name is required" });

    if (parent_id) {
      const { data: parent } = await supabase.from("folders").select("id")
        .eq("id", parent_id).eq("owner_id", req.user.id).eq("is_deleted", false).single();
      if (!parent) return res.status(404).json({ message: "Parent folder not found" });
    }

    // Duplicate name check
    const { data: existing } = await supabase.from("folders").select("id")
      .eq("name", name.trim()).eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .is("parent_id", parent_id || null).single();
    if (existing) return res.status(409).json({ message: "A folder with this name already exists here" });

    const { data, error } = await supabase.from("folders")
      .insert([{ name: name.trim(), parent_id: parent_id || null, owner_id: req.user.id }])
      .select().single();

    if (error) return res.status(400).json({ message: error.message });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── GET FOLDERS ─────────────────────────────────────────────────────────────*/
const getFolders = async (req, res) => {
  try {
    const { parent_id } = req.query;

    let query = supabase.from("folders").select("*")
      .eq("owner_id", req.user.id).eq("is_deleted", false)
      .order("name", { ascending: true });

    if (parent_id && parent_id !== 'root') query = query.eq("parent_id", parent_id);
    else                                   query = query.is("parent_id", null);

    const { data, error } = await query;
    if (error) return res.status(400).json({ message: error.message });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── RENAME FOLDER  PATCH /folders/:id/rename ────────────────────────────────*/
const renameFolder = async (req, res) => {
  try {
    const { id }   = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Folder name is required" });

    // Get current folder
    const { data: folder } = await supabase.from("folders").select("*")
      .eq("id", id).eq("owner_id", req.user.id).eq("is_deleted", false).single();
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    // Duplicate check in same parent
    const { data: existing } = await supabase.from("folders").select("id")
      .eq("name", name.trim()).eq("owner_id", req.user.id).eq("is_deleted", false)
      .is("parent_id", folder.parent_id).neq("id", id).single();
    if (existing) return res.status(409).json({ message: "A folder with this name already exists here" });

    const { data, error } = await supabase.from("folders")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id).select().single();

    if (error) return res.status(400).json({ message: error.message });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── MOVE FOLDER  PATCH /folders/:id/move ────────────────────────────────────*/
const moveFolder = async (req, res) => {
  try {
    const { id }      = req.params;
    const { parent_id } = req.body; // null = move to root

    if (parent_id === id) return res.status(400).json({ message: "Cannot move folder into itself" });

    const { data: folder } = await supabase.from("folders").select("*")
      .eq("id", id).eq("owner_id", req.user.id).eq("is_deleted", false).single();
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    if (parent_id) {
      const { data: parent } = await supabase.from("folders").select("id")
        .eq("id", parent_id).eq("owner_id", req.user.id).eq("is_deleted", false).single();
      if (!parent) return res.status(404).json({ message: "Target folder not found" });

      // Cycle check
      if (await checkIsDescendant(id, parent_id)) {
        return res.status(400).json({ message: "Cannot move a folder into its own subfolder" });
      }
    }

    const { data, error } = await supabase.from("folders")
      .update({ parent_id: parent_id || null, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();

    if (error) return res.status(400).json({ message: error.message });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── DELETE FOLDER (soft) ────────────────────────────────────────────────────*/
const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: folder } = await supabase.from("folders").select("id")
      .eq("id", id).eq("owner_id", userId).eq("is_deleted", false).single();
    if (!folder) return res.status(404).json({ message: "Folder not found" });

    const now = new Date().toISOString();

    // Soft delete folder
    await supabase.from("folders")
      .update({ is_deleted: true, deleted_at: now }).eq("id", id);

    // Soft delete files inside
    await supabase.from("files")
      .update({ is_deleted: true, deleted_at: now })
      .eq("folder_id", id).eq("owner_id", userId);

    // Soft delete child folders (one level — recursive handled by DB cascade or cron)
    await supabase.from("folders")
      .update({ is_deleted: true, deleted_at: now })
      .eq("parent_id", id).eq("owner_id", userId);

    res.json({ message: "Folder moved to trash" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ── Helper: cycle detection ─────────────────────────────────────────────────*/
async function checkIsDescendant(folderId, targetId) {
  let currentId = targetId;
  const visited = new Set();
  while (currentId) {
    if (visited.has(currentId)) break; // prevent infinite loop on corrupt data
    visited.add(currentId);
    if (currentId === folderId) return true;
    const { data } = await supabase.from("folders").select("parent_id").eq("id", currentId).single();
    currentId = data?.parent_id;
  }
  return false;
}

module.exports = { createFolder, getFolders, renameFolder, moveFolder, deleteFolder };