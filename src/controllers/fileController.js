const supabase = require("../config/supabaseClient");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "drive";

/*  UPLOAD FILE */
const uploadFile = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;
    const folderId = req.body.folder_id || null;

    if (!file) return res.status(400).json({ message: "No file uploaded" });

    // Validate target folder
    if (folderId) {
      const { data: folder } = await supabase
        .from("folders")
        .select("id")
        .eq("id", folderId)
        .eq("owner_id", userId)
        .eq("is_deleted", false)
        .single();
      if (!folder) return res.status(404).json({ message: "Target folder not found" });
    }

    // Generate unique storage key and path
    const ext = file.originalname.includes('.') ? '.' + file.originalname.split('.').pop() : '';
    const storageKey = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const storagePath = `${BUCKET}/${storageKey}`; // required by schema

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return res.status(500).json({ message: "Storage upload failed", detail: uploadError.message });
    }

    // Insert DB record
    const { data, error } = await supabase
      .from("files")
      .insert([{
        name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        storage_key: storageKey,
        storage_path: storagePath,
        owner_id: userId,
        folder_id: folderId
      }])
      .select()
      .single();

    if (error) {
      // Rollback storage if DB insert fails
      await supabase.storage.from(BUCKET).remove([storageKey]);
      return res.status(400).json({ message: error.message });
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/*  GET FILES */
const getFiles = async (req, res) => {
  try {
    const { folder_id } = req.query;
    let query = supabase.from("files").select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    query = folder_id ? query.eq("folder_id", folder_id) : query.is("folder_id", null);

    const { data, error } = await query;
    if (error) return res.status(400).json({ message: error.message });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/*  GET RECENT FILES */
const getRecentFiles = async (req, res) => {
  try {
    const { data, error } = await supabase.from("files").select("*")
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) return res.status(400).json({ message: error.message });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/*  RENAME FILE  PATCH /files/:id/rename */
const renameFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "File name required" });

    const { data, error } = await supabase.from("files")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });
    if (!data) return res.status(404).json({ message: "File not found" });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/*  MOVE FILE  PATCH /files/:id/move */
const moveFile = async (req, res) => {
  try {
    const { id } = req.params;
    const folderId = req.body.folder_id !== undefined ? req.body.folder_id : null;

    if (folderId) {
      const { data: folder } = await supabase.from("folders")
        .select("id")
        .eq("id", folderId)
        .eq("owner_id", req.user.id)
        .eq("is_deleted", false)
        .single();
      if (!folder) return res.status(404).json({ message: "Target folder not found" });
    }

    const { data, error } = await supabase.from("files")
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false)
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });
    if (!data) return res.status(404).json({ message: "File not found" });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/*  DELETE FILE (soft) */
const deleteFile = async (req, res) => {
  try {
    const { error } = await supabase.from("files")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("owner_id", req.user.id)
      .eq("is_deleted", false);
    if (error) return res.status(400).json({ message: error.message });
    res.json({ message: "File moved to trash" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/*  DOWNLOAD FILE */
const downloadFile = async (req, res) => {
  try {
    const { data: file, error } = await supabase.from("files")
      .select("*")
      .eq("id", req.params.id)
      .eq("is_deleted", false)
      .single();

    if (error || !file) return res.status(404).json({ message: "File not found" });

    const storageKey = file.storage_key || file.storage_path;
    if (!storageKey) return res.status(500).json({ message: "File storage key missing" });

    const { data: signed, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, 3600);

    if (urlError) return res.status(500).json({ message: "Failed to generate download URL" });

    res.json({ url: signed.signedUrl, fileName: file.name, size: file.size_bytes, mimeType: file.mime_type });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { uploadFile, getFiles, getRecentFiles, renameFile, moveFile, deleteFile, downloadFile };