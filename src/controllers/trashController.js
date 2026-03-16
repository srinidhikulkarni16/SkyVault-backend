const supabase = require("../config/supabaseClient");

exports.getTrash = async (req, res) => {
  try {
    const [files, folders] = await Promise.all([
      supabase.from("files").select("*").eq("owner_id", req.user.id).eq("is_deleted", true),
      supabase.from("folders").select("*").eq("owner_id", req.user.id).eq("is_deleted", true)
    ]);
    res.json({ files: files.data, folders: folders.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.restoreItem = async (req, res) => {
  try {
    const { type, id } = req.body;
    const table = type === 'file' ? 'files' : 'folders';

    const { error } = await supabase
      .from(table)
      .update({ is_deleted: false, deleted_at: null })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (error) return res.status(400).json(error);
    res.json({ message: "Item restored successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.permanentDelete = async (req, res) => {
  try {
    const { type, id } = req.params;
    const table = type === 'file' ? 'files' : 'folders';

    if (type === 'file') {
      const { data: file } = await supabase.from("files").select("storage_path").eq("id", id).single();
      if (file) await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET).remove([file.storage_path]);
    }

    const { error } = await supabase.from(table).delete().eq("id", id).eq("owner_id", req.user.id);
    if (error) return res.status(400).json(error);
    res.json({ message: "Permanently deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};