const supabase = require("../config/supabaseClient");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "drive";

/*  GET TRASH */
// Returns a flat array: [...files, ...folders] each with a `type` field
exports.getTrash = async (req, res) => {
  try {
    const userId = req.user.id;

    const [filesRes, foldersRes] = await Promise.all([
      supabase.from("files").select("*").eq("owner_id", userId).eq("is_deleted", true).order("deleted_at", { ascending: false }),
      supabase.from("folders").select("*").eq("owner_id", userId).eq("is_deleted", true).order("deleted_at", { ascending: false }),
    ]);

    const files   = (filesRes.data   || []).map((f) => ({ ...f, type: "file" }));
    const folders = (foldersRes.data || []).map((f) => ({ ...f, type: "folder" }));

    // Flat array sorted by deleted_at descending
    const items = [...files, ...folders].sort(
      (a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0)
    );

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  RESTORE ITEM */
// Frontend sends: { resource_type: 'file'|'folder', resource_id: uuid }
exports.restoreItem = async (req, res) => {
  try {
    const userId = req.user.id;
    // Support both naming conventions
    const type = req.body.resource_type || req.body.type;
    const id   = req.body.resource_id   || req.body.id;

    if (!type || !id) return res.status(400).json({ message: "resource_type and resource_id required" });

    const table = type === "file" ? "files" : "folders";

    const { error } = await supabase
      .from(table)
      .update({ is_deleted: false, deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", userId)
      .eq("is_deleted", true);

    if (error) return res.status(400).json({ message: error.message });
    res.json({ message: "Item restored successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  PERMANENT DELETE */
exports.permanentDelete = async (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;
    const table  = type === "file" ? "files" : "folders";

    // Verify ownership
    const { data: item } = await supabase
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("owner_id", userId)
      .single();

    if (!item) return res.status(404).json({ message: "Item not found" });

    // If file, remove from storage first
    if (type === "file") {
      const storageKey = item.storage_key || item.storage_path;
      if (storageKey) {
        await supabase.storage.from(BUCKET).remove([storageKey]);
      }
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .eq("owner_id", userId);

    if (error) return res.status(400).json({ message: error.message });
    res.json({ message: "Permanently deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  EMPTY TRASH */
exports.emptyTrash = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all deleted files to remove from storage
    const { data: files } = await supabase
      .from("files")
      .select("storage_key, storage_path")
      .eq("owner_id", userId)
      .eq("is_deleted", true);

    // Remove all from storage
    if (files && files.length > 0) {
      const keys = files.map((f) => f.storage_key || f.storage_path).filter(Boolean);
      if (keys.length > 0) {
        await supabase.storage.from(BUCKET).remove(keys);
      }
    }

    // Delete from DB
    await Promise.all([
      supabase.from("files").delete().eq("owner_id", userId).eq("is_deleted", true),
      supabase.from("folders").delete().eq("owner_id", userId).eq("is_deleted", true),
    ]);

    res.json({ message: "Trash emptied" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};